// services/groqTier.js
const pool = require('../db/connection');

async function classifyRecord(record, candidate) {
  try {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dddddd') {
      console.log('⚠️ No Groq API key found');
      return getFallbackDecision(record, candidate);
    }

    // Build context for Groq
    const invoiceId = record.invoice_id || record.purchase_id;
    const amount = parseFloat(record.amount);
    const dueDate = record.due_date || record.invoice_date;
    const partyId = record.customer_id || record.vendor_id;
    
    const paymentInfo = candidate ? {
      payment_id: candidate.payment_id,
      amount: parseFloat(candidate.amount),
      reference_id: candidate.reference_id || 'None',
      payment_date: candidate.payment_date,
      raw_note: candidate.raw_note || 'No note'
    } : null;

    const prompt = `
You are a financial reconciliation assistant. Analyze this payment and make a DECISION.

INVOICE:
- ID: ${invoiceId}
- Amount: ₹${amount}
- Due Date: ${dueDate || 'Not specified'}

${paymentInfo ? `
PAYMENT FOUND:
- ID: ${paymentInfo.payment_id}
- Amount: ₹${paymentInfo.amount}
- Reference: ${paymentInfo.reference_id}
- Date: ${paymentInfo.payment_date}
- Note: ${paymentInfo.raw_note}
` : `
PAYMENT: No matching payment found
`}

ANALYZE:
1. If payment amount MATCHES invoice amount exactly → status: "matched"
2. If payment amount is CLOSE (within 10%) but not exact → status: "partial_payment"  
3. If no payment and DUE DATE PASSED → status: "overdue"
4. If no payment and DUE DATE NOT PASSED → status: "pending"
5. If payment exists but reference is missing → status: "exception"

DECISION RULES:
- CONFIDENT: if you are 85%+ sure
- AMBIGUOUS: if confidence is 60-84%
- UNCLEAR: if confidence is below 60%

Return ONLY JSON:
{
  "decision": "CONFIDENT",
  "status": "partial_payment",
  "reasoning": "Payment amount is close but not exact. Customer paid 97% of invoice.",
  "confidence": 85
}
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
            content: 'You are a financial reconciliation expert. Always return valid JSON. Make confident decisions when data supports it.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      console.error(`Groq API error: ${response.status}`);
      return getFallbackDecision(record, candidate);
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0]) {
      try {
        const content = data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          console.log(`🤖 Groq result for ${invoiceId}:`, result);
          
          // Map decision to appropriate response
          const isConfident = result.decision === 'CONFIDENT' && result.confidence >= 80;
          
          return {
            decision: result.decision || 'AMBIGUOUS',
            status: result.status || 'pending',
            reasoning: result.reasoning || 'No reasoning provided',
            confidence: result.confidence || 50,
            // If confident, provide the full classification
            ...(isConfident && {
              classification: {
                status: result.status,
                confidence: result.confidence,
                evidence: [result.reasoning || 'Groq AI analysis'],
                recommended_action: `Based on Groq analysis: ${result.reasoning}`
              }
            })
          };
        }
      } catch (e) {
        console.error('Failed to parse Groq response:', e);
        return getFallbackDecision(record, candidate);
      }
    }

    return getFallbackDecision(record, candidate);
  } catch (error) {
    console.error('Groq error:', error);
    return getFallbackDecision(record, candidate);
  }
}

function getFallbackDecision(record, candidate) {
  const amount = parseFloat(record.amount);
  const dueDate = record.due_date || record.invoice_date;
  const today = new Date().toISOString().split('T')[0];
  
  if (candidate) {
    const paidAmount = parseFloat(candidate.amount);
    const diff = Math.abs(paidAmount - amount);
    const diffPercent = diff / amount;
    
    if (diffPercent < 0.01) {
      return {
        decision: 'CONFIDENT',
        status: 'matched',
        reasoning: 'Payment amount matches invoice exactly',
        confidence: 95,
        classification: {
          status: 'matched',
          confidence: 95,
          evidence: ['Payment amount matches invoice exactly'],
          recommended_action: 'No action required - fully matched'
        }
      };
    } else if (diffPercent < 0.1) {
      return {
        decision: 'CONFIDENT',
        status: 'partial_payment',
        reasoning: `Payment amount close (${(diffPercent * 100).toFixed(1)}% difference)`,
        confidence: 85,
        classification: {
          status: 'partial_payment',
          confidence: 85,
          evidence: [`Payment amount close to invoice (${(diffPercent * 100).toFixed(1)}% difference)`],
          recommended_action: `Follow up for remaining ₹${(amount - paidAmount).toFixed(2)}`
        }
      };
    } else {
      return {
        decision: 'AMBIGUOUS',
        status: 'exception',
        reasoning: `Payment amount significantly different (${(diffPercent * 100).toFixed(1)}% difference)`,
        confidence: 60
      };
    }
  } else {
    if (dueDate && dueDate < today) {
      return {
        decision: 'CONFIDENT',
        status: 'overdue',
        reasoning: 'No payment found and invoice is overdue',
        confidence: 90,
        classification: {
          status: 'overdue',
          confidence: 90,
          evidence: ['No payment found and invoice is overdue'],
          recommended_action: 'Escalate to collections'
        }
      };
    } else {
      return {
        decision: 'CONFIDENT',
        status: 'pending',
        reasoning: 'No payment found but not overdue',
        confidence: 80,
        classification: {
          status: 'pending',
          confidence: 80,
          evidence: ['No payment found but not overdue'],
          recommended_action: 'Monitor payment status'
        }
      };
    }
  }
}

module.exports = { classifyRecord };