// routes/escalate.js
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const pool = require('../db/connection');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const ESCALATION_RULES = {
  exception: process.env.ESCALATE_TO_EXCEPTIONS || 'jayeshwakle10@gmail.com',
  overdue: process.env.ESCALATE_TO_COLLECTIONS || 'jayeshwakle10@gmail.com',
  partial_payment: process.env.ESCALATE_TO_AR || 'jayeshwakle10@gmail.com',
  matched: process.env.ESCALATE_TO_AR || 'jayeshwakle10@gmail.com',
  default: process.env.ESCALATE_DEFAULT || 'jayeshwakle10@gmail.com'
};

const VALID_ESCALATION_STATUSES = ['exception', 'overdue', 'partial_payment', 'matched'];

// Helper function to safely parse evidence
function parseEvidence(evidence) {
  if (!evidence) return [];
  
  try {
    if (Array.isArray(evidence)) return evidence;
    
    if (typeof evidence === 'string') {
      let cleaned = evidence.replace(/\\"/g, '"');
      
      try {
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return [cleaned];
      }
    }
    
    return [String(evidence)];
  } catch (error) {
    console.error('Error parsing evidence:', error);
    return [String(evidence)];
  }
}

// Get party details for follow-up
async function getPartyDetails(record) {
  try {
    if (record.record_type === 'sales') {
      const [rows] = await pool.query(
        `SELECT 
          s.customer_id as party_id,
          s.customer_name as party_name,
          p.email as party_email,
          p.phone as party_phone,
          s.amount,
          s.due_date
         FROM sales s
         JOIN parties p ON p.party_id = s.customer_id
         WHERE s.invoice_id = ?`,
        [record.record_id]
      );
      return rows[0] || null;
    }
    
    if (record.record_type === 'purchases' || record.record_type === 'purchase') {
      const [rows] = await pool.query(
        `SELECT 
          pu.vendor_id as party_id,
          pu.vendor_name as party_name,
          p.email as party_email,
          p.phone as party_phone,
          pu.amount,
          pu.due_date
         FROM purchases pu
         JOIN parties p ON p.party_id = pu.vendor_id
         WHERE pu.purchase_id = ?`,
        [record.record_id]
      );
      return rows[0] || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching party details:', error);
    return null;
  }
}

// ==================== AI-POWERED FOLLOW-UP GENERATOR ====================

async function generateFollowUpEmail(record, party, evidence, customMessage) {
  try {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dddddd') {
      console.log('⚠️ No Groq API key found, using fallback template');
      return generateFallbackEmail(record, party, evidence, customMessage);
    }

    const statusLabels = {
      matched: '✅ Fully Matched',
      partial_payment: '📊 Partial Payment',
      pending: '⏳ Pending',
      overdue: '⚠️ Overdue',
      exception: '🚨 Exception'
    };

    const recordTypeLabel = record.record_type === 'sales' ? 'Invoice' : 'Purchase Order';
    const amount = party?.amount || 'N/A';
    const dueDate = party?.due_date || 'Not specified';
    const status = record.status;
    const recommendedAction = record.recommended_action || 'Review required';

    const prompt = `
You are a professional financial reconciliation assistant. Write a clear, professional follow-up email to a customer/vendor regarding a financial transaction.

CONTEXT:
- ${recordTypeLabel} ID: ${record.record_id}
- Amount: ₹${amount}
- Due Date: ${dueDate}
- Current Status: ${statusLabels[status] || status}
- Recommended Action: ${recommendedAction}

EVIDENCE:
${evidence.map((e, i) => `${i+1}. ${e}`).join('\n')}

${customMessage ? `CUSTOM MESSAGE FROM USER: ${customMessage}` : ''}

Write a professional follow-up email that:
1. Has a clear subject line
2. Is polite and professional
3. Explains the situation clearly
4. References the evidence
5. Asks for specific action (payment confirmation, clarification, etc.)
6. Ends with a call to action

Return ONLY the email body (no subject line, no salutation, no signature - just the main content).
The tone should be professional but friendly. Be specific about amounts and dates.
`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [
          {
            role: 'system',
            content: 'You are a professional financial assistant. Write clear, professional, and actionable follow-up emails. Be specific with amounts and dates. Keep the tone professional but friendly.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      console.error(`Groq API error: ${response.status}`);
      return generateFallbackEmail(record, party, evidence, customMessage);
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0]) {
      const emailBody = data.choices[0].message.content.trim();
      console.log('🤖 AI-generated follow-up email generated successfully');
      return emailBody;
    }

    return generateFallbackEmail(record, party, evidence, customMessage);
  } catch (error) {
    console.error('AI follow-up generation error:', error);
    return generateFallbackEmail(record, party, evidence, customMessage);
  }
}

function generateFallbackEmail(record, party, evidence, customMessage) {
  const recordTypeLabel = record.record_type === 'sales' ? 'Invoice' : 'Purchase Order';
  const amount = party?.amount || 'N/A';
  const dueDate = party?.due_date || 'Not specified';
  const status = record.status.replace('_', ' ').toUpperCase();
  
  let body = `
This is a follow-up regarding ${recordTypeLabel} ${record.record_id}.

Status: ${status}
Amount: ₹${typeof amount === 'number' ? amount.toFixed(2) : amount}
Due Date: ${dueDate}

${customMessage || `Our records show this transaction is ${status}. Please review and confirm the payment status.`}

Evidence on record:
${evidence.map(e => `- ${e}`).join('\n')}

Recommended action: ${record.recommended_action || 'Please review'}

Please reply to this email with the payment status or any questions.
  `.trim();
  
  return body;
}

// ==================== FOLLOW-UP ENDPOINTS ====================

// POST /api/escalate/followup/:exceptionId
// routes/escalate.js - Updated follow-up endpoints

// POST /api/escalate/followup/:exceptionId
router.post('/followup/:exceptionId', async (req, res) => {
  const { exceptionId } = req.params;
  const { customMessage } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Exception not found' });
    }

    const record = rows[0];
    const party = await getPartyDetails(record);
    
    if (!party) {
      return res.status(404).json({ error: 'Party details not found' });
    }

    const evidence = parseEvidence(record.evidence);
    
    // Generate AI-powered email body
    const emailBody = await generateFollowUpEmail(record, party, evidence, customMessage);
    
    const subject = `Follow-up: ${record.record_type === 'sales' ? 'Invoice' : 'Purchase Order'} ${record.record_id} - ${record.status.replace('_', ' ').toUpperCase()}`;
    
    const fullEmail = `
Dear ${party.party_name},

${emailBody}

---
FinPilot - Automated Reconciliation System
This is an automated message. Please reply to this email directly.
    `.trim();

    // Use the specific client email
    const clientEmail = 'jayesh.22210630@viit.ac.in';

    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: clientEmail,  // Send to specific client email
      cc: process.env.SMTP_USER,
      subject: subject,
      text: fullEmail,
      headers: {
        'X-Followup-ID': `followup-${exceptionId}-${Date.now()}`,
        'X-Exception-ID': exceptionId.toString(),
        'X-Record-ID': record.record_id,
        'Reply-To': process.env.SMTP_USER
      }
    });

    await pool.query(
      `UPDATE exceptions 
       SET followup_sent_at = NOW(), 
           followup_sent_to = ?,
           followup_message_id = ?,
           followup_status = 'awaiting_reply'
       WHERE id = ?`,
      [clientEmail, info.messageId, exceptionId]
    );

    res.json({
      success: true,
      message: `Follow-up email sent to ${clientEmail}`,
      exception_id: exceptionId,
      party: {
        name: party.party_name,
        email: clientEmail
      },
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Follow-up error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to send follow-up email'
    });
  }
});
// routes/escalate.js - Add this endpoint

