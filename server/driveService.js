// driveService.js
// Upload, list, and delete helpers for Google Drive, scoped to one folder
const drive = require('./driveClient.js');
const { Readable } = require('stream');

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

if (!FOLDER_ID) {
  console.warn('Warning: GOOGLE_DRIVE_FOLDER_ID is not set in .env');
}

/**
 * Upload a PDF to Google Drive
 */
async function uploadScore(fileBuffer, fileName, category = 'general') {
  if (!FOLDER_ID) {
    throw new Error('Google Drive folder ID not configured');
  }

  const bufferStream = new Readable();
  bufferStream.push(fileBuffer);
  bufferStream.push(null);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [FOLDER_ID],
      properties: {
        category: category,
      },
    },
    media: {
      mimeType: 'application/pdf',
      body: bufferStream,
    },
    fields: 'id, name, webViewLink, webContentLink, createdTime, size, properties',
  });

  const fileId = response.data.id;

  // Make file readable by anyone with the link
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (permErr) {
    console.warn('Could not set public permission:', permErr.message);
  }

  return response.data;
}

/**
 * List all PDFs in the Drive folder
 */
async function listScores({ search = '', sort = '-createdTime' } = {}) {
  if (!FOLDER_ID) {
    throw new Error('Google Drive folder ID not configured');
  }

  let query = `'${FOLDER_ID}' in parents and mimeType='application/pdf' and trashed=false`;

  if (search) {
    query += ` and name contains '${search.replace(/'/g, "\\'")}'`;
  }

  const orderBy = sort === 'name' ? 'name asc' : (sort === '-name' ? 'name desc' : 'createdTime desc');

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, webViewLink, webContentLink, createdTime, size, properties)',
    orderBy,
  });

  return response.data.files || [];
}

/**
 * Delete a score from Drive
 */
async function deleteScore(fileId) {
  await drive.files.delete({ fileId });
}

/**
 * Build a direct-download URL
 */
function getDirectDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

module.exports = {
  uploadScore,
  listScores,
  deleteScore,
  getDirectDownloadUrl,
};
