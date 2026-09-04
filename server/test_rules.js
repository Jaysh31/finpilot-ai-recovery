/**
 * Standalone test for Stage 1 (rule-based matcher). No API, no AI — just pulls
 * real data from MySQL and runs ruleMatch() directly so you can see exactly
 * what it resolves vs. what needs AI, before any AI keys are involved.
 *
 * Run from server/ folder: node test_rules.js
 */

require('dotenv').config();
const pool = require('./db/connection');
const { ruleMatch } = require('./services/ruleMatcher');

async function main() {
  console.log('--- Testing Stage 1: Rule-based matcher ---\n');

  const [sales] = await pool.query('SELECT * FROM sales');
  const [payments] = await pool.query('SELECT * FROM payments');

  console.log(`Loaded ${sales.length} sales records and ${payments.length} payments.\n`);

  const { matched, unmatchedRecords, unmatchedPayments } = ruleMatch(sales, payments);

  console.log(`✅ MATCHED: ${matched.length}`);
  matched.forEach(m => {
    console.log(`   ${m.record.invoice_id} — ${m.matchType} match — status: ${m.status}`);
  });

  console.log(`\n❓ UNMATCHED RECORDS (need AI tier): ${unmatchedRecords.length}`);
  unmatchedRecords.forEach(r => {
    console.log(`   ${r.invoice_id} — amount ₹${r.amount} — due ${r.due_date}`);
  });

  console.log(`\n💰 LEFTOVER UNMATCHED PAYMENTS: ${unmatchedPayments.length}`);
  unmatchedPayments.forEach(p => {
    console.log(`   ${p.payment_id} — amount ₹${p.amount} — ref: "${p.reference_id}"`);
  });

  const matchRate = ((matched.length / sales.length) * 100).toFixed(1);
  console.log(`\n--- Rule-tier match rate: ${matchRate}% (${matched.length}/${sales.length}) ---`);
  console.log(`Remaining ${unmatchedRecords.length} records would go to Groq/Claude tiers.\n`);

  await pool.end();
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});