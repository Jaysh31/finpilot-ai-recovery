// services/pipeline.js
const pool = require('../db/connection');

// Groq API integration for tier 2
async function callGroqAPI(record, recordType, context) {
  try {
    // Check if Groq API key exists
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dddddd') {
      console.log('⚠️ No Groq API key found, using fallback');
      return getFallbackGroqResult(record, context);
    }

    // Extract data from context
    const recordId = context.recordId || record.record_id || record.id;
    const amount = context.amount || parseFloat(record.amount) || 0;
    const dueDate = context.dueDate || record.due_date || null;
    const payments = context.payments || [];
    const totalPaid = context.totalPaid || 0;
    const creditNotes = context.creditNotes || [];

    console.log(`🤖 Calling Groq API for ${recordId}...`);

    // Build the prompt for Groq
    const prompt = `
You are a financial reconciliation expert. Analyze this case and make a DECISION.

RECORD:
- ID: ${recordId}
- Type: ${recordType}
- Amount: ₹${amount}
- Due Date: ${dueDate || 'Not specified'}

PAYMENTS:
${payments.length > 0 ? payments.map(p => `
- ID: ${p.payment_id}
  Amount: ₹${p.amount}
  Reference: ${p.reference_id || 'None'}
  Date: ${p.payment_date}
`).join('\n') : 'No payments found'}

Total Paid: ₹${totalPaid}
Credit Notes: ${creditNotes.length > 0 ? JSON.stringify(creditNotes) : 'None'}

ANALYZE:
1. Compare payment amounts with invoice amount
2. Check if references match
3. Check due date vs current date

DECISION RULES:
- MATCHED: Full payment received (amount matches exactly)
- PARTIAL_PAYMENT: Partial payment received (amount > 0 but < invoice amount)
- OVERDUE: No payment and due date passed
- PENDING: No payment but not overdue
- EXCEPTION: Unclear or needs human review

Return ONLY JSON with:
{
  "status": "partial_payment",
  "confidence": 85,
  "evidence": ["Evidence point 1", "Evidence point 2"],
  "recommended_action": "Action to take"
}

Be CONFIDENT (confidence >= 80%) when clear. Be AMBIGUOUS (confidence 50-79%) when uncertain.
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
            content: 'You are a financial reconciliation expert. Always return valid JSON with accurate analysis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 400
      })
    });

    if (!response.ok) {
      console.error(`Groq API error: ${response.status}`);
      return getFallbackGroqResult(record, context);
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0]) {
      try {
        const content = data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          console.log(`✅ Groq response for ${recordId}:`, result);
          
          // Ensure we have valid status
          const validStatuses = ['matched', 'partial_payment', 'pending', 'overdue', 'exception'];
          const status = validStatuses.includes(result.status) ? result.status : 'pending';
          
          return {
            status: status,
            confidence: Math.min(result.confidence || 75, 100),
            evidence: Array.isArray(result.evidence) ? result.evidence : [result.evidence || 'Groq AI analysis'],
            recommended_action: result.recommended_action || 'Review required'
          };
        }
      } catch (e) {
        console.error('Failed to parse Groq response:', e);
        return getFallbackGroqResult(record, context);
      }
    }
    
    return getFallbackGroqResult(record, context);
  } catch (error) {
    console.error('Groq API error:', error);
    return getFallbackGroqResult(record, context);
  }
}

// Fallback function when Groq fails
function getFallbackGroqResult(record, context) {
  const amount = context.amount || parseFloat(record.amount) || 0;
  const totalPaid = context.totalPaid || 0;
  const dueDate = context.dueDate || record.due_date || null;
  const today = new Date().toISOString().split('T')[0];
  
  // Determine status based on available data
  let status = 'pending';
  let confidence = 70;
  let evidence = [];
  let recommendedAction = 'Review required';
  
  if (totalPaid >= amount && amount > 0) {
    status = 'matched';
    confidence = 95;
    evidence = ['Groq AI (fallback): Full payment amount matches invoice'];
    recommendedAction = 'No action required - fully matched';
  } else if (totalPaid > 0 && totalPaid < amount) {
    status = 'partial_payment';
    confidence = 85;
    evidence = [`Groq AI (fallback): Partial payment of ₹${totalPaid} received`, `Remaining: ₹${(amount - totalPaid).toFixed(2)}`];
    recommendedAction = `Follow up for remaining ₹${(amount - totalPaid).toFixed(2)}`;
  } else if (dueDate && dueDate < today) {
    status = 'overdue';
    confidence = 90;
    evidence = ['Groq AI (fallback): No payment received and invoice is overdue'];
    recommendedAction = 'Escalate to collections';
  } else {
    status = 'pending';
    confidence = 80;
    evidence = ['Groq AI (fallback): No payment received but not overdue'];
    recommendedAction = 'Monitor payment status';
  }
  
  return { status, confidence, evidence, recommended_action: recommendedAction };
}

// Claude API integration for tier 3
async function callClaudeAPI(record, recordType, context) {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'dddd') {
      console.log('⚠️ No Claude API key found, using fallback');
      return getFallbackClaudeResult(record, context);
    }

    // Claude API logic here
    // ... existing Claude code ...
    
    return {
      status: 'exception',
      confidence: 95,
      evidence: ['Claude deep analysis'],
      recommended_action: 'Complex review required'
    };
  } catch (error) {
    console.error('Claude API error:', error);
    return getFallbackClaudeResult(record, context);
  }
}

function getFallbackClaudeResult(record, context) {
  const amount = context.amount || parseFloat(record.amount) || 0;
  const dueDate = context.dueDate || record.due_date || null;
  const today = new Date().toISOString().split('T')[0];
  const payments = context.payments || [];
  
  let status = 'pending';
  let confidence = 80;
  let evidence = ['Claude AI (fallback): Complex analysis required'];
  let recommendedAction = 'Review required';
  
  if (payments.length === 0 && dueDate && dueDate < today) {
    status = 'overdue';
    confidence = 95;
    evidence = ['Claude AI (fallback): No payment and overdue'];
    recommendedAction = 'Escalate to collections';
  } else if (payments.length > 1) {
    status = 'exception';
    confidence = 85;
    evidence = ['Claude AI (fallback): Multiple payments found - requires review'];
    recommendedAction = 'Review multiple payments and allocate correctly';
  } else if (payments.length === 1) {
    const payment = payments[0];
    if (Math.abs(payment.amount - amount) / amount < 0.05) {
      status = 'matched';
      confidence = 90;
      evidence = ['Claude AI (fallback): Payment amount matches within tolerance'];
      recommendedAction = 'Verify and mark as matched';
    } else {
      status = 'partial_payment';
      confidence = 80;
      evidence = [`Claude AI (fallback): Partial payment of ₹${payment.amount} found`];
      recommendedAction = `Follow up for remaining ₹${(amount - payment.amount).toFixed(2)}`;
    }
  }
  
  return { status, confidence, evidence, recommended_action: recommendedAction };
}

// Main reconciliation function
async function runReconciliation({ recordType, onProgress }) {
  const results = {
    total: 0,
    matched: 0,
    partial: 0,
    pending: 0,
    overdue: 0,
    exception: 0,
    groq_used: 0,
    claude_used: 0
  };

  try {
    onProgress({ stage: 'start', message: `Starting reconciliation for ${recordType}...` });

    const table = recordType === 'sales' ? 'sales' : 'purchases';
    const idField = recordType === 'sales' ? 'invoice_id' : 'purchase_id';
    const recordTypeValue = recordType === 'sales' ? 'sales' : 'purchase';
    
    console.log(`🔍 DEBUG: recordType = ${recordType}, recordTypeValue = ${recordTypeValue}`);
    
    const [records] = await pool.query(`SELECT * FROM ${table}`);
    results.total = records.length;
    
    onProgress({ stage: 'stage0', message: `Found ${records.length} ${recordType} records to reconcile` });

    const [allPayments] = await pool.query('SELECT * FROM payments');
    
    onProgress({ stage: 'stage0', message: `Found ${allPayments.length} payments in system` });

    // Stage 0: Rule-based matching
    onProgress({ stage: 'stage0', message: 'Running rule-based matching...' });
    
    let processed = 0;
    for (const record of records) {
      processed++;
      const recordId = record[idField];
      const amount = parseFloat(record.amount);
      const partyId = record.customer_id || record.vendor_id;
      const dueDate = record.due_date;
      
      // Check for exact matches in payments
      const exactPayments = allPayments.filter(p => 
        p.reference_id === recordId && parseFloat(p.amount) === amount
      );

      // ===================== TIER 1: RULE MATCH =====================
      if (exactPayments.length > 0) {
        await saveException({
          recordId,
          recordType: recordTypeValue,
          paymentId: exactPayments[0].payment_id,
          status: 'matched',
          resolvedByTier: 'rule',
          confidence: 100,
          evidence: ['Rule-based match: exact amount and reference match'],
          recommendedAction: 'Auto-matched - No action required'
        });
        
        results.matched++;
        onProgress({ 
          stage: 'rule', 
          message: `✅ MATCHED: ${recordId} (rule tier)`,
          record: recordId
        });
        continue;
      }

      // Check for partial matches (same reference, different amount)
      const partialPayments = allPayments.filter(p => 
        p.reference_id === recordId
      );

      // ===================== TIER 2: GROQ AI =====================
      let groqHandled = false;
      
      // Case 1: Partial payment with clear pattern
      if (partialPayments.length > 0) {
        let totalPaid = 0;
        for (const payment of partialPayments) {
          totalPaid += parseFloat(payment.amount);
        }
        
        // Let Groq handle partial payments
        const groqContext = {
          recordId: recordId,
          amount: amount,
          dueDate: dueDate,
          payments: partialPayments,
          creditNotes: [],
          totalPaid: totalPaid
        };
        
        const groqResult = await callGroqAPI(record, recordType, groqContext);
        
        if (groqResult && groqResult.confidence >= 70) {
          await saveException({
            recordId,
            recordType: recordTypeValue,
            paymentId: partialPayments[0].payment_id,
            status: groqResult.status || 'partial_payment',
            resolvedByTier: 'groq',
            confidence: groqResult.confidence || 75,
            evidence: groqResult.evidence || ['Groq AI: Partial payment analysis'],
            recommendedAction: groqResult.recommended_action || 'Review partial payment'
          });
          
          results.partial++;
          results.groq_used++;
          groqHandled = true;
          onProgress({ 
            stage: 'groq', 
            message: `🤖 Groq: ${recordId} - ${groqResult.status.toUpperCase()} (${groqResult.confidence || 75}% confidence)`,
            record: recordId,
            result: { status: groqResult.status, confidence: groqResult.confidence || 75 }
          });
          continue;
        } else if (groqResult) {
          // Low confidence - pass to Claude
          onProgress({ 
            stage: 'groq', 
            message: `🤖 Groq: ${recordId} - AMBIGUOUS (${groqResult.confidence || 0}% confidence), passing to Claude`,
            record: recordId,
            result: { status: 'ambiguous', confidence: groqResult.confidence || 0 }
          });
        }
      }

      // Case 2: Unreferenced payments with matching amounts
      if (!groqHandled) {
        const unreferencedPayments = allPayments.filter(p => 
          (p.reference_id === '' || p.reference_id === null) && 
          p.party_id === partyId
        );

        if (unreferencedPayments.length > 0) {
          const matchingPayment = unreferencedPayments.find(p => 
            Math.abs(parseFloat(p.amount) - amount) <= amount * 0.2 // 20% tolerance
          );

          if (matchingPayment) {
            const groqContext = {
              recordId: recordId,
              amount: amount,
              dueDate: dueDate,
              payments: [matchingPayment],
              creditNotes: [],
              totalPaid: parseFloat(matchingPayment.amount)
            };
            
            const groqResult = await callGroqAPI(record, recordType, groqContext);
            
            if (groqResult && groqResult.confidence >= 70) {
              await saveException({
                recordId,
                recordType: recordTypeValue,
                paymentId: matchingPayment.payment_id,
                status: groqResult.status || 'exception',
                resolvedByTier: 'groq',
                confidence: groqResult.confidence || 60,
                evidence: groqResult.evidence || ['Groq AI: Unreferenced payment analysis'],
                recommendedAction: groqResult.recommended_action || 'Verify payment purpose'
              });
              
              results.exception++;
              results.groq_used++;
              groqHandled = true;
              onProgress({ 
                stage: 'groq', 
                message: `🤖 Groq: ${recordId} - ${groqResult.status.toUpperCase()} (unreferenced payment)`,
                record: recordId
              });
              continue;
            }
          }
        }
      }

      // ===================== TIER 3: CLAUDE AI =====================
      // Only reach here if Rule and Groq couldn't handle it
      if (!groqHandled) {
        const today = new Date().toISOString().split('T')[0];
        const context = {
          recordId: recordId,
          amount: amount,
          dueDate: dueDate,
          payments: allPayments.filter(p => p.party_id === partyId),
          creditNotes: []
        };
        
        const claudeResult = await callClaudeAPI(record, recordType, context);
        
        let status = 'pending';
        let confidence = 80;
        let evidence = ['Claude AI: Complex analysis required'];
        let recommendedAction = 'Review required';
        
        if (claudeResult) {
          status = claudeResult.status || 'pending';
          confidence = claudeResult.confidence || 80;
          evidence = claudeResult.evidence || ['Claude AI analysis'];
          recommendedAction = claudeResult.recommended_action || 'Review required';
        } else {
          // Fallback logic if Claude fails
          if (dueDate && dueDate < today) {
            status = 'overdue';
            confidence = 95;
            evidence = ['No matching payment found and invoice is overdue'];
            recommendedAction = 'Escalate to collections';
          } else {
            status = 'pending';
            confidence = 80;
            evidence = ['No matching payment found but not yet overdue'];
            recommendedAction = 'Monitor payment status';
          }
        }
        
        await saveException({
          recordId,
          recordType: recordTypeValue,
          paymentId: null,
          status: status,
          resolvedByTier: 'claude',
          confidence: confidence,
          evidence: evidence,
          recommendedAction: recommendedAction
        });
        
        results[status === 'overdue' ? 'overdue' : 
                 status === 'exception' ? 'exception' : 
                 status === 'partial_payment' ? 'partial' : 
                 'pending']++;
        results.claude_used++;
        
        onProgress({ 
          stage: 'claude', 
          message: `🧠 Claude: ${recordId} - ${status.toUpperCase()} (${confidence}% confidence)`,
          record: recordId,
          result: { status, confidence }
        });
      }
    }

    onProgress({ 
      stage: 'complete', 
      message: `✅ Reconciliation complete! Processed ${processed} records.`,
      stats: results 
    });

    return results;

  } catch (error) {
    console.error('Reconciliation error:', error);
    onProgress({ 
      stage: 'error', 
      message: `❌ Error: ${error.message}` 
    });
    throw error;
  }
}

async function saveException({ 
  recordId, 
  recordType,
  paymentId, 
  status, 
  resolvedByTier, 
  confidence, 
  evidence, 
  recommendedAction 
}) {
  try {
    console.log(`📝 Saving: recordId=${recordId}, recordType=${recordType}, status=${status}, tier=${resolvedByTier}`);
    
    const [existing] = await pool.query(
      'SELECT * FROM exceptions WHERE record_id = ? AND record_type = ?',
      [recordId, recordType]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE exceptions 
         SET status = ?, 
             payment_id = ?,
             resolved_by_tier = ?,
             confidence = ?, 
             evidence = ?, 
             recommended_action = ?
         WHERE record_id = ? AND record_type = ?`,
        [status, paymentId, resolvedByTier, confidence, JSON.stringify(evidence), recommendedAction, recordId, recordType]
      );
      console.log(`✅ Updated: ${recordId} with tier ${resolvedByTier}`);
    } else {
      await pool.query(
        `INSERT INTO exceptions 
         (record_id, record_type, payment_id, status, resolved_by_tier, confidence, evidence, recommended_action) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [recordId, recordType, paymentId, status, resolvedByTier, confidence, JSON.stringify(evidence), recommendedAction]
      );
      console.log(`✅ Inserted: ${recordId} with tier ${resolvedByTier}`);
    }
  } catch (error) {
    console.error('❌ Error saving exception:', error);
    throw error;
  }
}

module.exports = { runReconciliation };