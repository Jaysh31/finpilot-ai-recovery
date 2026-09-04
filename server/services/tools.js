/**
 * Tools the AI agent (Groq or Claude) can call to investigate an unmatched record.
 * These execute real MySQL queries — the agent is genuinely fetching data, not
 * reasoning over pre-stuffed context. This is what makes the "agent trace" real.
 */

const pool = require('../db/connection');

async function getInvoice(invoiceId) {
  const [rows] = await pool.query(
    'SELECT * FROM sales WHERE invoice_id = ? UNION SELECT * FROM purchases WHERE purchase_id = ?',
    [invoiceId, invoiceId]
  );
  return rows[0] || { found: false };
}

async function getPayment(paymentId) {
  const [rows] = await pool.query('SELECT * FROM payments WHERE payment_id = ?', [paymentId]);
  return rows[0] || { found: false };
}

async function checkCreditNotes(invoiceId) {
  const [rows] = await pool.query('SELECT * FROM credit_notes WHERE invoice_id = ?', [invoiceId]);
  return rows;
}

async function checkPaymentHistory(partyId) {
  const [rows] = await pool.query(
    'SELECT * FROM payments WHERE party_id = ? ORDER BY payment_date DESC LIMIT 10',
    [partyId]
  );
  return rows;
}

async function checkDuplicates(paymentId, amount, partyId) {
  const [rows] = await pool.query(
    'SELECT * FROM payments WHERE party_id = ? AND amount = ? AND payment_id != ?',
    [partyId, amount, paymentId]
  );
  return rows;
}

// Tool schema definitions in OpenAI/Groq/Claude-compatible function format
const toolDefinitions = [
  {
    name: 'get_invoice',
    description: 'Fetch full invoice/purchase record details by ID',
    input_schema: {
      type: 'object',
      properties: { invoice_id: { type: 'string' } },
      required: ['invoice_id']
    }
  },
  {
    name: 'get_payment',
    description: 'Fetch full payment record details by ID',
    input_schema: {
      type: 'object',
      properties: { payment_id: { type: 'string' } },
      required: ['payment_id']
    }
  },
  {
    name: 'check_credit_notes',
    description: 'Check if any credit notes exist for this invoice, which would explain a payment shortfall',
    input_schema: {
      type: 'object',
      properties: { invoice_id: { type: 'string' } },
      required: ['invoice_id']
    }
  },
  {
    name: 'check_payment_history',
    description: "Get a customer/vendor's recent payment history to spot patterns (e.g. chronic late payer)",
    input_schema: {
      type: 'object',
      properties: { party_id: { type: 'string' } },
      required: ['party_id']
    }
  },
  {
    name: 'check_duplicates',
    description: 'Check if this payment might be a duplicate of another payment from the same party',
    input_schema: {
      type: 'object',
      properties: {
        payment_id: { type: 'string' },
        amount: { type: 'number' },
        party_id: { type: 'string' }
      },
      required: ['payment_id', 'amount', 'party_id']
    }
  }
];

const toolExecutors = {
  get_invoice: (args) => getInvoice(args.invoice_id),
  get_payment: (args) => getPayment(args.payment_id),
  check_credit_notes: (args) => checkCreditNotes(args.invoice_id),
  check_payment_history: (args) => checkPaymentHistory(args.party_id),
  check_duplicates: (args) => checkDuplicates(args.payment_id, args.amount, args.party_id)
};

module.exports = { toolDefinitions, toolExecutors };
