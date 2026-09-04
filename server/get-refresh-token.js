// get-refresh-token.js
require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');

// IMPORTANT: This MUST match EXACTLY what's in Google Cloud Console
// Check your Google Cloud Console and copy the exact URI
const REDIRECT_URI = 'http://localhost:5001/oauth2callback'; // Change this to match!

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
  process.exit(1);
}

console.log('🔑 Using Redirect URI:', REDIRECT_URI);
console.log('📋 Client ID:', CLIENT_ID.substring(0, 30) + '...');

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send'
  ],
  prompt: 'consent',
  redirect_uri: REDIRECT_URI // Explicitly set this
});

console.log('\n🔑 Authorize this app by visiting this URL:\n');
console.log(authUrl);
console.log('\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('📝 Paste the FULL URL from the address bar (or just the code): ', async (input) => {
  rl.close();
  
  try {
    // Extract code from URL if full URL is pasted
    let code = input;
    if (input.includes('code=')) {
      const match = input.match(/code=([^&]+)/);
      if (match) code = match[1];
    }
    
    const { tokens } = await oAuth2Client.getToken(code);
    
    console.log('\n✅ Success! Add this to your .env:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    
    // Update .env file
    let envContent = fs.readFileSync('.env', 'utf8');
    if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
      envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
    }
    fs.writeFileSync('.env', envContent);
    console.log('\n✅ Refresh token saved to .env file!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('redirect_uri_mismatch')) {
      console.log('\n💡 FIX THIS:');
      console.log('1. Go to: https://console.cloud.google.com/apis/credentials');
      console.log('2. Click on "Web client 1"');
      console.log('3. Under "Authorized redirect URIs", add:');
      console.log(`   ${REDIRECT_URI}`);
      console.log('4. Click SAVE');
      console.log('5. Wait 2-3 minutes for changes to propagate');
      console.log('6. Run this script again');
    }
  }
});