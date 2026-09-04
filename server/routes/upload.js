const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const pool = require('../db/connection');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Expected column sets per file type — this IS the "plug and play" contract.
// Any business exporting to this shape can use FinPilot without touching code.
const SCHEMAS = {
  sales: ['invoice_id', 'customer_id', 'customer_name', 'amount', 'invoice_date', 'due_date'],
  purchases: ['purchase_id', 'vendor_id', 'vendor_name', 'amount', 'purchase_date', 'due_date'],
  payments: ['payment_id', 'reference_id', 'party_id', 'amount', 'payment_date', 'payment_type', 'raw_note']
};

router.post('/upload/:type', upload.single('file'), async (req, res) => {
  const { type } = req.params; // 'sales' | 'purchases' | 'payments'
  if (!SCHEMAS[type]) {
    return res.status(400).json({ error: `Unknown upload type: ${type}` });
  }

  const rows = [];
  const errors = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => {
      const missing = SCHEMAS[type].filter(col => !(col in row));
      if (missing.length) {
        errors.push({ row, missing });
      } else {
        rows.push(row);
      }
    })
    .on('end', async () => {
      fs.unlinkSync(req.file.path); // cleanup temp file

      if (rows.length === 0) {
        return res.status(400).json({ error: 'No valid rows found', errors });
      }

      try {
        await insertRows(type, rows);
        res.json({ inserted: rows.length, rejected: errors.length, errors });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
});

async function insertRows(type, rows) {
  const table = type;
  for (const row of rows) {
    const cols = SCHEMAS[type];
    const values = cols.map(c => row[c] ?? null);
    const placeholders = cols.map(() => '?').join(', ');
    await pool.query(
      `INSERT IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }
}

module.exports = router;
