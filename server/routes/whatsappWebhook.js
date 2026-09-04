// routes/whatsappWebhook.js
const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { MessagingResponse } = require('twilio').twiml;

// POST /api/whatsapp/webhook
// Configure this URL in Twilio Console -> WhatsApp Sandbox/Sender -> "When a message comes in"
router.post('/whatsapp/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  const from = req.body.From; // e.g. "whatsapp:+919876543210"
  const incomingText = (req.body.Body || '').trim().toLowerCase();

  const twiml = new MessagingResponse();

  try {
    const [rows] = await pool.query(
      `SELECT * FROM exceptions
       WHERE whatsapp_sent_to = ? AND whatsapp_status = 'awaiting_reply'
       ORDER BY escalated_at DESC LIMIT 1`,
      [from]
    );

    if (!rows.length) {
      twiml.message("Thanks for your reply. We don't have a pending query for this number right now.");
      res.type('text/xml').send(twiml.toString());
      return;
    }

    const record = rows[0];
    let newStatus = record.status;
    let confirmationText = '';

    if (incomingText.includes('yes')) {
      newStatus = 'confirmed_paid';
      confirmationText = 'Thanks — we\'ve marked this as confirmed. Our finance team will reconcile it shortly.';
    } else if (incomingText.includes('no')) {
      newStatus = 'confirmed_unpaid';
      confirmationText = 'Thanks — noted. Our team will follow up on the payment.';
    } else {
      confirmationText = 'Sorry, I didn\'t catch that. Please reply YES or NO regarding the payment status.';
      twiml.message(confirmationText);
      res.type('text/xml').send(twiml.toString());
      return; // don't update status on unclear reply
    }

    await pool.query(
      `UPDATE exceptions
       SET status = ?, whatsapp_status = 'replied', whatsapp_reply = ?, whatsapp_replied_at = NOW()
       WHERE id = ?`,
      [newStatus, req.body.Body, record.id]
    );

    twiml.message(confirmationText);
    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    twiml.message('Sorry, something went wrong processing your reply. Our team will follow up manually.');
    res.type('text/xml').send(twiml.toString());
  }
});

module.exports = router;