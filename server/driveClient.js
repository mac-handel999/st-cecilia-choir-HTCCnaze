// driveClient.js
// Google Drive client using either Service Account or OAuth2
require('dotenv').config();
const { google } = require('googleapis');

let auth;

// Use Service Account if key file is provided (recommended for server-to-server)
if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } catch (err) {
    console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', err);
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY in .env');
  }
} else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
  // Fallback to OAuth2 with refresh token
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  auth = oauth2Client;
} else {
  throw new Error('Missing Google credentials: provide GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_CLIENT_ID + GOOGLE_REFRESH_TOKEN in .env');
}

// Configure request timeout and retry logic
const drive = google.drive({ 
  version: 'v3', 
  auth,
  // Increase timeout for slow networks
  // The googleapis library uses gaxios under the hood
});

module.exports = drive;
