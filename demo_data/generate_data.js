/**
 * Generates synthetic sales.csv, purchases.csv, payments.csv, credit_notes.csv
 * with DELIBERATE patterns: clean matches, partial payments, missing references,
 * duplicates, and genuinely unresolvable exceptions — so your match rate is
 * meaningful, not trivially 100%.
 *
 * Run: node generate_data.js
 */

const fs = require('fs');

const customers = ['CUST001', 'CUST002', 'CUST003', 'CUST004', 'CUST005'];
const customerNames = ['Acme Traders', 'Bharat Retail Co', 'Coastal Exports', 'Delta Supplies', 'Everest Foods'];
const vendors = ['VEND001', 'VEND002', 'VEND003'];
const vendorNames = ['Raw Materials Ltd', 'Packaging Solutions', 'Logistics Partner'];

function randDate(daysAgoMin, daysAgoMax) {
  const days = Math.floor(Math.random() * (daysAgoMax - daysAgoMin) + daysAgoMin);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const sales = [];
const purchases = [];
const payments = [];
const creditNotes = [];

// --- 35 sales invoices with varied outcomes ---
for (let i = 1; i <= 35; i++) {
  const id = `INV-2026-${String(i).padStart(4, '0')}`;
  const custIdx = i % customers.length;
  const amount = Math.round((Math.random() * 90000 + 5000) / 100) * 100;
  const invoiceDate = randDate(10, 60);
  const dueDate = addDays(invoiceDate, 30);

  sales.push({
    invoice_id: id,
    customer_id: customers[custIdx],
    customer_name: customerNames[custIdx],
    amount,
    invoice_date: invoiceDate,
    due_date: dueDate
  });

  const outcome = i % 7; // spread deliberate patterns across the batch

  if (outcome === 0) {
    // Clean full match
    payments.push({
      payment_id: `PAY-${id}`,
      reference_id: id,
      party_id: customers[custIdx],
      amount,
      payment_date: addDays(dueDate, -2),
      payment_type: 'receivable',
      raw_note: `Payment for ${id}`
    });
  } else if (outcome === 1) {
    // Partial payment with a credit note explaining the shortfall
    const shortfall = Math.round(amount * 0.1);
    payments.push({
      payment_id: `PAY-${id}`,
      reference_id: id,
      party_id: customers[custIdx],
      amount: amount - shortfall,
      payment_date: addDays(dueDate, -1),
      payment_type: 'receivable',
      raw_note: `Partial payment ${id}`
    });
    creditNotes.push({
      credit_note_id: `CN-${id}`,
      invoice_id: id,
      amount: shortfall,
      reason: 'Damaged goods adjustment'
    });
  } else if (outcome === 2) {
    // Payment exists but reference_id is missing/garbled — tests rule fallback matching
    payments.push({
      payment_id: `PAY-${id}`,
      reference_id: '',
      party_id: customers[custIdx],
      amount,
      payment_date: addDays(dueDate, -3),
      payment_type: 'receivable',
      raw_note: 'NEFT payment - ref unclear'
    });
  } else if (outcome === 3) {
    // Genuinely pending — no payment yet, not overdue
    // (no payment record added)
  } else if (outcome === 4) {
    // Overdue — due date passed, no payment
    sales[sales.length - 1].due_date = randDate(1, 10); // force overdue
  } else if (outcome === 5) {
    // Partial payment with NO credit note — genuine exception for Claude tier to investigate
    const shortfall = Math.round(amount * 0.15);
    payments.push({
      payment_id: `PAY-${id}`,
      reference_id: id,
      party_id: customers[custIdx],
      amount: amount - shortfall,
      payment_date: addDays(dueDate, -1),
      payment_type: 'receivable',
      raw_note: `Partial - reason unclear`
    });
  } else {
    // Duplicate-looking payment — same customer, same amount, two payments close together
    payments.push({
      payment_id: `PAY-${id}`,
      reference_id: id,
      party_id: customers[custIdx],
      amount,
      payment_date: addDays(dueDate, -2),
      payment_type: 'receivable',
      raw_note: `Payment for ${id}`
    });
    payments.push({
      payment_id: `PAY-${id}-DUP`,
      reference_id: id,
      party_id: customers[custIdx],
      amount,
      payment_date: addDays(dueDate, -1),
      payment_type: 'receivable',
      raw_note: `Duplicate? Payment for ${id}`
    });
  }
}

// --- 15 purchase records, simpler mix ---
for (let i = 1; i <= 15; i++) {
  const id = `PO-2026-${String(i).padStart(4, '0')}`;
  const vendIdx = i % vendors.length;
  const amount = Math.round((Math.random() * 50000 + 3000) / 100) * 100;
  const purchaseDate = randDate(10, 50);
  const dueDate = addDays(purchaseDate, 21);

  purchases.push({
    purchase_id: id,
    vendor_id: vendors[vendIdx],
    vendor_name: vendorNames[vendIdx],
    amount,
    purchase_date: purchaseDate,
    due_date: dueDate
  });

  if (i % 3 !== 0) {
    payments.push({
      payment_id: `PAY-${id}`,
      reference_id: id,
      party_id: vendors[vendIdx],
      amount,
      payment_date: addDays(dueDate, -1),
      payment_type: 'payable',
      raw_note: `Payment to ${vendorNames[vendIdx]}`
    });
  }
  // every 3rd purchase left unpaid deliberately
}

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => `"${row[h] ?? ''}"`).join(','));
  }
  return lines.join('\n');
}

fs.writeFileSync('sales.csv', toCSV(sales));
fs.writeFileSync('purchases.csv', toCSV(purchases));
fs.writeFileSync('payments.csv', toCSV(payments));
fs.writeFileSync('credit_notes.csv', toCSV(creditNotes));

console.log(`Generated: ${sales.length} sales, ${purchases.length} purchases, ` +
  `${payments.length} payments, ${creditNotes.length} credit notes`);
console.log('Deliberate patterns included: clean matches, partial payments (with and ' +
  'without credit notes), missing references, pending, overdue, and duplicate-looking payments.');
