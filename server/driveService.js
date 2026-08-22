// driveService.js
// Upload, list, and delete helpers for Google Drive, scoped to one folder
const drive = require('./driveClient.js');
const { Readable } = require('stream');

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

if (!FOLDER_ID) {
  console.warn('Warning: GOOGLE_DRIVE_FOLDER_ID is not set in .env');
}

async function withRetry(fn, retries = 3, delayMs = 1000) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const code = err?.code || err?.response?.status;
      if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, delayMs * Math.pow(2, i)));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Upload a PDF to Google Drive
 */
async function uploadScore(fileBuffer, fileName, category = 'general', uploadedBy = '') {
  if (!FOLDER_ID) {
    throw new Error('Google Drive folder ID not configured');
  }

  const bufferStream = new Readable();
  bufferStream.push(fileBuffer);
  bufferStream.push(null);

  const requestBody = {
    name: fileName,
    parents: [FOLDER_ID],
    properties: {
      category: category,
    },
  };

  if (uploadedBy) {
    requestBody.properties.uploaded_by = uploadedBy;
  }

  const response = await withRetry(() =>
    drive.files.create({
      requestBody,
      media: {
        mimeType: 'application/pdf',
        body: bufferStream,
      },
      fields: 'id, name, webViewLink, webContentLink, createdTime, size, properties',
    })
  );

  const fileId = response.data.id;

  // Make file readable by anyone with the link
  try {
    await withRetry(() =>
      drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      })
    );
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

  const response = await withRetry(() =>
    drive.files.list({
      q: query,
      fields: 'files(id, name, webViewLink, webContentLink, createdTime, size, properties)',
      orderBy,
    })
  );

  return response.data.files || [];
}

/**
 * Delete a score from Drive
 */
async function deleteScore(fileId) {
  await withRetry(() => drive.files.delete({ fileId }));
}

/**
 * Build a direct-download URL
 */
function getDirectDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Check if a file with the given name already exists in the Drive folder
 */
async function fileExists(fileName) {
  if (!FOLDER_ID) {
    return false;
  }

  const query = `'${FOLDER_ID}' in parents and name='${fileName.replace(/'/g, "\\'")}' and trashed=false`;

  try {
    const response = await withRetry(() =>
      drive.files.list({
        q: query,
        fields: 'files(id, name)',
      })
    );
    return (response.data.files || []).length > 0;
  } catch (err) {
    console.error('Drive fileExists error:', err);
    return false;
  }
}

module.exports = {
  uploadScore,
  listScores,
  deleteScore,
  getDirectDownloadUrl,
  fileExists,
};