// ==================== EMAIL REPLY WEBHOOK ====================
// This endpoint receives email replies from the client
// Configure your email service to forward replies to this endpoint

router.post('/email-reply', async (req, res) => {
  try {
    const { reply, exceptionId, record_id, status } = req.body;
    
    console.log(`📧 Email reply received for exception ${exceptionId}`);
    
    // Get the exception record
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Exception not found' });
    }
    
    const record = rows[0];
    const evidence = parseEvidence(record.evidence);
    
    // Analyze the reply content
    const replyLower = reply.toLowerCase();
    let newStatus = record.status;
    let updatedEvidence = [...evidence];
    let aiAnalysis = '';
    
    // Check for payment confirmation keywords
    if (replyLower.includes('paid') || 
        replyLower.includes('payment') || 
        replyLower.includes('settled') ||
        replyLower.includes('transferred') ||
        replyLower.includes('cleared')) {
      
      // Check if it's a confirmation or a future promise
      if (replyLower.includes('will pay') || 
          replyLower.includes('will make') || 
          replyLower.includes('on ') || 
          replyLower.includes('by ')) {
        // Future payment promise
        const dateMatch = reply.match(/\b(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/i);
        const promiseDate = dateMatch ? dateMatch[1] : 'soon';
        
        newStatus = 'pending';
        updatedEvidence.push(`📅 Customer promised payment: "${reply}" (Expected by ${promiseDate})`);
        aiAnalysis = `Customer promised payment by ${promiseDate}. Follow up if not received.`;
        
        // Set a reminder in the database
        await pool.query(
          `UPDATE exceptions 
           SET followup_reply = ?,
               followup_reply_at = NOW(),
               followup_status = 'promised_payment',
               status = ?
           WHERE id = ?`,
          [`Customer promised payment: ${reply}`, 'pending', exceptionId]
        );
        
      } else {
        // Payment confirmed
        newStatus = 'matched';
        updatedEvidence.push(`✅ Customer confirmed payment: "${reply}"`);
        aiAnalysis = 'Customer confirmed payment has been made. Marking as matched.';
        
        await pool.query(
          `UPDATE exceptions 
           SET followup_reply = ?,
               followup_reply_at = NOW(),
               followup_status = 'replied',
               status = ?
           WHERE id = ?`,
          [`Customer confirmed payment: ${reply}`, 'matched', exceptionId]
        );
      }
      
    } else if (replyLower.includes('not paid') || 
               replyLower.includes('haven\'t') || 
               replyLower.includes('not yet') ||
               replyLower.includes('delay')) {
      // Not paid yet
      newStatus = 'overdue';
      updatedEvidence.push(`⚠️ Customer confirmed not paid: "${reply}"`);
      aiAnalysis = 'Customer confirmed payment not made. Escalate to collections.';
      
      await pool.query(
        `UPDATE exceptions 
         SET followup_reply = ?,
             followup_reply_at = NOW(),
             followup_status = 'replied',
             status = ?
         WHERE id = ?`,
        [`Customer confirmed not paid: ${reply}`, 'overdue', exceptionId]
      );
      
    } else if (replyLower.includes('dispute') || 
               replyLower.includes('incorrect') || 
               replyLower.includes('wrong') ||
               replyLower.includes('issue')) {
      // Dispute or issue
      newStatus = 'exception';
      updatedEvidence.push(`⚠️ Customer raised dispute: "${reply}"`);
      aiAnalysis = 'Customer raised a dispute. Needs manual review.';
      
      await pool.query(
        `UPDATE exceptions 
         SET followup_reply = ?,
             followup_reply_at = NOW(),
             followup_status = 'replied',
             status = ?
         WHERE id = ?`,
        [`Customer dispute: ${reply}`, 'exception', exceptionId]
      );
      
    } else {
      // General reply - needs manual review
      updatedEvidence.push(`📝 Customer replied: "${reply}"`);
      aiAnalysis = 'General reply received. Manual review required.';
      
      await pool.query(
        `UPDATE exceptions 
         SET followup_reply = ?,
             followup_reply_at = NOW(),
             followup_status = 'replied'
         WHERE id = ?`,
        [reply, exceptionId]
      );
    }
    
    // Update evidence
    await pool.query(
      `UPDATE exceptions 
       SET evidence = ?
       WHERE id = ?`,
      [JSON.stringify(updatedEvidence), exceptionId]
    );
    
    // Send auto-reply to customer
    const autoReply = generateAutoReply(newStatus, aiAnalysis, reply);
    const party = await getPartyDetails(record);
    
    if (party && party.party_email) {
      const transporter = nodemailer.createTransport({
        service: process.env.SMTP_SERVICE || 'gmail',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: 'jayesh.22210630@viit.ac.in', // Client email
        cc: process.env.SMTP_USER,
        subject: `Re: ${record.record_type === 'sales' ? 'Invoice' : 'Purchase Order'} ${record.record_id} - Reply Received`,
        text: autoReply
      });
    }
    
    res.json({
      success: true,
      message: 'Reply processed successfully',
      exceptionId: exceptionId,
      new_status: newStatus,
      auto_reply: autoReply
    });
    
  } catch (error) {
    console.error('Email reply error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to generate auto-reply
function generateAutoReply(status, analysis, customerReply) {
  let reply = `Thank you for your response regarding this matter.

We have received your reply and it has been recorded in our system. `;
  
  if (status === 'matched') {
    reply += `✅ We have marked this as paid. No further action is required.`;
  } else if (status === 'pending') {
    reply += `📅 We have noted your promised payment date. We will follow up if we don't receive the payment.`;
  } else if (status === 'overdue') {
    reply += `⚠️ We have noted that payment hasn't been made. Our team will reach out to resolve this.`;
  } else if (status === 'exception') {
    reply += `🔍 We have noted your concern and will review it manually. A team member will contact you shortly.`;
  } else {
    reply += `📝 We have recorded your reply and will review it.`;
  }
  
  reply += `\n\nYour reply: "${customerReply}"\n\nBest regards,\nFinPilot Finance Team`;
  
  return reply;
}
// POST /api/escalate/followup/preview/:exceptionId
router.post('/followup/preview/:exceptionId', async (req, res) => {
  const { exceptionId } = req.params;
  const { customMessage } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Exception not found' });
    }

    const record = rows[0];
    const party = await getPartyDetails(record);
    
    if (!party) {
      return res.status(404).json({ error: 'Party details not found' });
    }

    const evidence = parseEvidence(record.evidence);
    
    // Generate AI-powered email body
    const emailBody = await generateFollowUpEmail(record, party, evidence, customMessage);
    
    const subject = `Follow-up: ${record.record_type === 'sales' ? 'Invoice' : 'Purchase Order'} ${record.record_id} - ${record.status.replace('_', ' ').toUpperCase()}`;
    
    const fullEmail = `
Dear ${party.party_name},

${emailBody}

---
FinPilot - Automated Reconciliation System
This is an automated message. Please reply to this email directly.
    `.trim();

    // Use the specific client email
    const clientEmail = 'jayesh.22210630@viit.ac.in';

    res.json({
      success: true,
      exception_id: exceptionId,
      party: {
        name: party.party_name,
        email: clientEmail
      },
      subject: subject,
      email_body: fullEmail,
      email_preview: fullEmail
    });

  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to generate email preview'
    });
  }
});

