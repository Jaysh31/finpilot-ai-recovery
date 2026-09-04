/**
 * Stage 1: Rule-based reconciliation. No AI involved.
 * Matches payments to sales/purchase records on amount + date proximity + ID reference.
 * Resolves the "obvious" majority of records at zero cost before any AI is invoked.
 */

const DATE_TOLERANCE_DAYS = 5;
const AMOUNT_TOLERANCE = 0.01; // exact match tolerance for float rounding

function daysBetween(d1, d2) {
  const diff = Math.abs(new Date(d1) - new Date(d2));
  return diff / (1000 * 60 * 60 * 24);
}

/**
 * @param {Array} records - sales or purchase records
 * @param {Array} payments - payment records
 * @returns {Object} { matched: [], unmatched: [] }
 *   matched items include { record, payment, matchType: 'exact' | 'partial' }
 */
function ruleMatch(records, payments) {
  const matched = [];
  const unmatchedPayments = [...payments];
  const unmatchedRecords = [];

  for (const record of records) {
    const recordId = record.invoice_id || record.purchase_id;

    // Try exact reference match first
    let idx = unmatchedPayments.findIndex(p => p.reference_id === recordId);

    // Fallback: amount + date proximity match (handles missing/garbled reference)
    if (idx === -1) {
      idx = unmatchedPayments.findIndex(p => {
        const amountClose = Math.abs(p.amount - record.amount) <= AMOUNT_TOLERANCE;
        const dateClose = daysBetween(p.payment_date, record.due_date || record.invoice_date)
          <= DATE_TOLERANCE_DAYS;
        return amountClose && dateClose;
      });
    }

    if (idx !== -1) {
      const payment = unmatchedPayments[idx];
      const isFullAmount = Math.abs(payment.amount - record.amount) <= AMOUNT_TOLERANCE;

      matched.push({
        record,
        payment,
        matchType: isFullAmount ? 'exact' : 'partial',
        status: isFullAmount ? 'matched' : 'partial_payment',
        resolved_by_tier: 'rule'
      });
      unmatchedPayments.splice(idx, 1);
    } else {
      unmatchedRecords.push(record);
    }
  }

  return { matched, unmatchedRecords, unmatchedPayments };
}

module.exports = { ruleMatch };
