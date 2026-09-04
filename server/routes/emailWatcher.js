// services/emailWatcher.js - Complete fixed version
const { google } = require('googleapis');
const pool = require('../db/connection');
require('dotenv').config();

// Track processed message IDs to avoid loops
const processedMessages = new Set();

class EmailWatcher {
  constructor() {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      this.oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/oauth2callback'
      );
      
      if (process.env.GOOGLE_REFRESH_TOKEN) {
        this.oAuth2Client.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });
      }
      this.gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });
    } else {
      console.log('⚠️ Gmail OAuth not configured. Email replies will not be auto-tracked.');
    }
  }

  async checkForReplies() {
    try {
      if (!this.gmail) {
        return;
      }

      // Search ONLY for replies to your emails with "Re: Follow-up" in subject
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'subject:"Re: Follow-up" -label:processed',
        maxResults: 10
      });
      
      if (!response.data.messages) {
        // console.log('📭 No new replies found');
        return;
      }
      
      console.log(`📧 Found ${response.data.messages.length} new replies to process`);
      
      let processed = 0;
      for (const message of response.data.messages) {
        // Skip if already processed
        if (processedMessages.has(message.id)) {
          console.log(`⏭️ Skipping already processed message: ${message.id}`);
          continue;
        }
        
        // Get message details
        const fullMsg = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['X-Exception-ID', 'From', 'Subject']
        });
        
        const headers = fullMsg.data.payload.headers || [];
        let from = '';
        let subject = '';
        let hasExceptionId = false;
        let exceptionId = null;
        
        for (const header of headers) {
          if (header.name === 'X-Exception-ID') {
            hasExceptionId = true;
            exceptionId = header.value;
          }
          if (header.name === 'From') {
            from = header.value;
          }
          if (header.name === 'Subject') {
            subject = header.value;
          }
        }
        
        // Only process if it has our custom header and is from a customer
        if (hasExceptionId && from && !from.includes('jayeshwakle10@gmail.com')) {
          console.log(`📧 Processing reply from: ${from}`);
          await this.processReply(message.id);
          processed++;
          
          // Mark as processed to avoid re-processing
          processedMessages.add(message.id);
          
          // Apply label to mark as processed
          try {
            await this.gmail.users.messages.modify({
              userId: 'me',
              id: message.id,
              requestBody: {
                addLabelIds: ['Label_processed'] // You need to create this label first
              }
            });
          } catch (labelError) {
            // If label doesn't exist, just mark as read
            await this.gmail.users.messages.modify({
              userId: 'me',
              id: message.id,
              requestBody: {
                removeLabelIds: ['UNREAD']
              }
            });
          }
        } else {
          // Mark as read even if not from our system to avoid re-processing
          try {
            await this.gmail.users.messages.modify({
              userId: 'me',
              id: message.id,
              requestBody: {
                removeLabelIds: ['UNREAD']
              }
            });
          } catch (e) {
            // Ignore errors
          }
        }
      }
      
      console.log(`✅ Processed ${processed} new customer replies`);
      
    } catch (error) {
      console.error('Check replies error:', error);
    }
  }

  async processReply(messageId) {
    try {
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });
      
      const headers = message.data.payload.headers || [];
      let exceptionId = null;
      
      for (const header of headers) {
        if (header.name === 'X-Exception-ID') {
          exceptionId = header.value;
        }
      }
      
      if (!exceptionId) {
        console.log('❌ No exception ID found');
        return;
      }
      
      let replyText = '';
      const parts = message.data.payload.parts || [];
      
      for (const part of parts) {
        if (part.mimeType === 'text/plain') {
          if (part.body && part.body.data) {
            replyText = Buffer.from(part.body.data, 'base64').toString();
            break;
          }
        }
      }
      
      if (!replyText && message.data.payload.body && message.data.payload.body.data) {
        replyText = Buffer.from(message.data.payload.body.data, 'base64').toString();
      }
      
      // Extract the customer's reply
      replyText = this.extractCustomerReply(replyText);
      
      if (replyText && replyText !== 'No reply content extracted') {
        await this.processExceptionReply(parseInt(exceptionId), replyText);
        console.log(`✅ Successfully processed reply for exception ${exceptionId}`);
      } else {
        console.log(`⚠️ No reply content extracted for exception ${exceptionId}`);
      }
      
    } catch (error) {
      console.error('Process reply error:', error);
    }
  }

  extractCustomerReply(fullText) {
    if (!fullText) return '';
    
    // Try to find the newest reply (the part after the last separator)
    let customerReply = '';
    
    const separators = [
      /On.*wrote:/i,
      /From:.*Sent:.*To:.*Subject:/s,
      /Original Message/i,
      /Forwarded message/i,
      /--\s*$/m,
      /^-{3,}/m,
      /Please reply directly to this email/i,
      /This is an automated communication/i,
      /FinPilot Finance Team/i,
      /<br>/g,
      /&nbsp;/g,
      /\n{3,}/g
    ];
    
    let lines = fullText.split('\n');
    let replyLines = [];
    let foundOriginal = false;
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      
      if (line.includes('wrote:') || 
          line.includes('Original Message') ||
          line.includes('Forwarded message') ||
          line.includes('FinPilot Finance Team') ||
          line.includes('This is an automated communication') ||
          line.includes('Please reply directly to this email') ||
          line.includes('Subject:') ||
          line.includes('From:') ||
          line.includes('Sent:')) {
        foundOriginal = true;
        break;
      }
      
      if (line.startsWith('>')) continue;
      replyLines.unshift(line);
    }
    
    if (foundOriginal && replyLines.length > 0) {
      customerReply = replyLines.join(' ').trim();
    }
    
    if (!customerReply || customerReply.length < 3) {
      let text = fullText;
      let lastSeparatorIndex = -1;
      let lastSeparator = '';
      
      for (const separator of separators) {
        const matches = [...text.matchAll(separator)];
        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          if (lastMatch.index > lastSeparatorIndex) {
            lastSeparatorIndex = lastMatch.index;
            lastSeparator = lastMatch[0];
          }
        }
      }
      
      if (lastSeparatorIndex > -1) {
        text = text.substring(lastSeparatorIndex + lastSeparator.length).trim();
      }
      
      text = text.split('\n')
        .filter(line => !line.trim().startsWith('>'))
        .join(' ');
      
      text = text.replace(/FinPilot Finance Team/g, '');
      text = text.replace(/This is an automated communication/g, '');
      text = text.replace(/Please reply directly to this email/g, '');
      text = text.replace(/-{3,}/g, '');
      
      customerReply = text.trim();
    }
    
    customerReply = customerReply.replace(/\s+/g, ' ').trim();
    
    // Only return if it looks like a real reply (short and meaningful)
    if (customerReply.length > 5 && customerReply.length < 500) {
      return customerReply;
    }
    
    // Try to extract just the key message
    const sentences = customerReply.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 0) {
      return sentences.slice(0, 2).join(' ').trim();
    }
    
    return 'No reply content extracted';
  }

  async processExceptionReply(exceptionId, replyText) {
    try {
      const [rows] = await pool.query('SELECT * FROM exceptions WHERE id = ?', [exceptionId]);
      if (!rows.length) {
        console.log(`❌ Exception ${exceptionId} not found`);
        return;
      }
      
      const record = rows[0];
      let evidence = [];
      try {
        evidence = JSON.parse(record.evidence || '[]');
      } catch (e) {
        evidence = [];
      }
      
      const replyLower = replyText.toLowerCase();
      let updatedEvidence = [...evidence];
      
      console.log(`📝 Processing reply for exception ${exceptionId}: "${replyText}"`);
      
      if (replyLower.includes('will pay') || 
          replyLower.includes('will make') || 
          replyLower.includes('will transfer') ||
          replyLower.includes('will send') ||
          (replyLower.includes('on ') && (replyLower.includes('sep') || replyLower.includes('oct') || replyLower.includes('nov') || replyLower.includes('dec')))) {
        
        updatedEvidence.push(`📅 Customer promised payment: "${replyText.trim()}"`);
        
        await pool.query(
          `UPDATE exceptions 
           SET followup_reply = ?,
               followup_reply_at = NOW(),
               followup_status = 'promised_payment',
               evidence = ?
           WHERE id = ?`,
          [replyText.trim(), JSON.stringify(updatedEvidence), exceptionId]
        );
        
        console.log(`✅ Payment promise recorded for exception ${exceptionId}: "${replyText}"`);
        
      } else if (replyLower.includes('paid') || 
                 replyLower.includes('payment made') || 
                 replyLower.includes('settled') ||
                 replyLower.includes('transferred') ||
                 replyLower.includes('cleared')) {
        
        updatedEvidence.push(`✅ Customer confirmed payment: "${replyText.trim()}"`);
        
        await pool.query(
          `UPDATE exceptions 
           SET status = 'matched',
               followup_reply = ?,
               followup_reply_at = NOW(),
               followup_status = 'replied',
               evidence = ?
           WHERE id = ?`,
          [replyText.trim(), JSON.stringify(updatedEvidence), exceptionId]
        );
        
        console.log(`✅ Payment confirmed for exception ${exceptionId}`);
        
      } else if (replyLower.includes('not paid') || 
                 replyLower.includes('haven\'t') || 
                 replyLower.includes('not yet') ||
                 replyLower.includes('delay') ||
                 replyLower.includes('late')) {
        
        updatedEvidence.push(`⚠️ Customer confirmed not paid: "${replyText.trim()}"`);
        
        await pool.query(
          `UPDATE exceptions 
           SET status = 'overdue',
               followup_reply = ?,
               followup_reply_at = NOW(),
               followup_status = 'replied',
               evidence = ?
           WHERE id = ?`,
          [replyText.trim(), JSON.stringify(updatedEvidence), exceptionId]
        );
        
        console.log(`⚠️ Customer not paid for exception ${exceptionId}`);
        
      } else {
        updatedEvidence.push(`📝 Customer replied: "${replyText.trim()}"`);
        
        await pool.query(
          `UPDATE exceptions 
           SET followup_reply = ?,
               followup_reply_at = NOW(),
               followup_status = 'replied',
               evidence = ?
           WHERE id = ?`,
          [replyText.trim(), JSON.stringify(updatedEvidence), exceptionId]
        );
        
        console.log(`📝 General reply recorded for exception ${exceptionId}`);
      }
      
    } catch (error) {
      console.error('Process exception reply error:', error);
    }
  }
}

module.exports = new EmailWatcher();