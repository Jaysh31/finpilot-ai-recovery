/**
 * Standalone test for Stage 3 (Claude deep tier). Takes the AMBIGUOUS records
 * from Stage 2 and runs them through the real Claude tool-calling agent loop,
 * printing every tool call + result live so you can see the investigation happen.
 *
 * Run from server/ folder: node test_claude.js
 */

require('dotenv').config();

console.log('Anthropic key loaded:', process.env.ANTHROPIC_API_KEY ? 'YES' : 'NO');
console.log('Key prefix:', process.env.ANTHROPIC_API_KEY?.substring(0, 7));

const pool = require('./db/connection');
const { ruleMatch } = require('./services/ruleMatcher');
const groqTier = require('./services/groqTier');
const claudeAgent = require('./services/claudeAgent');

function findClosestPayment(record, payments) {
  const partyId = record.customer_id || record.vendor_id;
  const recordId = record.invoice_id || record.purchase_id;

  const plausible = payments.filter(p => {
    if (p.party_id !== partyId) return false;
    const refMissing = !p.reference_id || p.reference_id.trim() === '';
    const refMatches = p.reference_id === recordId;
    const amountClose = Math.abs(p.amount - record.amount) <= record.amount * 0.5;
    return refMissing || refMatches || amountClose;
  });

  if (!plausible.length) return null;

  const targetDate = new Date(record.due_date || record.invoice_date);
  let closest = null;
  let closestDiff = Infinity;
  for (const p of plausible) {
    const diff = Math.abs(new Date(p.payment_date) - targetDate);
    if (diff < closestDiff) {
      closest = p;
      closestDiff = diff;
    }
  }
  return closest;
}

async function main() {
  console.log('--- Testing Stage 3: Claude deep-tier agent ---\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set in .env — add it and re-run.');
    process.exit(1);
  }

  const [sales] = await pool.query('SELECT * FROM sales');
  const [payments] = await pool.query('SELECT * FROM payments');

  const { unmatchedRecords, unmatchedPayments } = ruleMatch(sales, payments);

  // Re-run Groq to find which records are AMBIGUOUS (same as pipeline would do)
  console.log(`Screening ${unmatchedRecords.length} records through Groq first...\n`);
  const toInvestigate = [];

  for (const record of unmatchedRecords) {
    const candidate = findClosestPayment(record, unmatchedPayments);
    const groqResult = await groqTier.classifyRecord(record, candidate);
    if (groqResult.decision === 'AMBIGUOUS') {
      toInvestigate.push({ record, candidate });
    }
  }

  console.log(`${toInvestigate.length} records flagged AMBIGUOUS — sending to Claude for deep investigation.\n`);
  console.log('='.repeat(70));

  for (const { record, candidate } of toInvestigate) {
    const recordId = record.invoice_id || record.purchase_id;
    console.log(`\n🔍 INVESTIGATING: ${recordId} (₹${record.amount})\n`);

    try {
      const { result, trace } = await claudeAgent.investigate(record, candidate, (toolCall) => {
        console.log(`  🔧 Tool call: ${toolCall.tool}(${JSON.stringify(toolCall.input)})`);
        console.log(`     → Result: ${JSON.stringify(toolCall.output).slice(0, 150)}`);
      });

      console.log(`\n  ✅ FINAL DECISION:`);
      console.log(`     Status: ${result.status}`);
      console.log(`     Confidence: ${result.confidence}%`);
      console.log(`     Evidence: ${JSON.stringify(result.evidence, null, 2)}`);
      console.log(`     Recommended action: ${result.recommended_action}`);
      console.log(`     (Total tool calls made: ${trace.length})`);
    } catch (err) {
      console.error(`  ERROR during investigation: ${err.message}`);
    }
    console.log('\n' + '='.repeat(70));
  }

  await pool.end();
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});