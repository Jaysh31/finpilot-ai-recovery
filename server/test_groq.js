// TEMPORARY: Direct Groq API key for testing
/**
 * Standalone test for Stage 2 (Groq cheap tier). Takes the unmatched records
 * from Stage 1 and runs them through Groq to see CONFIDENT vs AMBIGUOUS decisions,
 * before wiring into the full pipeline or touching Claude.
 *
 * Run from server/ folder: node test_groq.js
 */

require('dotenv').config();

console.log('Groq key loaded:', process.env.GROQ_API_KEY ? 'YES' : 'NO');
console.log('Key prefix:', process.env.GROQ_API_KEY?.substring(0, 4));

const pool = require('./db/connection');
const { ruleMatch } = require('./services/ruleMatcher');
const groqTier = require('./services/groqTier');

function findClosestPayment(record, payments) {
  const partyId = record.customer_id || record.vendor_id;
  const recordId = record.invoice_id || record.purchase_id;

  const plausible = payments.filter(p => {
    if (p.party_id !== partyId) return false;
    const refMissing = !p.reference_id || p.reference_id.trim() === '';
    const refMatches = p.reference_id === recordId;
    const amountClose = Math.abs(p.amount - record.amount) <= record.amount * 0.5;
    // Only a real candidate if the reference is blank/matches, OR the amount is
    // in a plausible range for THIS invoice — not just any payment this customer made
    return refMissing || refMatches || amountClose;
  });

  if (!plausible.length) return null; // genuinely nothing plausible — true pending

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
  console.log('--- Testing Stage 2: Groq cheap tier ---\n');

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY not set in .env — add it and re-run.');
    process.exit(1);
  }

  const [sales] = await pool.query('SELECT * FROM sales');
  const [payments] = await pool.query('SELECT * FROM payments');

  const { unmatchedRecords, unmatchedPayments } = ruleMatch(sales, payments);
  console.log(`${unmatchedRecords.length} unmatched records to test against Groq.\n`);

  let confident = 0;
  let ambiguous = 0;

  for (const record of unmatchedRecords) {
    const candidate = findClosestPayment(record, unmatchedPayments);
    console.log(`\n--- ${record.invoice_id} (₹${record.amount}) ---`);

    try {
      const result = await groqTier.classifyRecord(record, candidate);
      console.log(`  Decision: ${result.decision}`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Confidence: ${result.confidence}%`);
      console.log(`  Reasoning: ${result.reasoning}`);

      if (result.decision === 'CONFIDENT') confident++;
      else ambiguous++;
    } catch (err) {
      console.error(`  ERROR calling Groq: ${err.message}`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`CONFIDENT (resolved by Groq): ${confident}`);
  console.log(`AMBIGUOUS (would escalate to Claude): ${ambiguous}`);

  await pool.end();
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});