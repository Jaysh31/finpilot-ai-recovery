// services/followupScheduler.js
const pool = require('../db/connection');
const nodemailer = require('nodemailer');
require('dotenv').config();

class FollowupScheduler {
  async checkPromisedPayments() {
    try {
      // Find exceptions where customer promised payment
      const [rows] = await pool.query(`
        SELECT * FROM exceptions 
        WHERE followup_status = 'promised_payment' 
        AND status != 'matched'
        AND followup_reply_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      `);
      
      console.log(`🔍 Found ${rows.length} promised payments to check`);
      
      for (const record of rows) {
        await this.sendReminder(record);
      }
      
    } catch (error) {
      console.error('Followup scheduler error:', error);
    }
  }
  
  async sendReminder(record) {
    try {
      // Check if payment was received (check payments table)
      const [payments] = await pool.query(`
        SELECT * FROM payments 
        WHERE reference_id = ? 
        AND payment_date > ?
      `, [record.record_id, record.followup_reply_at]);
      
      if (payments.length > 0) {
        // Payment received!
        await pool.query(`
          UPDATE exceptions 
          SET status = 'matched', 
              followup_status = 'replied'
          WHERE id = ?
        `, [record.id]);
        
        console.log(`✅ Payment received for ${record.record_id}`);
        return;
      }
      
      // Send reminder email
      const transporter = nodemailer.createTransport({
        service: process.env.SMTP_SERVICE || 'gmail',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      
      const party = await this.getPartyDetails(record);
      
      const clientEmail = 'jayesh.22210630@viit.ac.in';
      
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: clientEmail,
        cc: process.env.SMTP_USER,
        subject: `REMINDER: ${record.record_type === 'sales' ? 'Invoice' : 'Purchase Order'} ${record.record_id} - Payment Promised`,
        text: `
Dear ${party?.party_name || 'Customer'},

This is a reminder regarding ${record.record_type === 'sales' ? 'Invoice' : 'Purchase Order'} ${record.record_id}.

You previously indicated you would make the payment. We wanted to kindly check if the payment has been processed.

If you have already made the payment, please reply to this email confirming the same.

If you need more time, please let us know.

Best regards,
FinPilot Finance Team
        `.trim()
      });
      
      console.log(`📧 Reminder sent for ${record.record_id}`);
      
    } catch (error) {
      console.error('Send reminder error:', error);
    }
  }
  
  async getPartyDetails(record) {
    try {
      if (record.record_type === 'sales') {
        const [rows] = await pool.query(
          `SELECT s.customer_name as party_name, p.email as party_email
           FROM sales s
           LEFT JOIN parties p ON p.party_id = s.customer_id
           WHERE s.invoice_id = ?`,
          [record.record_id]
        );
        return rows[0] || null;
      }
      
      if (record.record_type === 'purchases' || record.record_type === 'purchase') {
        const [rows] = await pool.query(
          `SELECT pu.vendor_name as party_name, p.email as party_email
           FROM purchases pu
           LEFT JOIN parties p ON p.party_id = pu.vendor_id
           WHERE pu.purchase_id = ?`,
          [record.record_id]
        );
        return rows[0] || null;
      }
      
      return null;
    } catch (error) {
      console.error('Get party details error:', error);
      return null;
    }
  }
}

module.exports = new FollowupScheduler();