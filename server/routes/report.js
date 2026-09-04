// routes/report.js
const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// Safely parse evidence — some older rows may have stored it as a plain string
// instead of a JSON array. Never crash the route because of it.
function safeParseEvidence(value) {
  if (Array.isArray(value)) return value; // mysql2 may already auto-parse JSON columns
  if (value == null) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      // Not valid JSON — treat the raw string as a single evidence line instead of crashing
      return [value];
    }
  }
  return [String(value)];
}

// GET /api/report/summary — dashboard metrics with actual amounts
router.get('/report/summary', async (req, res) => {
  try {
    // Get exception counts by status and tier
    const [exceptionStats] = await pool.query(`
      SELECT 
        status, 
        resolved_by_tier, 
        COUNT(*) as count,
        COUNT(DISTINCT record_id) as unique_records
      FROM exceptions 
      GROUP BY status, resolved_by_tier
      ORDER BY status, resolved_by_tier
    `);

    // Get total amounts for each status from sales and purchases
    const [salesStats] = await pool.query(`
      SELECT 
        e.status,
        COUNT(DISTINCT e.record_id) as record_count,
        SUM(s.amount) as total_amount
      FROM exceptions e
      JOIN sales s ON s.invoice_id = e.record_id
      WHERE e.record_type = 'sales'
      GROUP BY e.status
    `);

    const [purchaseStats] = await pool.query(`
      SELECT 
        e.status,
        COUNT(DISTINCT e.record_id) as record_count,
        SUM(p.amount) as total_amount
      FROM exceptions e
      JOIN purchases p ON p.purchase_id = e.record_id
      WHERE e.record_type IN ('purchases', 'purchase')
      GROUP BY e.status
    `);

    // Get overall totals
    const [totals] = await pool.query(`
      SELECT 
        COUNT(*) as total_exceptions,
        COUNT(DISTINCT record_id) as total_records,
        COUNT(DISTINCT CASE WHEN status = 'exception' THEN record_id END) as exception_count,
        COUNT(DISTINCT CASE WHEN status = 'overdue' THEN record_id END) as overdue_count,
        COUNT(DISTINCT CASE WHEN status = 'partial_payment' THEN record_id END) as partial_count,
        COUNT(DISTINCT CASE WHEN status = 'pending' THEN record_id END) as pending_count,
        COUNT(DISTINCT CASE WHEN status = 'matched' THEN record_id END) as matched_count
      FROM exceptions
    `);

    // Get AI vs Rule breakdown
    const [aiStats] = await pool.query(`
      SELECT 
        resolved_by_tier,
        COUNT(*) as count,
        COUNT(DISTINCT record_id) as unique_records
      FROM exceptions
      GROUP BY resolved_by_tier
    `);

    res.json({
      summary: {
        total_exceptions: totals[0]?.total_exceptions || 0,
        total_records: totals[0]?.total_records || 0,
        by_status: {
          exception: totals[0]?.exception_count || 0,
          overdue: totals[0]?.overdue_count || 0,
          partial_payment: totals[0]?.partial_count || 0,
          pending: totals[0]?.pending_count || 0,
          matched: totals[0]?.matched_count || 0
        },
        by_tier: aiStats.reduce((acc, row) => {
          acc[row.resolved_by_tier] = row.count;
          return acc;
        }, {})
      },
      sales_amounts: salesStats,
      purchase_amounts: purchaseStats,
      detailed_stats: exceptionStats
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/report/exceptions — full list with evidence, for the dashboard + CA export
router.get('/report/exceptions', async (req, res) => {
  try {
    const { status } = req.query;
    
    // Base query with joins to get additional info
    let query = `
      SELECT 
        e.*,
        CASE 
          WHEN e.record_type = 'sales' THEN s.customer_id 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.vendor_id 
          ELSE NULL 
        END as party_id,
        CASE 
          WHEN e.record_type = 'sales' THEN s.customer_name 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.vendor_name 
          ELSE NULL 
        END as party_name,
        CASE 
          WHEN e.record_type = 'sales' THEN s.amount 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.amount 
          ELSE NULL 
        END as amount,
        CASE 
          WHEN e.record_type = 'sales' THEN s.due_date 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.due_date 
          ELSE NULL 
        END as due_date,
        pt.phone as party_phone,
        pt.email as party_email
      FROM exceptions e
      LEFT JOIN sales s ON s.invoice_id = e.record_id AND e.record_type = 'sales'
      LEFT JOIN purchases p ON p.purchase_id = e.record_id AND e.record_type IN ('purchases', 'purchase')
      LEFT JOIN parties pt ON pt.party_id = COALESCE(s.customer_id, p.vendor_id)
    `;

    if (status) {
      query += ` WHERE e.status = ?`;
    }
    
    query += ` ORDER BY e.created_at DESC`;

    const [rows] = await pool.query(query, status ? [status] : []);
    
    // Parse evidence and format dates
    const safeRows = rows.map(r => ({
      ...r,
      evidence: safeParseEvidence(r.evidence),
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      escalated_at: r.escalated_at ? new Date(r.escalated_at).toISOString() : null,
      due_date: r.due_date ? new Date(r.due_date).toISOString().split('T')[0] : null,
      amount: r.amount ? parseFloat(r.amount) : null
    }));

    res.json(safeRows);
  } catch (error) {
    console.error('Exceptions fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/report/ca-export — structured export for CA review (Stage 6)
router.get('/report/ca-export', async (req, res) => {
  try {
    // Get all exceptions with party and amount details
    const [rawAll] = await pool.query(`
      SELECT 
        e.*,
        CASE 
          WHEN e.record_type = 'sales' THEN s.customer_id 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.vendor_id 
          ELSE NULL 
        END as party_id,
        CASE 
          WHEN e.record_type = 'sales' THEN s.customer_name 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.vendor_name 
          ELSE NULL 
        END as party_name,
        CASE 
          WHEN e.record_type = 'sales' THEN s.amount 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.amount 
          ELSE NULL 
        END as amount,
        CASE 
          WHEN e.record_type = 'sales' THEN s.due_date 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.due_date 
          ELSE NULL 
        END as due_date,
        pt.phone as party_phone,
        pt.email as party_email,
        CASE 
          WHEN e.record_type = 'sales' THEN s.status 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.status 
          ELSE NULL 
        END as record_status
      FROM exceptions e
      LEFT JOIN sales s ON s.invoice_id = e.record_id AND e.record_type = 'sales'
      LEFT JOIN purchases p ON p.purchase_id = e.record_id AND e.record_type IN ('purchases', 'purchase')
      LEFT JOIN parties pt ON pt.party_id = COALESCE(s.customer_id, p.vendor_id)
      ORDER BY e.record_type, e.record_id
    `);

    const all = rawAll.map(r => ({
      ...r,
      evidence: safeParseEvidence(r.evidence),
      amount: r.amount ? parseFloat(r.amount) : null
    }));

    // Calculate summary statistics
    const summary = {
      total_records: all.length,
      matched_no_ai: all.filter(r => r.resolved_by_tier === 'rule').length,
      matched_ai_assisted: all.filter(r => r.resolved_by_tier !== 'rule' && r.status !== 'exception').length,
      unresolved_exceptions: all.filter(r => r.status === 'exception').length,
      total_amount: all.reduce((sum, r) => sum + (r.amount || 0), 0),
      by_type: {
        sales: all.filter(r => r.record_type === 'sales').length,
        purchases: all.filter(r => r.record_type === 'purchases' || r.record_type === 'purchase').length
      },
      by_status: {
        matched: all.filter(r => r.status === 'matched').length,
        partial_payment: all.filter(r => r.status === 'partial_payment').length,
        pending: all.filter(r => r.status === 'pending').length,
        overdue: all.filter(r => r.status === 'overdue').length,
        exception: all.filter(r => r.status === 'exception').length
      },
      total_amount_note: 'Amounts are in ₹ (Indian Rupees)'
    };

    // Get detailed breakdown by tier
    const tierBreakdown = all.reduce((acc, r) => {
      const tier = r.resolved_by_tier || 'unknown';
      if (!acc[tier]) acc[tier] = { count: 0, amount: 0 };
      acc[tier].count++;
      acc[tier].amount += (r.amount || 0);
      return acc;
    }, {});

    res.json({
      generated_at: new Date().toISOString(),
      summary,
      tier_breakdown: tierBreakdown,
      matched_clean: all.filter(r => r.resolved_by_tier === 'rule'),
      ai_assisted_matches: all.filter(r => r.resolved_by_tier !== 'rule' && r.status !== 'exception'),
      unresolved_exceptions: all.filter(r => r.status === 'exception'),
      all_records: all,
      disclaimer: 'This report pre-sorts records to speed up review. It does not constitute ' +
        'certified verification and all AI-assisted and unresolved items should be reviewed ' +
        'by a qualified professional before sign-off.'
    });
  } catch (error) {
    console.error('CA Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/report/status-breakdown — Quick status breakdown with amounts
router.get('/report/status-breakdown', async (req, res) => {
  try {
    const [results] = await pool.query(`
      SELECT 
        e.status,
        e.resolved_by_tier,
        COUNT(*) as count,
        COUNT(DISTINCT e.record_id) as unique_records,
        SUM(CASE 
          WHEN e.record_type = 'sales' THEN s.amount 
          WHEN e.record_type IN ('purchases', 'purchase') THEN p.amount 
          ELSE 0 
        END) as total_amount
      FROM exceptions e
      LEFT JOIN sales s ON s.invoice_id = e.record_id AND e.record_type = 'sales'
      LEFT JOIN purchases p ON p.purchase_id = e.record_id AND e.record_type IN ('purchases', 'purchase')
      GROUP BY e.status, e.resolved_by_tier
      ORDER BY e.status, e.resolved_by_tier
    `);

    res.json(results);
  } catch (error) {
    console.error('Status breakdown error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/report/party-exceptions — Exceptions grouped by party
router.get('/report/party-exceptions', async (req, res) => {
  try {
    const [results] = await pool.query(`
      SELECT 
        COALESCE(s.customer_id, p.vendor_id) as party_id,
        COALESCE(s.customer_name, p.vendor_name) as party_name,
        COUNT(e.id) as exception_count,
        SUM(CASE WHEN e.status = 'exception' THEN 1 ELSE 0 END) as critical_count,
        SUM(CASE WHEN e.status = 'overdue' THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN e.record_type = 'sales' THEN s.amount ELSE 0 END) as sales_amount,
        SUM(CASE WHEN e.record_type IN ('purchases', 'purchase') THEN p.amount ELSE 0 END) as purchase_amount
      FROM exceptions e
      LEFT JOIN sales s ON s.invoice_id = e.record_id AND e.record_type = 'sales'
      LEFT JOIN purchases p ON p.purchase_id = e.record_id AND e.record_type IN ('purchases', 'purchase')
      GROUP BY COALESCE(s.customer_id, p.vendor_id), COALESCE(s.customer_name, p.vendor_name)
      HAVING exception_count > 0
      ORDER BY exception_count DESC
    `);

    res.json(results);
  } catch (error) {
    console.error('Party exceptions error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;