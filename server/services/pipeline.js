/**
 * Orchestrates the full tiered pipeline: rules -> Groq -> Claude -> audit trail.
 * This is the function the /reconcile route calls.
 */

const pool = require('../db/connection');
const { ruleMatch } = require('./ruleMatcher');
const groqTier = require('./groqTier');
const claudeAgent = require('./claudeAgent');

async function runReconciliation({ recordType, onProgress }) {
  const table = recordType === 'sales' ? 'sales' : 'purchases';
  const [records] = await pool.query(`SELECT * FROM ${table}`);
  const [payments] = await pool.query('SELECT * FROM payments');

  const stats = { total: records.length, rule: 0, groq: 0, claude: 0, exceptions: 0 };

  // --- Stage 1: rules ---
  const { matched, unmatchedRecords, unmatchedPayments } = ruleMatch(records, payments);
  stats.rule = matched.length;

  for (const m of matched) {
    await saveResult(recordType, m.record, m.payment, {
      status: m.status,
      resolved_by_tier: 'rule',
      confidence: null,
      evidence: [`Rule match: ${m.matchType} amount+date+reference`],
      recommended_action: m.status === 'partial_payment'
        ? 'Follow up for remaining balance.'
        : 'None — fully reconciled.'
    });
    onProgress?.({ stage: 'rule', record: m.record.invoice_id || m.record.purchase_id });
  }

  // --- Stage 2 + 3: unmatched records go through Groq, then Claude if ambiguous ---
  for (const record of unmatchedRecords) {
    const recordId = record.invoice_id || record.purchase_id;
    const candidate = findClosestPayment(record, unmatchedPayments);

    const groqResult = await groqTier.classifyRecord(record, candidate);
    onProgress?.({ stage: 'groq', record: recordId, result: groqResult });

    if (groqResult.decision === 'CONFIDENT') {
      stats.groq++;
      await saveResult(recordType, record, candidate, {
        status: groqResult.status,
        resolved_by_tier: 'groq',
        confidence: groqResult.confidence,
        evidence: [groqResult.reasoning],
        recommended_action: groqResult.status === 'pending'
          ? 'Awaiting payment — no action yet.'
          : 'Review suggested.'
      });
    } else {
      // Escalate to Claude — the expensive tier, used only here
      stats.claude++;
      const { result, trace } = await claudeAgent.investigate(record, candidate, (toolCall) => {
        onProgress?.({ stage: 'claude_tool_call', record: recordId, toolCall });
      });

      if (result.status === 'exception') stats.exceptions++;

      await saveResult(recordType, record, candidate, {
        status: result.status,
        resolved_by_tier: 'claude',
        confidence: result.confidence,
        evidence: result.evidence,
        recommended_action: result.recommended_action,
        trace
      });
      onProgress?.({ stage: 'claude_final', record: recordId, result });
    }
  }

  const matchRate = ((stats.rule + stats.groq + (stats.claude - stats.exceptions)) / stats.total * 100).toFixed(1);

  return { ...stats, matchRate };
}

function findClosestPayment(record, payments) {
  const partyId = record.customer_id || record.vendor_id;
  // Only consider payments from the SAME party — an unrelated customer/vendor's
  // payment being nearby in date is not a real candidate and just confuses the model
  const samePartyPayments = payments.filter(p => p.party_id === partyId);
  if (!samePartyPayments.length) return null; // genuinely nothing plausible nearby

  const targetDate = new Date(record.due_date || record.invoice_date);
  let closest = null;
  let closestDiff = Infinity;
  for (const p of samePartyPayments) {
    const diff = Math.abs(new Date(p.payment_date) - targetDate);
    if (diff < closestDiff) {
      closest = p;
      closestDiff = diff;
    }
  }
  return closest;
}

async function saveResult(recordType, record, payment, data) {
  const recordId = record.invoice_id || record.purchase_id;
  await pool.query(
    `INSERT INTO exceptions
     (record_type, record_id, payment_id, status, resolved_by_tier, confidence, evidence, recommended_action)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recordType,
      recordId,
      payment?.payment_id || null,
      data.status,
      data.resolved_by_tier,
      data.confidence,
      JSON.stringify(data.evidence || []),
      data.recommended_action
    ]
  );
}

module.exports = { runReconciliation };
