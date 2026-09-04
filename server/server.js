// server.js
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const uploadRoutes = require('./routes/upload');
const reconcileRoutes = require('./routes/reconcile');
const reportRoutes = require('./routes/report');
const escalateRoutes = require('./routes/escalate');

const app = express();

// CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4200'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper function to parse evidence
function parseEvidence(evidence) {
  if (!evidence) return [];
  try {
    if (Array.isArray(evidence)) return evidence;
    if (typeof evidence === 'string') {
      try {
        const parsed = JSON.parse(evidence.replace(/\\"/g, '"'));
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return [evidence];
      }
    }
    return [String(evidence)];
  } catch (error) {
    return [String(evidence)];
  }
}

// ==================== PROFESSIONAL EMAIL GENERATOR ====================

function generateProfessionalEmail(record, party, evidence, customMessage) {
  const recordTypeLabel = record.record_type === 'sales' ? 'Invoice' : 'Purchase Order';
  const amount = typeof party?.amount === 'number' ? party.amount.toFixed(2) : party?.amount || 'N/A';
  
  let dueDateFormatted = 'Not specified';
  if (party?.due_date) {
    try {
      const date = new Date(party.due_date);
      if (!isNaN(date.getTime())) {
        dueDateFormatted = date.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });
      }
    } catch (e) {
      dueDateFormatted = party.due_date;
    }
  }
  
  const statusMap = {
    partial_payment: 'partially paid',
    pending: 'pending payment',
    overdue: 'overdue',
    exception: 'flagged for your review',
    matched: 'fully reconciled'
  };
  
  const statusText = statusMap[record.status] || record.status.replace('_', ' ');
  
  const evidenceList = evidence.map(e => {
    let cleaned = e.replace(/^["']+|["']+$/g, '').trim();
    cleaned = cleaned.replace(/\\/g, '');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  });

  let emailBody = `
I hope this email finds you well.

We are writing to follow up regarding ${recordTypeLabel} ${record.record_id} for ₹${amount}, which is currently ${statusText} in our records.`;

  if (record.status === 'partial_payment') {
    emailBody += `\n\nA partial payment has been received, but the full amount is yet to be settled.`;
  } else if (record.status === 'overdue') {
    emailBody += `\n\nThis ${recordTypeLabel.toLowerCase()} was due on ${dueDateFormatted} and remains unpaid.`;
  } else if (record.status === 'pending') {
    emailBody += `\n\nWe are awaiting payment for this ${recordTypeLabel.toLowerCase()}.`;
  } else if (record.status === 'exception') {
    emailBody += `\n\nThis ${recordTypeLabel.toLowerCase()} requires your attention and verification.`;
  }

  if (customMessage && customMessage.trim()) {
    emailBody += `\n\n${customMessage.trim()}`;
  } else {
    emailBody += `\n\nWe kindly request you to review the status of this ${recordTypeLabel.toLowerCase()} and confirm the payment details at your earliest convenience.`;
  }

  if (evidenceList.length > 0) {
    emailBody += `\n\nFor your reference, here are the key details from our records:\n`;
    evidenceList.forEach((e, i) => {
      emailBody += `${i + 1}. ${e}\n`;
    });
  }

  emailBody += `\n\nSummary:\n• Amount: ₹${amount}\n• Due Date: ${dueDateFormatted}`;

  if (record.recommended_action && 
      record.recommended_action !== 'None — fully reconciled.' &&
      record.recommended_action !== 'Auto-matched - No action required') {
    emailBody += `\n\nRecommended Action: ${record.recommended_action}`;
  }

  emailBody += `

We appreciate your prompt attention to this matter. Should you have any questions or require further clarification, please do not hesitate to contact us.

We look forward to your response.

Yours sincerely,
FinPilot Finance Team
`;

  return emailBody.trim();
}

// ==================== REGISTER ROUTES ====================
app.use('/api', uploadRoutes);
app.use('/api', reconcileRoutes);
app.use('/api', reportRoutes);
app.use('/api', escalateRoutes);

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ==================== OAUTH2 CALLBACK ====================
// Handle OAuth2 callback from Google
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
            .error { color: #dc2626; font-size: 48px; }
          </style>
        </head>
        <body>
          <div class="error">❌</div>
          <h1>Authorization Failed</h1>
          <p>No authorization code received from Google.</p>
          <p><a href="/api/health">Go back to home</a></p>
        </body>
      </html>
    `);
  }

  try {
    const { google } = require('googleapis');
    const fs = require('fs');
    
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/oauth2callback'
    );
    
    const { tokens } = await oAuth2Client.getToken(code);
    
    // Save refresh token to .env
    if (tokens.refresh_token) {
      let envContent = fs.readFileSync('.env', 'utf8');
      if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
        envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      } else {
        envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
      }
      fs.writeFileSync('.env', envContent);
      console.log('✅ Refresh token saved to .env file!');
    }
    
    res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
            .success { color: #16a34a; font-size: 48px; }
            .box { 
              background: #f0fdf4; 
              border: 1px solid #bbf7d0; 
              border-radius: 12px; 
              padding: 30px; 
              max-width: 500px; 
              margin: 30px auto; 
            }
          </style>
        </head>
        <body>
          <div class="box">
            <div class="success">✅</div>
            <h1>Authorization Successful!</h1>
            <p>Your Gmail API has been authorized.</p>
            <p style="font-size: 14px; color: #6b7280;">
              Refresh token has been saved to your .env file.
            </p>
            <p style="margin-top: 20px;">
              <a href="/api/health" style="color: #2563eb; text-decoration: none;">✅ Server is running</a>
            </p>
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
            .error { color: #dc2626; font-size: 48px; }
          </style>
        </head>
        <body>
          <div class="error">❌</div>
          <h1>Authorization Failed</h1>
          <p>Error: ${error.message}</p>
          <p><a href="/api/health">Go back to home</a></p>
        </body>
      </html>
    `);
  }
});