// POST /api/escalate/followup/reply/:exceptionId
router.post('/followup/reply/:exceptionId', async (req, res) => {
  const { exceptionId } = req.params;
  const { reply, status } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Exception not found' });
    }

    const record = rows[0];
    
    let newStatus = record.status;
    let evidence = parseEvidence(record.evidence);
    
    if (status === 'confirmed_paid') {
      newStatus = 'matched';
      evidence.push(`✅ Customer confirmed payment: ${reply || 'Payment confirmed'}`);
    } else if (status === 'confirmed_unpaid') {
      newStatus = 'overdue';
      evidence.push(`❌ Customer confirmed not paid: ${reply || 'Payment not made'}`);
    } else {
      evidence.push(`📝 Customer replied: ${reply || 'Need clarification'}`);
    }

    await pool.query(
      `UPDATE exceptions 
       SET status = ?,
           followup_reply = ?,
           followup_reply_at = NOW(),
           followup_status = 'replied',
           evidence = ?
       WHERE id = ?`,
      [newStatus, reply || null, JSON.stringify(evidence), exceptionId]
    );

    res.json({
      success: true,
      message: 'Reply recorded successfully',
      exception_id: exceptionId,
      new_status: newStatus,
      reply: reply
    });

  } catch (error) {
    console.error('Reply recording error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/escalate/followup/tracking
router.get('/followup/tracking', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        record_id,
        record_type,
        status,
        followup_sent_at,
        followup_sent_to,
        followup_reply,
        followup_reply_at,
        followup_status,
        escalated_at,
        escalated_to
      FROM exceptions 
      WHERE followup_sent_at IS NOT NULL 
         OR escalated_at IS NOT NULL
      ORDER BY COALESCE(followup_sent_at, escalated_at) DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ORIGINAL ESCALATION ENDPOINTS ====================

// GET endpoint for testing in browser
router.get('/escalate/:exceptionId', async (req, res) => {
  try {
    const { exceptionId } = req.params;
    
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ 
        error: 'Exception not found',
        message: `No exception found with ID: ${exceptionId}`
      });
    }

    const record = rows[0];
    const evidence = parseEvidence(record.evidence);
    const party = await getPartyDetails(record);
    
    return res.json({
      message: 'This endpoint requires POST method for actual escalation',
      exception: {
        id: record.id,
        record_type: record.record_type,
        record_id: record.record_id,
        status: record.status,
        confidence: record.confidence,
        evidence: evidence,
        recommended_action: record.recommended_action,
        created_at: record.created_at,
        followup_sent_at: record.followup_sent_at,
        followup_sent_to: record.followup_sent_to,
        followup_status: record.followup_status,
        followup_reply: record.followup_reply
      },
      party: party,
      instruction: {
        method: 'POST',
        url: `/api/escalate/${exceptionId}`,
        body: {
          channels: ['email', 'whatsapp']
        }
      },
      escalation_rule: ESCALATION_RULES[record.status] || ESCALATION_RULES.default,
      is_escalatable: VALID_ESCALATION_STATUSES.includes(record.status)
    });
  } catch (err) {
    console.error('GET escalation error:', err);
    return res.status(500).json({
      error: err.message,
      details: 'Check database connection and configuration'
    });
  }
});
// POST /api/escalate/followup/preview/:exceptionId
// Generate preview of follow-up email without sending
router.post('/followup/preview/:exceptionId', async (req, res) => {
  const { exceptionId } = req.params;
  const { customMessage } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Exception not found' });
    }

    const record = rows[0];
    const party = await getPartyDetails(record);
    
    if (!party) {
      return res.status(404).json({ error: 'Party details not found' });
    }

    const evidence = parseEvidence(record.evidence);
    
    // Generate AI-powered email body (same as send function)
    const emailBody = await generateFollowUpEmail(record, party, evidence, customMessage);
    
    const subject = `Follow-up: ${record.record_type === 'sales' ? 'Invoice' : 'Purchase Order'} ${record.record_id} - ${record.status.replace('_', ' ').toUpperCase()}`;
    
    const fullEmail = `
Dear ${party.party_name},

${emailBody}

---
FinPilot - Automated Reconciliation System
This is an automated message. Please reply to this email directly.
    `.trim();

    res.json({
      success: true,
      exception_id: exceptionId,
      party: {
        name: party.party_name,
        email: party.party_email
      },
      subject: subject,
      email_body: fullEmail,
      email_preview: fullEmail.substring(0, 500) + (fullEmail.length > 500 ? '...' : '')
    });

  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to generate email preview'
    });
  }
});
// POST /api/escalate/:exceptionId
router.post('/escalate/:exceptionId', async (req, res) => {
  const { exceptionId } = req.params;
  const channels = req.body?.channels || ['email', 'whatsapp'];

  try {
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Exception not found' });
    }

    const record = rows[0];

    if (!VALID_ESCALATION_STATUSES.includes(record.status)) {
      return res.status(400).json({ 
        error: `Cannot escalate record with status: ${record.status}`,
        message: `Only ${VALID_ESCALATION_STATUSES.join(', ')} records can be escalated`,
        exception: record
      });
    }

    const recipient = ESCALATION_RULES[record.status] || ESCALATION_RULES.default;
    const evidence = parseEvidence(record.evidence);

    const results = { email: null, whatsapp: null };

    // --- Email (internal team) ---
    if (channels.includes('email')) {
      try {
        const subject = `[${record.status === 'exception' ? 'URGENT' : 'REVIEW'}] ` +
          `Reconciliation flag — ${record.record_id}`;

        const body = `
FinPilot flagged a record requiring review:

Record: ${record.record_id} (${record.record_type})
Status: ${record.status}
Confidence: ${record.confidence ?? 'N/A'}%
Resolved by: ${record.resolved_by_tier || 'N/A'} tier

Evidence checked:
${evidence.map(e => `  - ${e}`).join('\n')}

Recommended action: ${record.recommended_action || 'Review required'}

— FinPilot (autonomous finance agent)
        `.trim();

        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: recipient,
          subject,
          text: body
        });

        results.email = { sent: true, to: recipient };
        console.log(`✅ Email sent to ${recipient} for exception ${exceptionId}`);
      } catch (emailError) {
        console.error('Email error:', emailError);
        results.email = { sent: false, error: emailError.message };
      }
    }

    // --- WhatsApp (customer/vendor verification) ---
    if (channels.includes('whatsapp')) {
      try {
        const partyPhone = await getPartyPhone(record);

        if (!partyPhone) {
          results.whatsapp = { sent: false, reason: 'No phone number on file for this party' };
          console.log(`ℹ️ No phone number found for ${record.record_id}`);
        } else {
          const toNumber = formatWhatsAppNumber(partyPhone);
          if (!toNumber) {
            results.whatsapp = { sent: false, reason: 'Invalid phone number format' };
          } else {
            const body = buildWhatsAppBody(record, evidence);

            const message = await twilioClient.messages.create({
              from: process.env.TWILIO_WHATSAPP_NUMBER,
              to: toNumber,
              body
            });

            await pool.query(
              `UPDATE exceptions
               SET whatsapp_sid = ?, whatsapp_sent_to = ?, whatsapp_status = 'awaiting_reply'
               WHERE id = ?`,
              [message.sid, toNumber, exceptionId]
            );

            results.whatsapp = { sent: true, to: toNumber, sid: message.sid };
            console.log(`✅ WhatsApp sent to ${toNumber} for exception ${exceptionId}`);
          }
        }
      } catch (whatsappError) {
        console.error('WhatsApp error:', whatsappError);
        results.whatsapp = { sent: false, error: whatsappError.message };
      }
    }

    await pool.query(
      'UPDATE exceptions SET escalated_at = NOW(), escalated_to = ? WHERE id = ?',
      [recipient, exceptionId]
    );

    return res.json({
      success: true,
      exception_id: exceptionId,
      recipient,
      channels_attempted: channels,
      results,
      message: 'Escalation processed successfully'
    });

  } catch (err) {
    console.error('Escalation error:', err);
    return res.status(500).json({
      error: err.message,
      details: 'Check SMTP and Twilio credentials in .env',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

async function getPartyPhone(record) {
  try {
    if (record.record_type === 'sales') {
      const [rows] = await pool.query(
        `SELECT p.phone
         FROM sales s
         JOIN parties p ON p.party_id = s.customer_id
         WHERE s.invoice_id = ?`,
        [record.record_id]
      );
      console.log(`📞 Found phone for sales ${record.record_id}:`, rows[0]?.phone || 'Not found');
      return rows[0]?.phone || null;
    }
    
    if (record.record_type === 'purchases' || record.record_type === 'purchase') {
      const [rows] = await pool.query(
        `SELECT p.phone
         FROM purchases pu
         JOIN parties p ON p.party_id = pu.vendor_id
         WHERE pu.purchase_id = ?`,
        [record.record_id]
      );
      console.log(`📞 Found phone for purchase ${record.record_id}:`, rows[0]?.phone || 'Not found');
      return rows[0]?.phone || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching party phone:', error);
    return null;
  }
}

function formatWhatsAppNumber(rawPhone) {
  if (!rawPhone) return null;
  const digitsOnly = rawPhone.replace(/[^\d+]/g, '');
  const withPlus = digitsOnly.startsWith('+') ? digitsOnly : `+${digitsOnly}`;
  return `whatsapp:${withPlus}`;
}

function buildWhatsAppBody(record, evidence) {
  const label = record.record_type === 'sales' ? 'Invoice' : 'Purchase Order';
  const evidenceList = Array.isArray(evidence) ? evidence : [evidence];
  
  return (
    `Hi, this is an automated reconciliation check from ChandraTara ERP.\n\n` +
    `${label} *${record.record_id}* is flagged as *${record.status.toUpperCase()}*.\n\n` +
    `Details:\n${evidenceList.map(e => `• ${e}`).join('\n')}\n\n` +
    `Recommended action: ${record.recommended_action || 'Review required'}\n\n` +
    `Please reply *YES* if this payment has already been made, or *NO* if it hasn't, ` +
    `so we can update our records accordingly.`
  );
}

module.exports = router;