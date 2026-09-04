// routes/reconcile.js
const express = require('express');
const router = express.Router();
const { runReconciliation } = require('../services/pipeline');

/**
 * POST /api/reconcile?type=sales|purchases
 * Streams live progress via Server-Sent Events
 */
router.post('/reconcile', async (req, res) => {
  const recordType = req.query.type === 'purchases' ? 'purchases' : 'sales';

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const stats = await runReconciliation({
      recordType,
      onProgress: (event) => sendEvent(event)
    });
    sendEvent({ stage: 'complete', stats });
  } catch (err) {
    console.error('Reconciliation error:', err);
    sendEvent({ 
      stage: 'error', 
      message: err.message,
      details: err.stack 
    });
  } finally {
    res.end();
  }
});

// Also support GET for easier testing
router.get('/reconcile', async (req, res) => {
  const recordType = req.query.type === 'purchases' ? 'purchases' : 'sales';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const stats = await runReconciliation({
      recordType,
      onProgress: (event) => sendEvent(event)
    });
    sendEvent({ stage: 'complete', stats });
  } catch (err) {
    console.error('Reconciliation error:', err);
    sendEvent({ 
      stage: 'error', 
      message: err.message 
    });
  } finally {
    res.end();
  }
});

module.exports = router;