// ==================== DIRECT FOLLOW-UP ROUTES ====================

// POST /api/escalate/followup/preview/:exceptionId
app.post('/api/escalate/followup/preview/:exceptionId', async (req, res) => {
  try {
    const pool = require('./db/connection');
    const { exceptionId } = req.params;
    const { customMessage } = req.body;
    
    console.log(`📄 Generating preview for exception ${exceptionId}`);
    
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Exception not found' });
    }
    
    const record = rows[0];
    const evidence = parseEvidence(record.evidence);
    
    let party = null;
    try {
      if (record.record_type === 'sales') {
        const [partyRows] = await pool.query(
          `SELECT 
            s.customer_id as party_id,
            s.customer_name as party_name,
            s.amount,
            s.due_date
           FROM sales s
           WHERE s.invoice_id = ?`,
          [record.record_id]
        );
        party = partyRows[0] || null;
      } else if (record.record_type === 'purchases' || record.record_type === 'purchase') {
        const [partyRows] = await pool.query(
          `SELECT 
            pu.vendor_id as party_id,
            pu.vendor_name as party_name,
            pu.amount,
            pu.due_date
           FROM purchases pu
           WHERE pu.purchase_id = ?`,
          [record.record_id]
        );
        party = partyRows[0] || null;
      }
    } catch (err) {
      console.error('Error fetching party:', err.message);
    }
    
    if (!party) {
      return res.status(404).json({ error: 'Party details not found' });
    }
    
    const emailBody = generateProfessionalEmail(record, party, evidence, customMessage);
    
    const recordTypeLabel = record.record_type === 'sales' ? 'Invoice' : 'Purchase Order';
    const statusDisplay = record.status.replace('_', ' ').toUpperCase();
    const subject = `Follow-up: ${recordTypeLabel} ${record.record_id} - ${statusDisplay}`;
    
    const clientEmail = 'jayesh.22210630@viit.ac.in';
    
    const fullEmail = `Dear ${party.party_name},

${emailBody}

---
This is an automated communication from FinPilot. Please reply directly to this email.
    `.trim();

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

// POST /api/escalate/followup/:exceptionId
app.post('/api/escalate/followup/:exceptionId', async (req, res) => {
  try {
    const pool = require('./db/connection');
    const { exceptionId } = req.params;
    const { customMessage } = req.body;
    
    console.log(`📧 Sending follow-up for exception ${exceptionId}`);
    
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Exception not found' });
    }
    
    const record = rows[0];
    const evidence = parseEvidence(record.evidence);
    
    let party = null;
    try {
      if (record.record_type === 'sales') {
        const [partyRows] = await pool.query(
          `SELECT 
            s.customer_id as party_id,
            s.customer_name as party_name,
            s.amount,
            s.due_date
           FROM sales s
           WHERE s.invoice_id = ?`,
          [record.record_id]
        );
        party = partyRows[0] || null;
      } else if (record.record_type === 'purchases' || record.record_type === 'purchase') {
        const [partyRows] = await pool.query(
          `SELECT 
            pu.vendor_id as party_id,
            pu.vendor_name as party_name,
            pu.amount,
            pu.due_date
           FROM purchases pu
           WHERE pu.purchase_id = ?`,
          [record.record_id]
        );
        party = partyRows[0] || null;
      }
    } catch (err) {
      console.error('Error fetching party:', err.message);
    }
    
    if (!party) {
      return res.status(404).json({ error: 'Party details not found' });
    }
    
    const emailBody = generateProfessionalEmail(record, party, evidence, customMessage);
    
    const recordTypeLabel = record.record_type === 'sales' ? 'Invoice' : 'Purchase Order';
    const statusDisplay = record.status.replace('_', ' ').toUpperCase();
    const subject = `Follow-up: ${recordTypeLabel} ${record.record_id} - ${statusDisplay}`;
    
    const fullEmail = `Dear ${party.party_name},

${emailBody}

---
This is an automated communication from FinPilot. Please reply directly to this email.
    `.trim();

    const clientEmail = 'jayesh.22210630@viit.ac.in';

    const transporter = nodemailer.createTransport({
      service: process.env.SMTP_SERVICE || 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: clientEmail,
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
      exceptionId: exceptionId,
      customMessage: customMessage || 'No custom message provided',
      party: {
        name: party.party_name,
        email: clientEmail
      },
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Follow-up error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/escalate/followup/reply/:exceptionId
app.post('/api/escalate/followup/reply/:exceptionId', async (req, res) => {
  try {
    const pool = require('./db/connection');
    const { exceptionId } = req.params;
    const { reply, status } = req.body;
    
    console.log(`📝 Recording reply for exception ${exceptionId}`);
    
    const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Exception not found' });
    }
    
    const record = rows[0];
    const evidence = parseEvidence(record.evidence);
    
    let newStatus = record.status;
    let updatedEvidence = [...evidence];
    
    if (status === 'confirmed_paid') {
      newStatus = 'matched';
      updatedEvidence.push(`✅ Customer confirmed payment: ${reply || 'Payment confirmed'}`);
    } else if (status === 'confirmed_unpaid') {
      newStatus = 'overdue';
      updatedEvidence.push(`❌ Customer confirmed not paid: ${reply || 'Payment not made'}`);
    } else {
      updatedEvidence.push(`📝 Customer replied: ${reply || 'Need clarification'}`);
    }
    
    await pool.query(
      `UPDATE exceptions 
       SET status = ?,
           followup_reply = ?,
           followup_reply_at = NOW(),
           followup_status = 'replied',
           evidence = ?
       WHERE id = ?`,
      [newStatus, reply || 'No reply provided', JSON.stringify(updatedEvidence), exceptionId]
    );
    
    res.json({
      success: true,
      message: 'Reply recorded successfully',
      exceptionId: exceptionId,
      new_status: newStatus,
      reply: reply,
      status: status || 'confirmed_paid'
    });
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/escalate/followup/tracking
app.get('/api/escalate/followup/tracking', async (req, res) => {
  try {
    const pool = require('./db/connection');
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

// ==================== EMAIL WATCHER ====================
// Only start if OAuth credentials are configured
if (process.env.GOOGLE_CLIENT_ID && 
    process.env.GOOGLE_CLIENT_SECRET && 
    process.env.GOOGLE_REFRESH_TOKEN) {

  const emailWatcher = require('./services/emailWatcher');

  // Check for email replies every 2 minutes
  setInterval(() => {
    emailWatcher.checkForReplies();
  }, 2 * 60 * 1000);

  // Initial check after 30 seconds
  setTimeout(() => {
    emailWatcher.checkForReplies();
  }, 30000);

  console.log('📧 Email watcher started (checking every 2 minutes)');
} else {
  console.log('⚠️ Gmail OAuth not configured. Email reply tracking disabled.');
  console.log('   To enable: Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to .env');
}

// ==================== CRON JOBS ====================
const followupScheduler = require('./services/followupScheduler');

// Check for promised payments every 6 hours
setInterval(() => {
  followupScheduler.checkPromisedPayments();
}, 6 * 60 * 60 * 1000);

// Initial check after 1 minute
setTimeout(() => {
  followupScheduler.checkPromisedPayments();
}, 60000);

console.log('⏰ Follow-up scheduler started');

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 FinPilot server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoints:`);
  console.log(`   POST /api/upload/:type`);
  console.log(`   POST /api/reconcile?type=sales|purchases`);
  console.log(`   GET  /api/report/summary`);
  console.log(`   GET  /api/report/exceptions`);
  console.log(`   GET  /api/report/ca-export`);
  console.log(`   POST /api/escalate/:exceptionId`);
  console.log(`   GET  /api/escalate/:exceptionId`);
  console.log(`   POST /api/escalate/followup/preview/:exceptionId`);
  console.log(`   POST /api/escalate/followup/:exceptionId`);
  console.log(`   POST /api/escalate/followup/reply/:exceptionId`);
  console.log(`   GET  /api/escalate/followup/tracking`);
  console.log(`   GET  /api/health`);
});