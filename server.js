require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const multer = require('multer');
const readXlsxFile = require('read-excel-file/node');
const { PDFParse } = require('pdf-parse');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const webpush = require('web-push');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const { answerFromChoirReferences } = require('./server/choir-knowledge');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(/^\/data\/(?:hymns|assumpta-hymns|legion-of-mary-hymns)\.json$/, authMiddleware, (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  next();
});

app.get('/api/hymns', authMiddleware, async (req, res) => {
  const books = {
    catholic: 'hymns.json',
    assumpta: 'assumpta-hymns.json',
    'legion-of-mary': 'legion-of-mary-hymns.json'
  };
  const filename = books[req.query.book || 'catholic'];
  if (!filename) return res.status(400).json({ message: 'Please choose a valid hymn book.' });

  try {
    const data = await fs.promises.readFile(path.join(__dirname, 'public', 'data', filename), 'utf8');
    res.set('Cache-Control', 'private, no-store');
    res.vary('Authorization');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('[Hymns] Could not load hymn book:', { book: req.query.book || 'catholic', message: error.message });
    res.status(500).json({ message: 'This hymn book could not be opened right now. Please try again later.' });
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Supabase clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;
const webPushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

if (webPushConfigured) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

async function sendPushToUsers(notification) {
  if (!webPushConfigured) return;

  try {
    const settingsQuery = supabaseAdmin
      .from('user_settings')
      .select('user_id')
      .eq('push_notifications', true);
    if (notification.user_id) settingsQuery.eq('user_id', notification.user_id);

    const { data: settings, error: settingsError } = await settingsQuery;
    if (settingsError) throw settingsError;
    const enabledUserIds = (settings || []).map(setting => setting.user_id);
    if (enabledUserIds.length === 0) return;

    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, user_id, subscription')
      .in('user_id', enabledUserIds);
    if (subscriptionsError) throw subscriptionsError;

    const payload = JSON.stringify({
      title: notification.title || 'St. Cecilia Choir',
      body: notification.message || 'There is a new update from the choir.',
      url: '/notifications.html'
    });

    for (let index = 0; index < (subscriptions || []).length; index += 10) {
      const batch = subscriptions.slice(index, index + 10);
      await Promise.all(batch.map(async (entry) => {
        try {
          await webpush.sendNotification(entry.subscription, payload);
        } catch (error) {
          console.error('[Push] Delivery failed:', {
            statusCode: error.statusCode,
            message: error.message
          });
          if (error.statusCode === 404 || error.statusCode === 410) {
            const { error: deleteError } = await supabaseAdmin
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', entry.endpoint);
            if (deleteError) {
              console.error('[Push] Could not remove expired subscription:', deleteError.message);
            }
          }
        }
      }));
    }
  } catch (error) {
    console.error('[Push] Could not prepare notification delivery:', error.message);
  }
}

async function createNotification(notification) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert([{ ...notification, user_id: notification.user_id || null }])
    .select()
    .single();

  if (error) throw error;
  if (data) await sendPushToUsers(data);
  return data;
}

function isAllowedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const allowedHosts = [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'web.push.apple.com',
      'notify.windows.com'
    ];
    return url.protocol === 'https:'
      && !url.port
      && allowedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

// Groq AI client
let groq = null;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// Cloudinary config
let cloudinary = null;
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  } catch (e) {
    console.log('Cloudinary not configured');
  }
}

// Multer for file uploads - use memory storage for serverless compatibility
const upload = multer({ storage: multer.memoryStorage() });
const ticketProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 }
});
const debtLedgerImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!['.csv', '.pdf', '.xlsx', '.txt', '.json'].includes(extension)) {
      return callback(new Error('Please choose a CSV, PDF, Excel, TXT, or JSON file.'));
    }
    callback(null, true);
  }
});

const ticketRateLimits = new Map();
const ticketProofBucket = process.env.TICKET_PROOF_BUCKET || 'ticket-payment-proofs';
const ticketCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function ticketSubmissionLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (ticketRateLimits.size > 10000) {
    for (const [address, limit] of ticketRateLimits) {
      if (limit.resetAt <= now) ticketRateLimits.delete(address);
    }
  }
  const current = ticketRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    ticketRateLimits.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return next();
  }
  if (current.count >= 20) {
    return res.status(429).json({ message: 'Too many ticket requests. Please wait a little while and try again.' });
  }
  current.count += 1;
  return next();
}

function createTicketCode(length = 10) {
  return Array.from({ length }, () => ticketCodeAlphabet[crypto.randomInt(ticketCodeAlphabet.length)]).join('');
}

function ticketCodes(quantity) {
  return Array.from({ length: quantity }, () => createTicketCode());
}

function normalizeTicketPhone(value) {
  return String(value || '').trim().replace(/[()\s.-]/g, '');
}

function isValidTicketImage(file) {
  if (!file || file.size === 0) return false;
  if (file.mimetype === 'application/pdf') return file.buffer.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/png') return file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/jpeg') return file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
  if (file.mimetype === 'image/webp') return file.buffer.subarray(0, 4).toString() === 'RIFF'
    && file.buffer.subarray(8, 12).toString() === 'WEBP';
  return false;
}

function getTicketMailTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

function escapeEmailHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function deliverTicketEmail(order, tickets, packageName) {
  if (!order.email) return 'failed';
  const mail = getTicketMailTransport();
  if (!mail) return 'not_configured';

  const attachments = await Promise.all(tickets.map(async (ticket, index) => ({
    filename: `music-boom-ticket-${index + 1}.png`,
    cid: `music-boom-ticket-${index}`,
    content: await QRCode.toBuffer(ticket.code, { width: 360, margin: 2 })
  })));
  const ticketCards = tickets.map((ticket, index) => `
    <div style="border:1px solid #e6d9c4;border-radius:12px;padding:16px;margin:16px 0;text-align:center">
      <img src="cid:music-boom-ticket-${index}" width="220" height="220" alt="Ticket QR code">
      <p><strong>Ticket ${index + 1} of ${tickets.length}</strong></p>
      <p>Ticket code: <strong>${escapeEmailHtml(ticket.code)}</strong></p>
      ${ticket.serial ? `<p>Printed serial: <strong>${escapeEmailHtml(ticket.serial)}</strong></p>` : ''}
    </div>
  `).join('');
  const eventDate = '20 December 2026';
  const recipientName = escapeEmailHtml(order.buyer_name);
  const amount = new Intl.NumberFormat('en-NG').format(order.amount_ngn);
  const from = process.env.TICKETS_FROM_EMAIL || process.env.SMTP_USER;

  await mail.sendMail({
    from: `"Holy Trinity Choir" <${from}>`,
    to: order.email,
    subject: `Your Music Boom tickets — order ${order.code}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#231918">
        <h1 style="color:#4a0000">Your tickets are confirmed</h1>
        <p>Hello ${recipientName},</p>
        <p>Your payment has been confirmed. Here are your purchase details:</p>
        <ul>
          <li>Order code: <strong>${escapeEmailHtml(order.code)}</strong></li>
          <li>Package: <strong>${escapeEmailHtml(packageName)}</strong></li>
          <li>Quantity: <strong>${order.quantity}</strong></li>
          <li>Total: <strong>₦${amount}</strong></li>
        </ul>
        <p><strong>Music Boom — Egwu Anuri</strong><br>
          ${eventDate} · Red carpet 3:00 PM · Main event 4:00 PM<br>
          Holy Trinity Catholic Church, Umuakali Naze, Owerri</p>
        <p>Show one QR code for each ticket at the entrance. Keep this email safe.</p>
        ${ticketCards}
        <p>For event enquiries: 07042799614 / 07063553107 / 08084191017.</p>
      </div>
    `,
    attachments
  });
  return 'sent';
}

// JWT middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Admin/Exco middleware
function adminOrExco(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'exco')) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

async function getUserName(userId) {
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('full_name, username')
      .eq('id', userId)
      .single();
    return data?.full_name || data?.username || 'Admin';
  } catch {
    return 'Admin';
  }
}

function buildQuery(table, req, defaultSelect) {
  const select = req.query.select || defaultSelect || '*';
  const order = req.query.order;
  const ascending = req.query.ascending !== 'false';
  const limit = req.query.limit;
  const count = req.query.count === 'true';

  let query = supabaseAdmin.from(table).select(select, count ? { count: 'exact', head: true } : {});

  if (order) {
    query = query.order(order, { ascending });
  }

  if (limit && !isNaN(parseInt(limit))) {
    query = query.limit(parseInt(limit));
  }

  if (req.query.eq) {
    req.query.eq.split(',').forEach(pair => {
      const [field, value] = pair.split('=');
      if (field && value) query = query.eq(field, decodeURIComponent(value));
    });
  }

  return query;
}

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, metadata = {} } = req.body;
    const { joinCode, ...meta } = metadata;

    if (!email || !password || !metadata.username || !metadata.full_name || !metadata.phone_number || !metadata.address) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Validate Choir Join Code
    const expectedCode = process.env.CHOIR_JOIN_CODE || 'ST-CECILIA-CHOIR@HTCC#11-22';
    if (!joinCode || joinCode !== expectedCode) {
      return res.status(401).json({ message: 'Invalid Choir Join Code. Please ask a choir executive for the current passcode.' });
    }

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .or(`email.eq.${email},username.eq.${metadata.username}`)
      .single();

    if (existingUser) {
      return res.status(400).json({ message: 'Email or username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert([{
        email,
        password: hashedPassword,
        username: metadata.username,
        full_name: metadata.full_name,
        phone_number: metadata.phone_number,
        address: metadata.address,
        date_of_birth: metadata.date_of_birth || metadata.dateOfBirth || null,
        marital_status: metadata.marital_status || metadata.maritalStatus || null,
        choir_part: metadata.choir_part || metadata.choirPart || null,
        executive_position: metadata.executive_position || metadata.executivePosition || null,
        tenure: metadata.tenure || null,
        pledge_accepted: metadata.pledge_accepted ?? metadata.pledge ?? false,
        role: 'member'
      }])
      .select('id, email, username, full_name, phone_number, address, role, created_at')
      .single();

    if (error) throw error;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: err.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, remember = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: remember ? '30d' : '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, username, full_name, phone_number, address, date_of_birth, marital_status, choir_part, executive_position, tenure, pledge_accepted, role, avatar_url, created_at, updated_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ message: 'User not found in database' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.SITE_URL || 'http://localhost:5000';

    const response = await fetch(`${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(`${siteUrl}/reset-password.html`)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.msg || data.message || 'Failed to send reset email');
    }

    res.json({ message: 'Password reset email sent' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: err.message || 'Failed to send reset email' });
  }
});

app.post('/api/auth/update-password', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password is required' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const { error } = await supabaseAdmin
      .from('users')
      .update({ password: hashedPassword, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    if (error) throw error;
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Update password error:', err);
    res.status(500).json({ message: 'Failed to update password' });
  }
});

// ==================== USERS ROUTES ====================

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await buildQuery('users', req, 'id, email, username, full_name, phone_number, address, choir_part, executive_position, role, avatar_url, created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

app.get('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, username, full_name, phone_number, address, date_of_birth, marital_status, choir_part, executive_position, tenure, pledge_accepted, role, avatar_url, created_at, updated_at')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ message: 'User not found' });
    res.json(data);
  } catch (err) {
    console.error('User fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

app.put('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const allowed = ['full_name', 'phone_number', 'address', 'date_of_birth', 'marital_status', 'choir_part', 'executive_position', 'tenure', 'username'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, email, username, full_name, phone_number, address, date_of_birth, marital_status, choir_part, executive_position, tenure, pledge_accepted, role, avatar_url, created_at, updated_at')
      .single();

    if (error || !data) return res.status(404).json({ message: 'User not found' });
    res.json(data);
  } catch (err) {
    console.error('User update error:', err);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'exco';
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admins can delete users' });
    }

    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('User delete error:', err);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// ==================== AVATAR ROUTES ====================

const AVATAR_BUCKET = process.env.S3_BUCKET_NAME || 'avatars';

app.post('/api/users/:id/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.user.id !== userId) {
      return res.status(403).json({ message: 'You can only update your own avatar' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ message: 'Image size must not exceed 10MB' });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ message: 'Only JPG, PNG, and WebP images are allowed' });
    }

    const fileExtension = file.originalname.split('.').pop() || 'jpg';
    const fileName = `${userId}/avatar-${Date.now()}.${fileExtension}`;

    // Delete old avatar if exists (non-fatal)
    try {
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('avatar_url')
        .eq('id', userId)
        .single();

      if (existingUser?.avatar_url) {
        const pathMatch = existingUser.avatar_url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
        if (pathMatch) {
          await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([pathMatch[1]]);
        }
      }
    } catch (deleteError) {
      console.warn('Old avatar deletion failed:', deleteError);
    }

    // Verify bucket exists
    try {
      await supabaseAdmin.storage.from(AVATAR_BUCKET).list('', { limit: 1 });
    } catch (bucketError) {
      console.error('Avatar bucket check error:', bucketError);
      return res.status(500).json({ message: `Storage bucket "${AVATAR_BUCKET}" not found or not accessible. Please create it in Supabase Storage and set it to Public.` });
    }

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from(AVATAR_BUCKET)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return res.status(500).json({ message: `Upload failed: ${uploadError.message || 'Storage error'}` });
    }

    let publicUrl = '';
    const publicUrlResult = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(fileName);
    if (publicUrlResult?.data?.publicUrl) {
      publicUrl = publicUrlResult.data.publicUrl;
    } else if (publicUrlResult?.data?.publicURL) {
      publicUrl = publicUrlResult.data.publicURL;
    } else if (typeof publicUrlResult === 'string') {
      publicUrl = publicUrlResult;
    } else if (publicUrlResult?.publicUrl) {
      publicUrl = publicUrlResult.publicUrl;
    }

    if (!publicUrl) {
      console.error('Avatar public URL error:', publicUrlResult);
      return res.status(500).json({ message: 'Failed to get avatar public URL' });
    }

    await supabaseAdmin
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    res.json({ avatar_url: publicUrl });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ message: err.message || 'Failed to upload avatar' });
  }
});

app.delete('/api/users/:id/avatar', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.user.id !== userId) {
      return res.status(403).json({ message: 'You can only delete your own avatar' });
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('avatar_url')
      .eq('id', userId)
      .single();

    if (user?.avatar_url) {
      const pathMatch = user.avatar_url.match(/\/avatars\/(.+)$/);
      if (pathMatch) {
        await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([pathMatch[1]]);
      }
    }

    await supabaseAdmin
      .from('users')
      .update({ avatar_url: null })
      .eq('id', userId);

    res.json({ message: 'Avatar deleted successfully' });
  } catch (err) {
    console.error('Avatar delete error:', err);
    res.status(500).json({ message: 'Failed to delete avatar' });
  }
});

// ==================== SCORES ROUTES ====================

app.get('/api/scores', async (req, res) => {
  try {
    const { data, error } = await buildQuery('scores', req, 'id, title, description, file_url, file_type, public_id, uploaded_by, created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Scores list error:', err);
    res.status(500).json({ message: 'Failed to fetch scores' });
  }
});

app.post('/api/scores', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { title, description, file_url, file_type, public_id } = req.body;
    const { data, error } = await supabaseAdmin
      .from('scores')
      .insert([{ title, description, file_url, file_type, public_id, uploaded_by: req.user.id }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Score create error:', err);
    res.status(500).json({ message: 'Failed to create score' });
  }
});

app.delete('/api/scores/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('scores')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Score delete error:', err);
    res.status(500).json({ message: 'Failed to delete score' });
  }
});

// ==================== GOOGLE DRIVE SCORES ROUTES ====================

const driveUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});
const driveService = require('./server/driveService');

// GET /api/drive/scores - list all PDFs from Google Drive
app.get('/api/drive/scores', async (req, res) => {
  try {
    const { search = '', sort = '-createdTime' } = req.query;
    const files = await driveService.listScores({ search, sort });
    res.json(files);
  } catch (err) {
    console.error('Drive scores list error:', err);
    res.status(500).json({ message: 'Failed to fetch scores from Google Drive' });
  }
});

// POST /api/drive/scores/upload - upload a PDF to Google Drive
app.post('/api/drive/scores/upload', authMiddleware, driveUpload.single('score'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed.' });
    }

    const { category } = req.body;
    const fileName = req.file.originalname;

    const exists = await driveService.fileExists(fileName);
    if (exists) {
      return res.status(409).json({ error: `A score named "${fileName}" already exists. Please rename the file or choose a different score.` });
    }

    let uploadedByName = '';
    try {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('full_name')
        .eq('id', req.user.id)
        .single();
      uploadedByName = user?.full_name || '';
    } catch (userErr) {
      console.error('Failed to fetch uploader name:', userErr);
    }

    const driveFile = await driveService.uploadScore(req.file.buffer, fileName, category, uploadedByName);

    // Optional: save metadata to Supabase
    try {
      await supabaseAdmin.from('scores').insert({
        title: fileName.replace(/\.pdf$/i, ''),
        category: category || 'general',
        file_url: driveFile.webViewLink,
        file_type: 'pdf',
        public_id: driveFile.id,
        uploaded_by: req.user.id,
      });
    } catch (dbErr) {
      console.error('Supabase metadata save error:', dbErr);
    }

    try {
      await createNotification({
        title: 'New Score Uploaded',
        message: `${fileName} was uploaded to ${category || 'General'} by ${uploadedByName || 'a member'}`,
        icon: 'library_music',
        user_id: null
      });
    } catch (notifErr) {
      console.error('Failed to create score upload notification:', notifErr);
    }

    res.json({
      message: 'Score uploaded successfully.',
      file: driveFile,
    });
  } catch (err) {
    console.error('Drive upload error:', err);
    res.status(500).json({ error: 'Failed to upload score.' });
  }
});

// DELETE /api/drive/scores/:fileId - delete a score from Google Drive
app.delete('/api/drive/scores/:fileId', authMiddleware, adminOrExco, async (req, res) => {
  try {
    await driveService.deleteScore(req.params.fileId);

    // Optional: delete metadata from Supabase
    try {
      await supabaseAdmin
        .from('scores')
        .delete()
        .eq('public_id', req.params.fileId);
    } catch (dbErr) {
      console.error('Supabase metadata delete error:', dbErr);
    }

    res.json({ message: 'Score deleted.' });
  } catch (err) {
    console.error('Drive delete error:', err);
    res.status(500).json({ error: 'Failed to delete score.' });
  }
});

// ==================== ATTENDANCE ROUTES ====================

app.get('/api/attendance', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await buildQuery('attendance', req, 'id, event_name, event_date, member_id, status, reason, marked_by, created_at, updated_at');

    if (error) throw error;

    const records = data || [];
    const memberIds = [...new Set(records.map(r => r.member_id))];
    const members = {};
    
    if (memberIds.length > 0) {
      const { data: memberData } = await supabaseAdmin
        .from('users')
        .select('id, full_name, username')
        .in('id', memberIds);
      
      if (memberData) {
        memberData.forEach(m => {
          members[m.id] = m.full_name || m.username;
        });
      }
    }

    const enriched = records.map(r => ({
      ...r,
      member_name: members[r.member_id] || null,
      member_username: members[r.member_id] || null
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Attendance list error:', err);
    res.status(500).json({ message: 'Failed to fetch attendance' });
  }
});

app.post('/api/attendance', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'exco';
    const { date, type, member_id, status, reason, event_name, event_date, ...rest } = req.body;

    let finalMemberId = member_id;
    if (!isAdmin) {
      finalMemberId = req.user.id;
    }

    if (!finalMemberId) {
      return res.status(400).json({ message: 'Member ID is required' });
    }

    const payload = {
      event_name: type || event_name,
      event_date: date || event_date,
      member_id: finalMemberId,
      status: status || 'absent',
      reason: reason || null,
      marked_by: req.user.id,
      ...rest
    };

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .upsert(payload, { onConflict: 'member_id,event_date' })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Attendance create error:', err);
    res.status(500).json({ message: 'Failed to create attendance record' });
  }
});

app.put('/api/attendance/:id', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'exco';
    const { status, reason } = req.body;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('attendance')
      .select('member_id')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    if (!isAdmin && existing.member_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own attendance' });
    }

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .update({ status, reason, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Attendance update error:', err);
    res.status(500).json({ message: 'Failed to update attendance' });
  }
});

app.post('/api/attendance/bulk', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'exco';
    const { event_date, event_name, records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'No records provided' });
    }

    let payload = records.map(r => ({
      event_name: event_name || r.event_name,
      event_date: event_date || r.event_date,
      member_id: r.member_id,
      status: r.status || 'absent',
      reason: r.reason || null,
      marked_by: req.user.id
    }));

    if (!isAdmin) {
      payload = payload.filter(r => r.member_id === req.user.id);
      if (payload.length === 0) {
        return res.status(403).json({ message: 'You can only mark your own attendance' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .upsert(payload, { onConflict: 'member_id,event_date' })
      .select();

    if (error) throw error;

    try {
      await createNotification({
        title: 'Attendance Recorded',
        message: `Attendance marked for ${event_name || 'event'} - ${records.length} records updated`,
        icon: 'fact_check',
        user_id: null
      });
    } catch (notifErr) {
      console.error('Failed to create attendance notification:', notifErr);
    }
    res.json(data || []);
  } catch (err) {
    console.error('Attendance bulk upsert error:', err);
    res.status(500).json({ message: 'Failed to bulk save attendance' });
  }
});

app.delete('/api/attendance/:id', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'exco';

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('attendance')
      .select('member_id')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    if (!isAdmin && existing.member_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own attendance' });
    }

    await supabaseAdmin
      .from('attendance')
      .delete()
      .eq('id', req.params.id);

    res.json({ message: 'Attendance record deleted' });
  } catch (err) {
    console.error('Attendance delete error:', err);
    res.status(500).json({ message: 'Failed to delete attendance record' });
  }
});

app.delete('/api/attendance/event/:eventDate', authMiddleware, adminOrExco, async (req, res) => {
  try {
    await supabaseAdmin
      .from('attendance')
      .delete()
      .eq('event_date', decodeURIComponent(req.params.eventDate));

    res.json({ message: 'Attendance records deleted' });
  } catch (err) {
    console.error('Attendance event delete error:', err);
    res.status(500).json({ message: 'Failed to delete attendance records' });
  }
});

// ==================== EVENTS ROUTES ====================

// ==================== CHOIR DEBT LEDGER ====================

app.use('/api/debt-ledger', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const debtLedgerRecordIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const debtLedgerCategories = new Set([
  'choir_monthly_dues',
  'burial_levy',
  'wedding_levy',
  'other'
]);

function isOptionalLedgerText(value, maxLength) {
  return value === null || (typeof value === 'string' && value.length <= maxLength);
}

function parseDelimitedText(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && inQuotes && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (inQuotes) throw new Error('The file has an unfinished quoted field.');
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function chooseDelimitedRows(text, extension) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const candidates = extension === '.txt' ? ['\t', ',', '|', ';'] : [',', '\t', ';', '|'];
  const delimiter = candidates
    .map(candidate => ({
      candidate,
      count: (firstLine.match(new RegExp(candidate === '|' ? '\\|' : candidate === '\t' ? '\\t' : candidate, 'g')) || []).length
    }))
    .sort((left, right) => right.count - left.count)[0];
  if (!delimiter || delimiter.count === 0) {
    return text.split(/\r?\n/).map(line => [line.trim()]).filter(row => row[0]);
  }
  return parseDelimitedText(text, delimiter.candidate);
}

function cleanImportCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && 'text' in value) return String(value.text || '').trim();
  if (Array.isArray(value)) return value.map(cleanImportCell).filter(Boolean).join(', ');
  return String(value).trim();
}

function tableToImportRows(rows, headers = null) {
  const cleanedRows = rows.map(row => row.map(cleanImportCell));
  const firstRow = headers || cleanedRows[0];
  if (!firstRow?.length) throw new Error('No rows could be read from this file.');
  const columnCount = Math.min(60, cleanedRows.reduce((max, row) => Math.max(max, row.length), firstRow.length));
  const columnHeaders = Array.from({ length: columnCount }, (_, index) => firstRow[index] || `Column ${index + 1}`);
  const dataRows = (headers ? cleanedRows : cleanedRows.slice(1))
    .filter(row => row.some(value => value !== ''))
    .map(row => [...row.slice(0, 60), ...Array(Math.max(0, columnHeaders.length - row.length)).fill('')].slice(0, columnHeaders.length));
  if (dataRows.length > 2000) throw new Error('This file has more than 2,000 rows. Split it into smaller files and try again.');
  return {
    headers: columnHeaders,
    rows: dataRows,
    rawRows: cleanedRows
      .filter(row => row.some(value => value !== ''))
      .map(row => [...row.slice(0, 60), ...Array(Math.max(0, columnHeaders.length - row.length)).fill('')].slice(0, columnHeaders.length))
  };
}

function parsePdfTableRows(tables) {
  const rows = [];
  for (const table of tables || []) {
    for (const row of table || []) {
      if (Array.isArray(row)) rows.push(row);
    }
  }
  return rows;
}

async function parseDebtLedgerFile(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (extension === '.pdf' && file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('This file does not appear to be a valid PDF.');
  }

  let parsed;
  let legacyRecords = null;
  if (extension === '.xlsx') {
    if (file.buffer.subarray(0, 2).toString() !== 'PK') {
      throw new Error('This file does not appear to be a valid Excel workbook.');
    }
    try {
      const sheets = await readXlsxFile(file.buffer);
      const firstSheet = sheets.find(sheet => Array.isArray(sheet.data));
      if (!firstSheet) throw new Error('No worksheet was found.');
      parsed = tableToImportRows(firstSheet.data);
    } catch (error) {
      if (error.message.startsWith('This file has more than 2,000 rows')) throw error;
      throw new Error('This Excel file could not be opened. Check that it is a valid .xlsx workbook and try again.');
    }
  } else if (extension === '.csv' || extension === '.txt') {
    const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    parsed = tableToImportRows(chooseDelimitedRows(text, extension));
  } else if (extension === '.json') {
    let rows;
    try {
      rows = JSON.parse(file.buffer.toString('utf8'));
    } catch {
      throw new Error('This JSON file could not be read. Please check the file contents and try again.');
    }
    if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error('The JSON file must contain a list of debt records.');
    }
    if (rows.every(row => Number.isInteger(row.sn) && row.sn > 0 && typeof row.name === 'string')) {
      legacyRecords = rows.map(row => ({
        sn: row.sn,
        name: row.name,
        other_name: row.other_name ?? null,
        debt_2025: row.debt_2025 ?? null,
        debt_2026: row.debt_2026 ?? null,
        total: row.total ?? null,
        notes: row.notes ?? null
      }));
    }
    const headers = [...new Set(rows.flatMap(row => Object.keys(row)))].slice(0, 60);
    parsed = tableToImportRows(rows.map(row => headers.map(header => row[header])), headers);
  } else if (extension === '.pdf') {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const tableResult = await parser.getTable();
      const tableRows = parsePdfTableRows((tableResult.pages || []).flatMap(page => page.tables || []));
      if (tableRows.length > 1) {
        parsed = tableToImportRows(tableRows);
      } else {
        const textResult = await parser.getText();
        const text = String(textResult.text || '').trim();
        if (!text) {
          throw new Error('No selectable text or table could be read from this PDF. It may be a scanned image; try a text-based PDF or enter the records manually.');
        }
        const lines = text.split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line && !/^--\s+\d+\s+of\s+\d+\s+--$/.test(line));
        const delimitedRows = lines.map(line => {
          if (line.includes('|')) return line.split('|').map(cell => cell.trim());
          if (line.includes('\t')) return line.split(/\t+/).map(cell => cell.trim());
          return line.split(/\s{2,}/).map(cell => cell.trim());
        });
        if (delimitedRows.length > 1 && delimitedRows.every(row => row.length === 1)) {
          throw new Error('This PDF contains readable text, but its columns could not be separated. Use a table-based PDF, CSV, Excel file, or enter the rows manually.');
        }
        parsed = tableToImportRows(delimitedRows);
      }
    } catch (error) {
      if (error.message.startsWith('No selectable text')
          || error.message.startsWith('This PDF contains readable text')
          || error.message.startsWith('This file has more than 2,000 rows')) {
        throw error;
      }
      throw new Error('This PDF could not be opened. Use an unlocked PDF with selectable text and try again.');
    } finally {
      await parser.destroy();
    }
  } else {
    throw new Error('Please choose a CSV, PDF, Excel, TXT, or JSON file.');
  }

  return {
    ...parsed,
    ...(legacyRecords ? { legacyRecords } : {}),
    hasHeader: extension !== '.json',
    fingerprint: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    fileName: path.basename(file.originalname).slice(0, 180),
    fileType: extension.slice(1).toUpperCase()
  };
}

function parseOptionalLedgerYear(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const year = Number(String(value).trim());
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : undefined;
}

function parseOptionalLedgerMonth(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value).trim().toLocaleLowerCase();
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const numericMonth = Number(normalized);
  if (Number.isInteger(numericMonth) && numericMonth >= 1 && numericMonth <= 12) return numericMonth;
  const matchingMonth = monthNames.findIndex(name => name === normalized || name.startsWith(normalized));
  return matchingMonth === -1 || normalized.length < 3 ? undefined : matchingMonth + 1;
}

function parseOptionalLedgerAmount(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value).trim().replace(/[₦,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 && amount <= 9999999999.99 ? amount : undefined;
}

function parseDebtLedgerImportUpload(req, res, next) {
  debtLedgerImportUpload.single('file')(req, res, error => {
    if (!error) return next();
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    const message = tooLarge
      ? 'This file is larger than 8 MB. Please choose a smaller file.'
      : error.message || 'The file could not be uploaded. Choose a CSV, PDF, Excel, TXT, or JSON file.';
    return res.status(tooLarge ? 413 : 400).json({ message });
  });
}

app.get('/api/debt-ledger', authMiddleware, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('debt_ledger_entries')
      .select(`
        id, source_row_number, source_serial, source_member_name, source_other_name,
        member_name, other_name, source_debt_2025, source_debt_2026, source_debt_amount,
        source_year, source_month, source_category, source_file_name,
        source_total, source_notes, review_status, created_at, updated_at,
        obligations:debt_ledger_obligations(
          id, title, category, amount_ngn, period_year, period_month, created_at,
          payments:debt_ledger_payments(id, amount_ngn, reference, paid_at, created_at)
        )
      `)
      .order('member_name', { ascending: true })
      .order('source_serial', { ascending: true, nullsFirst: false });

    const search = String(req.query.q || '')
      .replace(/[^\p{L}\p{N}\s'-]/gu, '')
      .trim()
      .slice(0, 80);
    if (search) {
      query = query.or(`member_name.ilike.%${search}%,other_name.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({
      entries: data || [],
      bank: {
        name: process.env.BANK_ACCOUNT_NAME || '',
        number: process.env.BANK_ACCOUNT_NUMBER || '',
        bank: process.env.BANK_NAME || ''
      }
    });
  } catch (error) {
    console.error('[Debt Ledger] Could not load ledger entries:', error.message);
    res.status(503).json({
      message: 'We could not open the payment ledger right now. Please try again in a moment.'
    });
  }
});

app.post(
  '/api/debt-ledger/parse-import',
  authMiddleware,
  adminOrExco,
  parseDebtLedgerImportUpload,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'Choose a file before starting the import.' });
    }

    try {
      res.json(await parseDebtLedgerFile(req.file));
    } catch (error) {
      console.error('[Debt Ledger] Could not read source file:', error.message);
      res.status(400).json({
        message: error.message || 'This file could not be read. Check the file format and try again.'
      });
    }
  }
);

app.post('/api/debt-ledger/import-tabular', authMiddleware, adminOrExco, async (req, res) => {
  const { fingerprint, rows } = req.body || {};
  if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(fingerprint)
      || !Array.isArray(rows) || rows.length < 1 || rows.length > 2000) {
    return res.status(400).json({
      message: 'The import preview is no longer valid. Choose the file again and review its columns.'
    });
  }

  const normalizedRows = rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const memberName = typeof row.name === 'string' ? row.name.trim() : '';
    const otherName = row.other_name === '' || row.other_name === undefined ? null : row.other_name;
    const rawAmount = row.amount === '' || row.amount === null || row.amount === undefined ? null : row.amount;
    const rawNotes = row.notes === '' || row.notes === null || row.notes === undefined ? null : row.notes;
    const rawCategory = row.category === '' || row.category === null || row.category === undefined ? null : row.category;
    const rawFileName = typeof row.file_name === 'string' ? row.file_name : '';
    const year = parseOptionalLedgerYear(row.year);
    const month = parseOptionalLedgerMonth(row.month);
    if (!Number.isInteger(row.row_number) || row.row_number < 1
        || !memberName || memberName.length > 160
        || !isOptionalLedgerText(otherName, 160)
        || !isOptionalLedgerText(rawAmount, 1200)
        || !isOptionalLedgerText(rawNotes, 1200)
        || !isOptionalLedgerText(rawCategory, 120)
        || !rawFileName || rawFileName.length > 180
        || year === undefined || month === undefined) {
      return null;
    }
    return {
      source_import_key: `tabular-${crypto.createHash('sha256')
        .update(JSON.stringify([fingerprint, row.row_number, memberName, otherName, rawAmount, row.year, row.month, rawCategory, rawNotes]))
        .digest('hex')}`,
      source_row_number: row.row_number,
      source_member_name: memberName,
      source_other_name: otherName,
      member_name: memberName,
      other_name: otherName,
      source_debt_amount: rawAmount,
      source_year: year,
      source_month: month,
      source_category: rawCategory,
      source_file_name: rawFileName,
      source_notes: rawNotes,
      review_status: 'needs_review',
      created_by: req.user.id
    };
  });

  if (normalizedRows.some(row => row === null)) {
    return res.status(400).json({
      message: 'Check the preview: every imported row needs a name, and any year or month must be valid.'
    });
  }

  try {
    let imported = 0;
    for (let index = 0; index < normalizedRows.length; index += 100) {
      const { data, error } = await supabaseAdmin
        .from('debt_ledger_entries')
        .upsert(normalizedRows.slice(index, index + 100), {
          onConflict: 'source_import_key',
          ignoreDuplicates: true
        })
        .select('id');
      if (error) throw error;
      imported += data?.length || 0;
    }

    res.status(201).json({
      imported,
      alreadyPresent: normalizedRows.length - imported,
      message: imported
        ? `${imported} source rows were added for finance review. Confirmed balances have not been changed.`
        : 'These source rows have already been imported. No information was changed.'
    });
  } catch (error) {
    console.error('[Debt Ledger] Tabular import failed:', error.message);
    res.status(503).json({
      message: 'The source rows could not be saved. Please try again; previously imported rows will not be duplicated.'
    });
  }
});

app.post('/api/debt-ledger/import', authMiddleware, adminOrExco, async (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 2000) {
    return res.status(400).json({
      message: 'Choose a JSON file containing the choir debt list, then try importing it again.'
    });
  }

  const sourceFields = ['debt_2025', 'debt_2026', 'total', 'notes'];
  const validRows = rows.every(row => row && typeof row === 'object'
    && !Array.isArray(row)
    && Number.isInteger(row.sn)
    && row.sn > 0
    && typeof row.name === 'string'
    && row.name.trim().length > 0
    && row.name.length <= 160
    && isOptionalLedgerText(row.other_name, 160)
    && (row.row_number === undefined
      || (Number.isInteger(row.row_number) && row.row_number >= 1 && row.row_number <= 2000))
    && sourceFields.every(field => isOptionalLedgerText(row[field], 1200)));
  const rowNumbers = rows.map((row, index) => row?.row_number ?? index + 1);

  if (!validRows || new Set(rowNumbers).size !== rowNumbers.length) {
    return res.status(400).json({
      message: 'Some rows in this file are missing a name or contain values in an unexpected format. The file was not imported.'
    });
  }

  const entries = rows.map((row, index) => {
    const rowNumber = row.row_number ?? index + 1;
    return {
      source_import_key: `legacy-debt-list-v1-${String(rowNumber).padStart(4, '0')}`,
      source_row_number: rowNumber,
      source_serial: row.sn,
      source_member_name: row.name,
      source_other_name: row.other_name,
      member_name: row.name,
      other_name: row.other_name,
      source_debt_2025: row.debt_2025,
      source_debt_2026: row.debt_2026,
      source_total: row.total,
      source_notes: row.notes,
      review_status: 'needs_review',
      created_by: req.user.id
    };
  });

  try {
    let imported = 0;
    for (let index = 0; index < entries.length; index += 100) {
      const { data, error } = await supabaseAdmin
        .from('debt_ledger_entries')
        .upsert(entries.slice(index, index + 100), {
          onConflict: 'source_import_key',
          ignoreDuplicates: true
        })
        .select('id');
      if (error) throw error;
      imported += data?.length || 0;
    }

    res.status(201).json({
      imported,
      alreadyPresent: entries.length - imported,
      message: imported
        ? `${imported} source records were added. Existing records and finance updates were left unchanged.`
        : 'These source records have already been imported. No information was changed.'
    });
  } catch (error) {
    console.error('[Debt Ledger] Source import failed:', error.message);
    res.status(503).json({
      message: 'The source list could not be saved. Please try again; records already imported will not be duplicated.'
    });
  }
});

app.post('/api/debt-ledger/records', authMiddleware, adminOrExco, async (req, res) => {
  const memberName = typeof req.body?.member_name === 'string' ? req.body.member_name : '';
  const otherName = req.body?.other_name ?? null;
  if (memberName.trim().length < 1 || memberName.length > 160 || !isOptionalLedgerText(otherName, 160)) {
    return res.status(400).json({ message: 'Enter the member’s name and check the optional name field.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('debt_ledger_entries')
      .insert([{
        source_member_name: memberName,
        source_other_name: otherName,
        member_name: memberName,
        other_name: otherName,
        review_status: 'reviewed',
        created_by: req.user.id
      }])
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, message: 'Member added to the ledger.' });
  } catch (error) {
    console.error('[Debt Ledger] Could not add member:', error.message);
    res.status(503).json({ message: 'The member could not be added. Please try again.' });
  }
});

app.post('/api/debt-ledger/records/manual', authMiddleware, adminOrExco, async (req, res) => {
  const memberName = typeof req.body?.member_name === 'string' ? req.body.member_name.trim() : '';
  const otherName = req.body?.other_name === '' || req.body?.other_name === undefined
    ? null
    : req.body.other_name;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const amount = parseOptionalLedgerAmount(req.body?.amount_ngn);
  const year = parseOptionalLedgerYear(req.body?.year);
  const month = parseOptionalLedgerMonth(req.body?.month);
  const category = req.body?.category;

  if (!memberName || memberName.length > 160
      || !isOptionalLedgerText(otherName, 160)
      || !title || title.length > 160
      || amount === null || amount === undefined
      || year === undefined || month === undefined
      || !debtLedgerCategories.has(category)) {
    return res.status(400).json({
      message: 'Enter the member name, debt description, a valid amount, and a valid debt type, year, or month.'
    });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('create_debt_ledger_record', {
      p_member_name: memberName,
      p_other_name: otherName,
      p_title: title,
      p_category: category,
      p_amount_ngn: amount,
      p_period_year: year,
      p_period_month: month,
      p_created_by: req.user.id
    });
    if (error) throw error;
    res.status(201).json({ id: data, message: 'Member and confirmed debt added to the ledger.' });
  } catch (error) {
    console.error('[Debt Ledger] Could not add manual debt:', error.message);
    res.status(503).json({
      message: 'The member and debt could not be saved together. Please try again; no partial entry was added.'
    });
  }
});

app.put('/api/debt-ledger/records/:id', authMiddleware, adminOrExco, async (req, res) => {
  if (!debtLedgerRecordIdPattern.test(req.params.id)) {
    return res.status(400).json({ message: 'That ledger record could not be found.' });
  }

  const updates = {};
  if (req.body?.review_status === 'reviewed') updates.review_status = 'reviewed';
  if (typeof req.body?.member_name === 'string') {
    if (!req.body.member_name.trim() || req.body.member_name.length > 160) {
      return res.status(400).json({ message: 'Enter a member name up to 160 characters long.' });
    }
    updates.member_name = req.body.member_name;
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'other_name')) {
    if (!isOptionalLedgerText(req.body.other_name, 160)) {
      return res.status(400).json({ message: 'The optional name must be 160 characters or fewer.' });
    }
    updates.other_name = req.body.other_name;
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ message: 'Choose a valid ledger update and try again.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('debt_ledger_entries')
      .update(updates)
      .eq('id', req.params.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'That ledger record could not be found.' });
    res.json({ message: 'Ledger record updated.' });
  } catch (error) {
    console.error('[Debt Ledger] Could not update record:', error.message);
    res.status(503).json({ message: 'The ledger record could not be updated. Please try again.' });
  }
});

app.post('/api/debt-ledger/records/:id/obligations', authMiddleware, adminOrExco, async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : '';
  const amount = Number(req.body?.amount_ngn);
  const year = parseOptionalLedgerYear(req.body?.year);
  const month = parseOptionalLedgerMonth(req.body?.month);
  const category = req.body?.category;
  if (!debtLedgerRecordIdPattern.test(req.params.id)
      || title.trim().length < 1 || title.length > 160
      || !Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99
      || !debtLedgerCategories.has(category)
      || year === undefined || month === undefined) {
    return res.status(400).json({
      message: 'Check the debt description, type, amount, year, and month. The amount must be greater than zero.'
    });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('debt_ledger_obligations')
      .insert([{
        entry_id: req.params.id,
        title,
        category,
        amount_ngn: amount,
        period_year: year,
        period_month: month,
        created_by: req.user.id
      }])
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, message: 'The debt or levy was added.' });
  } catch (error) {
    console.error('[Debt Ledger] Could not add obligation:', error.message);
    res.status(503).json({
      message: 'The debt or levy could not be added. Check that the member is still on the ledger and try again.'
    });
  }
});

app.post('/api/debt-ledger/obligations/:id/payments', authMiddleware, adminOrExco, async (req, res) => {
  if (!debtLedgerRecordIdPattern.test(req.params.id)) {
    return res.status(400).json({ message: 'That debt entry could not be found.' });
  }

  const amount = Number(req.body?.amount_ngn);
  const reference = req.body?.reference === '' ? null : req.body?.reference ?? null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99
      || !isOptionalLedgerText(reference, 120)) {
    return res.status(400).json({
      message: 'Enter a payment amount greater than zero and a payment reference no longer than 120 characters.'
    });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('record_debt_ledger_payment', {
      p_obligation_id: req.params.id,
      p_amount_ngn: amount,
      p_reference: reference,
      p_recorded_by: req.user.id
    });
    if (error) {
      if (error.message.includes('payment exceeds outstanding balance')) {
        return res.status(409).json({
          message: 'That amount is more than the remaining balance. Refresh the ledger and enter the amount actually received.'
        });
      }
      if (error.message.includes('obligation not found')) {
        return res.status(404).json({ message: 'That debt entry could not be found.' });
      }
      throw error;
    }
    res.status(201).json({ payment: data, message: 'Payment recorded and the remaining balance updated.' });
  } catch (error) {
    console.error('[Debt Ledger] Could not record payment:', error.message);
    res.status(503).json({ message: 'The payment could not be recorded. No payment was added; please try again.' });
  }
});

// ==================== MUSIC BOOM TICKETS ====================

app.use('/api/tickets', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

async function expireTicketReservations() {
  const { error } = await supabaseAdmin.rpc('expire_ticket_reservations');
  if (error) throw error;
}

app.get('/api/tickets/config', async (req, res) => {
  try {
    const [packageResult, salesResult] = await Promise.all([
      supabaseAdmin
        .from('ticket_packages')
        .select('id, slug, name, price_ngn, description, capacity, active')
        .eq('active', true)
        .order('price_ngn', { ascending: true }),
      supabaseAdmin.from('ticket_sales_summary').select('package_id, available')
    ]);
    if (packageResult.error) throw packageResult.error;
    if (salesResult.error) throw salesResult.error;

    const availability = new Map((salesResult.data || [])
      .filter(row => row.available !== null)
      .map(row => [row.package_id, row.available]));
    const packages = (packageResult.data || []).map(item => ({
      ...item,
      available: availability.get(item.id) ?? null
    }));

    res.set('Cache-Control', 'no-store');
    res.json({
      packages,
      bank: {
        name: process.env.BANK_ACCOUNT_NAME || '',
        number: process.env.BANK_ACCOUNT_NUMBER || '',
        bank: process.env.BANK_NAME || ''
      },
      bankConfigured: Boolean(
        process.env.BANK_ACCOUNT_NAME
        && process.env.BANK_ACCOUNT_NUMBER
        && process.env.BANK_NAME
      )
    });
  } catch (error) {
    console.error('[Tickets] Could not load ticket configuration:', error.message);
    res.status(503).json({ message: 'Ticket sales are temporarily unavailable. Please try again later.' });
  }
});

app.post('/api/tickets/orders', ticketSubmissionLimit, async (req, res) => {
  const { package_id: packageId, quantity } = req.body;
  const buyerName = String(req.body.buyer_name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = normalizeTicketPhone(req.body.phone);

  if (!process.env.BANK_ACCOUNT_NAME || !process.env.BANK_ACCOUNT_NUMBER || !process.env.BANK_NAME) {
    return res.status(503).json({
      message: 'Online ticket reservations are not open yet. Please contact the choir for ticket information.'
    });
  }
  if (!Number.isInteger(Number(packageId)) || Number(packageId) < 1
      || !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 20
      || buyerName.length < 2 || buyerName.length > 120
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || !/^\+?\d{10,15}$/.test(phone)) {
    return res.status(400).json({
      message: 'Please check your ticket choice, quantity, name, email address, and phone number.'
    });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('reserve_ticket_order', {
      p_package_id: Number(packageId),
      p_quantity: Number(quantity),
      p_buyer_name: buyerName,
      p_email: email,
      p_phone: phone,
      p_code: createTicketCode(12)
    });
    if (error) {
      console.error('[Tickets] Reservation was not created:', error.message);
      return res.status(409).json({
        message: error.message.includes('not enough tickets')
          ? 'There are not enough tickets left in that package.'
          : 'We could not reserve those tickets. Please check the package and try again.'
      });
    }

    res.status(201).json({
      order: {
        code: data.code,
        buyer_name: data.buyer_name,
        email: data.email,
        quantity: data.quantity,
        amount_ngn: data.amount_ngn,
        expires_at: data.expires_at,
        status: data.status
      },
      bank: {
        name: process.env.BANK_ACCOUNT_NAME,
        number: process.env.BANK_ACCOUNT_NUMBER,
        bank: process.env.BANK_NAME
      }
    });
  } catch (error) {
    console.error('[Tickets] Reservation error:', error.message);
    res.status(500).json({ message: 'We could not reserve your tickets just now. Please try again.' });
  }
});

app.get('/api/tickets/orders/:code', ticketSubmissionLimit, async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter the order code and email address used when ordering.' });
  }

  try {
    await expireTicketReservations();
    const { data: order, error } = await supabaseAdmin
      .from('ticket_orders')
      .select('code, buyer_name, email, quantity, amount_ngn, status, expires_at, created_at, paid_at, rejection_reason, email_status, ticket_packages(name), issued_tickets(code, serial, status)')
      .eq('code', code)
      .eq('email', email)
      .single();
    if (error || !order) return res.status(404).json({ message: 'We could not find an order matching those details.' });
    res.set('Cache-Control', 'no-store');
    res.json({ order });
  } catch (error) {
    console.error('[Tickets] Order lookup failed:', error.message);
    res.status(500).json({ message: 'We could not check that order right now. Please try again.' });
  }
});

app.post('/api/tickets/orders/:code/proof', ticketSubmissionLimit, ticketProofUpload.single('receipt'), async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const email = String(req.body.email || '').trim().toLowerCase();
  const reference = String(req.body.payment_reference || '').trim().slice(0, 120);
  const file = req.file;
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter the order code and email address used when ordering.' });
  }
  if (!reference && !file) {
    return res.status(400).json({ message: 'Enter your transfer reference or upload a payment receipt.' });
  }
  if (file && !isValidTicketImage(file)) {
    return res.status(400).json({ message: 'Please upload a valid JPG, PNG, WebP, or PDF payment receipt.' });
  }

  let proofPath = null;
  try {
    if (file) {
      const extension = ({
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'application/pdf': 'pdf'
      })[file.mimetype];
      proofPath = `${code}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(ticketProofBucket)
        .upload(proofPath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (uploadError) throw uploadError;
    }

    const { data, error } = await supabaseAdmin.rpc('submit_ticket_payment_proof', {
      p_order_code: code,
      p_email: email,
      p_payment_reference: reference || null,
      p_proof_path: proofPath
    });
    if (error) {
      if (proofPath) await supabaseAdmin.storage.from(ticketProofBucket).remove([proofPath]);
      return res.status(409).json({
        message: error.message.includes('expired')
          ? 'This reservation has expired. Please start a new order.'
          : error.message.includes('already used')
            ? 'That transfer reference has already been submitted.'
            : 'We could not submit those payment details. Check your order and try again.'
      });
    }
    if (data.status === 'expired') {
      if (proofPath) await supabaseAdmin.storage.from(ticketProofBucket).remove([proofPath]);
      return res.status(409).json({ message: 'This reservation has expired. Please start a new order.' });
    }
    res.json({ message: 'Payment details received. The choir team will review them and email you when your payment is confirmed.', status: data.status });
  } catch (error) {
    console.error('[Tickets] Payment proof submission failed:', error.message);
    if (proofPath) {
      const { error: cleanupError } = await supabaseAdmin.storage.from(ticketProofBucket).remove([proofPath]);
      if (cleanupError) console.error('[Tickets] Could not remove unused receipt upload:', cleanupError.message);
    }
    res.status(500).json({ message: 'We could not submit your payment details right now. Please try again.' });
  }
});

app.get('/api/tickets/admin/summary', authMiddleware, adminOrExco, async (req, res) => {
  try {
    await expireTicketReservations();
    const [statsResult, auditResult] = await Promise.all([
      supabaseAdmin.from('ticket_sales_summary').select('*').order('price_ngn', { ascending: true }),
      supabaseAdmin.from('ticket_audit_log')
        .select('id, at, actor, action, entity, entity_id, details, previous_hash, entry_hash')
        .order('id', { ascending: false }).limit(30)
    ]);
    if (statsResult.error) throw statsResult.error;
    if (auditResult.error) throw auditResult.error;
    res.json({ stats: statsResult.data || [], audit: auditResult.data || [] });
  } catch (error) {
    console.error('[Tickets] Could not load admin summary:', error.message);
    res.status(500).json({ message: 'Ticket sales summary could not be loaded.' });
  }
});

app.get('/api/tickets/admin/orders', authMiddleware, adminOrExco, async (req, res) => {
  const allowedStatuses = new Set(['reserved', 'pending_review', 'paid', 'rejected']);
  const status = String(req.query.status || 'pending_review');
  if (!allowedStatuses.has(status)) return res.status(400).json({ message: 'Choose a valid order status.' });

  try {
    await expireTicketReservations();
    const { data, error } = await supabaseAdmin
      .from('ticket_orders')
      .select('*, ticket_packages(name, slug), issued_tickets(id, code, serial, status, used_at)')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const orders = await Promise.all((data || []).map(async order => {
      if (order.proof_path) {
        const { data: signed, error: signedError } = await supabaseAdmin.storage
          .from(ticketProofBucket)
          .createSignedUrl(order.proof_path, 300);
        if (signedError) console.error('[Tickets] Receipt preview link failed:', signedError.message);
        order.proof_url = signed?.signedUrl || null;
      }
      return order;
    }));
    res.set('Cache-Control', 'no-store');
    res.json({ orders });
  } catch (error) {
    console.error('[Tickets] Could not load ticket orders:', error.message);
    res.status(500).json({ message: 'Ticket orders could not be loaded.' });
  }
});

app.get('/api/tickets/admin/sellers', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, username, role')
      .order('full_name', { ascending: true })
      .limit(500);
    if (error) throw error;
    res.json({ sellers: data || [] });
  } catch (error) {
    console.error('[Tickets] Could not load seller list:', error.message);
    res.status(500).json({ message: 'The choir seller list could not be loaded.' });
  }
});

app.post('/api/tickets/admin/orders/:id/approve', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('approve_ticket_order', {
      p_order_id: req.params.id,
      p_actor: req.user.id,
      p_ticket_codes: ticketCodes(Number(req.body.quantity || 0))
    });
    if (error) {
      console.error('[Tickets] Order approval failed:', error.message);
      return res.status(409).json({ message: 'This order could not be approved. Refresh the list and check its status.' });
    }

    const order = data.order;
    const tickets = data.tickets || [];
    const { data: ticketPackage, error: packageError } = await supabaseAdmin
      .from('ticket_packages')
      .select('name')
      .eq('id', order.package_id)
      .single();
    if (packageError) console.error('[Tickets] Approved package name lookup failed:', packageError.message);

    let emailStatus;
    try {
      emailStatus = await deliverTicketEmail(order, tickets, ticketPackage?.name || 'Choir event');
    } catch (emailError) {
      emailStatus = 'failed';
      console.error('[Tickets] Confirmed tickets could not be emailed:', emailError.message);
    }
    const { error: updateEmailError } = await supabaseAdmin
      .from('ticket_orders')
      .update({
        email_status: emailStatus,
        email_error: emailStatus === 'failed' ? 'Email delivery failed. Retry after checking SMTP settings.' : null
      })
      .eq('id', order.id)
      .eq('status', 'paid');
    if (updateEmailError) console.error('[Tickets] Could not update ticket email status:', updateEmailError.message);

    res.json({
      message: emailStatus === 'sent'
        ? 'Payment confirmed and tickets emailed to the buyer.'
        : 'Payment confirmed and tickets created. Email delivery needs attention in settings.',
      email_status: emailStatus,
      ticket_count: tickets.length
    });
  } catch (error) {
    console.error('[Tickets] Order approval error:', error.message);
    res.status(500).json({ message: 'The order could not be approved right now.' });
  }
});

app.post('/api/tickets/admin/orders/:id/reject', authMiddleware, adminOrExco, async (req, res) => {
  const reason = String(req.body.reason || '').trim().slice(0, 300);
  try {
    const { error } = await supabaseAdmin.rpc('reject_ticket_order', {
      p_order_id: req.params.id,
      p_actor: req.user.id,
      p_reason: reason || 'Payment could not be confirmed'
    });
    if (error) {
      console.error('[Tickets] Order rejection failed:', error.message);
      return res.status(409).json({ message: 'This order could not be rejected. Refresh the list and check its status.' });
    }
    res.json({ message: 'Order marked as rejected.' });
  } catch (error) {
    console.error('[Tickets] Order rejection error:', error.message);
    res.status(500).json({ message: 'The order could not be rejected right now.' });
  }
});

app.post('/api/tickets/admin/orders/:id/resend', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabaseAdmin
      .from('ticket_orders')
      .select('*, ticket_packages(name), issued_tickets(code, serial)')
      .eq('id', req.params.id)
      .eq('status', 'paid')
      .single();
    if (orderError || !order) return res.status(404).json({ message: 'A paid order with tickets could not be found.' });
    if (!order.email) return res.status(400).json({ message: 'This order does not have a buyer email address.' });

    const emailStatus = await deliverTicketEmail(
      order,
      order.issued_tickets || [],
      order.ticket_packages?.name || 'Choir event'
    );
    const { error: updateError } = await supabaseAdmin
      .from('ticket_orders')
      .update({
        email_status: emailStatus,
        email_error: emailStatus === 'sent' ? null : 'Email settings are not configured.'
      })
      .eq('id', order.id)
      .eq('status', 'paid');
    if (updateError) throw updateError;
    if (emailStatus !== 'sent') {
      return res.status(503).json({
        message: 'Ticket email is not configured. Add the SMTP settings before retrying.',
        email_status: emailStatus
      });
    }
    res.json({ message: 'Tickets have been emailed to the buyer.', email_status: 'sent' });
  } catch (error) {
    console.error('[Tickets] Ticket email retry failed:', error.message);
    const { error: updateError } = await supabaseAdmin
      .from('ticket_orders')
      .update({
        email_status: getTicketMailTransport() ? 'failed' : 'not_configured',
        email_error: 'Email delivery failed. Check the email settings and try again.'
      })
      .eq('id', req.params.id)
      .eq('status', 'paid');
    if (updateError) console.error('[Tickets] Could not update failed email status:', updateError.message);
    res.status(503).json({
      message: getTicketMailTransport()
        ? 'The ticket email could not be sent. Check the mail settings and try again.'
        : 'Ticket email is not configured. Add the SMTP settings before retrying.'
    });
  }
});

app.post('/api/tickets/admin/physical-sales', authMiddleware, adminOrExco, async (req, res) => {
  const packageId = Number(req.body.package_id);
  const quantity = Number(req.body.quantity);
  const buyerName = String(req.body.buyer_name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = normalizeTicketPhone(req.body.phone);
  const requestedSellerName = String(req.body.seller_name || '').trim();
  const serials = Array.isArray(req.body.serials)
    ? req.body.serials.map(serial => String(serial).trim().toUpperCase())
    : String(req.body.serials || '').split(/[\s,]+/).filter(Boolean).map(serial => serial.toUpperCase());
  const sellerId = req.body.seller_id ? String(req.body.seller_id) : null;
  if (!Number.isInteger(packageId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20
      || buyerName.length < 2 || buyerName.length > 120
      || requestedSellerName.length < 2 || requestedSellerName.length > 120
      || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      || !/^\+?\d{10,15}$/.test(phone)
      || serials.length !== quantity
      || serials.some(serial => !/^[A-Z0-9-]{3,40}$/.test(serial))
      || new Set(serials).size !== serials.length) {
    return res.status(400).json({ message: 'Check the buyer details, quantity, and provide one unique printed serial number per ticket.' });
  }
  try {
    let sellerName = requestedSellerName;
    if (sellerId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sellerId)) {
        return res.status(400).json({ message: 'Choose a listed choir member or enter a seller name.' });
      }
      const { data: seller, error: sellerError } = await supabaseAdmin
        .from('users').select('id, full_name, username').eq('id', sellerId).single();
      if (sellerError || !seller) return res.status(400).json({ message: 'Choose a listed choir member or enter a seller name.' });
      sellerName = seller.full_name || seller.username || requestedSellerName;
    }

    const codes = ticketCodes(quantity);
    const { data, error } = await supabaseAdmin.rpc('record_physical_ticket_sale', {
      p_package_id: packageId,
      p_quantity: quantity,
      p_buyer_name: buyerName,
      p_email: email || null,
      p_phone: phone,
      p_seller_id: sellerId,
      p_seller_name: sellerName,
      p_actor: req.user.id,
      p_order_code: createTicketCode(12),
      p_ticket_codes: codes,
      p_serials: serials
    });
    if (error) {
      console.error('[Tickets] Physical sale recording failed:', error.message);
      return res.status(409).json({ message: 'This sale could not be recorded. Check the package and make sure the ticket serials have not already been sold.' });
    }

    let emailStatus = 'not_sent';
    if (email) {
      try {
        const { data: ticketPackage } = await supabaseAdmin
          .from('ticket_packages').select('name').eq('id', packageId).single();
        emailStatus = await deliverTicketEmail(data.order, data.tickets || [], ticketPackage?.name || 'Choir event');
      } catch (emailError) {
        emailStatus = 'failed';
        console.error('[Tickets] Physical ticket email failed:', emailError.message);
      }
      const { error: updateEmailError } = await supabaseAdmin
        .from('ticket_orders')
        .update({
          email_status: emailStatus,
          email_error: emailStatus === 'failed' ? 'Email delivery failed. Retry after checking SMTP settings.' : null
        })
        .eq('id', data.order.id)
        .eq('status', 'paid');
      if (updateEmailError) console.error('[Tickets] Physical sale email status update failed:', updateEmailError.message);
    }

    res.status(201).json({
      message: emailStatus === 'sent'
        ? 'Physical sale recorded and tickets emailed.'
        : 'Physical sale recorded. Give the printed tickets to the buyer.',
      order: data.order,
      tickets: data.tickets || [],
      email_status: emailStatus
    });
  } catch (error) {
    console.error('[Tickets] Physical sale error:', error.message);
    res.status(500).json({ message: 'The physical sale could not be recorded right now.' });
  }
});

app.post('/api/tickets/admin/check-in', authMiddleware, adminOrExco, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) {
    return res.status(400).json({ message: 'Scan a ticket QR code or enter its printed serial number.' });
  }
  try {
    const { data, error } = await supabaseAdmin.rpc('check_in_ticket', {
      p_code: code,
      p_actor: req.user.id
    });
    if (error) throw error;
    const result = {
      invalid: 'This ticket was not found. Check the QR code or printed serial.',
      already_used: 'This ticket has already been scanned at the entrance.',
      ok: 'Ticket checked in. Welcome!'
    };
    res.json({ ...data, message: result[data.result] || 'Ticket check-in complete.' });
  } catch (error) {
    console.error('[Tickets] Check-in failed:', error.message);
    res.status(500).json({ message: 'We could not check in this ticket. Please try again.' });
  }
});

// ==================== EVENTS ROUTES ====================

app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await buildQuery('events', req, 'id, title, type, description, event_date, event_time, location, image_url, created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Events list error:', err);
    res.status(500).json({ message: 'Failed to fetch events' });
  }
});

app.post('/api/events', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { title, type, event_date, event_time, description, location, image_url, created_by } = req.body;
    const { data, error } = await supabaseAdmin
      .from('events')
      .insert([{ title, type, event_date, event_time, description, location, image_url, created_by: created_by || req.user.id }])
      .select()
      .single();

    if (error) throw error;

    if (data) {
      try {
        await createNotification({
          title: 'New Event Created',
          message: `${title} - ${type || 'Event'} on ${event_date || 'TBD'}${event_time ? ' at ' + event_time : ''}`,
          icon: 'event',
          user_id: null
        });
      } catch (notifErr) {
        console.error('Failed to create event notification:', notifErr);
      }
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Event create error:', err);
    res.status(500).json({ message: 'Failed to create event' });
  }
});

app.put('/api/events/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin
      .from('events')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ message: 'Event not found' });
    res.json(data);
  } catch (err) {
    console.error('Event update error:', err);
    res.status(500).json({ message: 'Failed to update event' });
  }
});

app.delete('/api/events/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Event delete error:', err);
    res.status(500).json({ message: 'Failed to delete event' });
  }
});

// ==================== EVENT SONGS ROUTES ====================

app.get('/api/event-songs', async (req, res) => {
  try {
    const { event_id } = req.query;
    let query = supabaseAdmin.from('event_songs').select('*');
    
    if (event_id) {
      query = query.eq('event_id', event_id);
    }
    
    const { data, error } = await query.order('order_number', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Event songs list error:', err);
    res.status(500).json({ message: 'Failed to fetch event songs' });
  }
});

app.post('/api/event-songs', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { event_id, title, category, order_number, notes } = req.body;
    const { data, error } = await supabaseAdmin
      .from('event_songs')
      .insert([{ event_id, title, category, order_number: order_number || 1, notes }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Event song create error:', err);
    res.status(500).json({ message: 'Failed to create event song' });
  }
});

app.put('/api/event-songs/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { title, category, order_number, notes } = req.body;
    const { data, error } = await supabaseAdmin
      .from('event_songs')
      .update({ title, category, order_number, notes, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ message: 'Event song not found' });
    res.json(data);
  } catch (err) {
    console.error('Event song update error:', err);
    res.status(500).json({ message: 'Failed to update event song' });
  }
});

app.delete('/api/event-songs/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('event_songs')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Event song delete error:', err);
    res.status(500).json({ message: 'Failed to delete event song' });
  }
});

// ==================== SONG LISTS ROUTES ====================

app.get('/api/song-lists', async (req, res) => {
  try {
    const { event_id } = req.query;
    let query = supabaseAdmin.from('song_lists').select('*');

    if (event_id) {
      query = query.eq('event_id', event_id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    const songLists = data || [];
    const eventIds = [...new Set(songLists.map(sl => sl.event_id).filter(Boolean))];

    let eventMap = {};
    if (eventIds.length > 0) {
      const { data: events } = await supabaseAdmin
        .from('events')
        .select('id, title')
        .in('id', eventIds);
      (events || []).forEach(e => {
        eventMap[e.id] = e.title;
      });
    }

    const normalized = songLists.map(item => ({
      ...item,
      event_title: eventMap[item.event_id] || null
    }));

    res.json(normalized || []);
  } catch (err) {
    console.error('Song lists list error:', err);
    res.status(500).json({ message: 'Failed to fetch song lists' });
  }
});

app.post('/api/song-lists', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { event_id, status } = req.body;
    const { data, error } = await supabaseAdmin
      .from('song_lists')
      .insert([{ event_id, status: status || 'draft', created_by: req.user.id }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Song list create error:', err);
    res.status(500).json({ message: 'Failed to create song list' });
  }
});

app.put('/api/song-lists/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { status } = req.body;
    const { data, error } = await supabaseAdmin
      .from('song_lists')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ message: 'Song list not found' });

    if (status === 'published') {
      try {
        let eventTitle = data.event_id;
        try {
          const { data: event } = await supabaseAdmin
            .from('events')
            .select('title')
            .eq('id', data.event_id)
            .single();
          if (event?.title) eventTitle = event.title;
        } catch (eventErr) {
          console.error('Failed to fetch event title for notification:', eventErr);
        }

        await createNotification({
          title: 'Song Plan Published',
          message: `A new song plan has been published for "${eventTitle}"`,
          icon: 'publish',
          user_id: null
        });
      } catch (notifErr) {
        console.error('Failed to create song list notification:', notifErr);
      }
    }

    res.json(data);
  } catch (err) {
    console.error('Song list update error:', err);
    res.status(500).json({ message: 'Failed to update song list' });
  }
});

// ==================== SONG LIST ITEMS ROUTES ====================

app.get('/api/song-list-items', async (req, res) => {
  try {
    const { song_list_id } = req.query;
    let query = supabaseAdmin.from('song_list_items').select('*');
    
    if (song_list_id) {
      query = query.eq('song_list_id', song_list_id);
    }
    
    const { data, error } = await query.order('order_number', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Song list items list error:', err);
    res.status(500).json({ message: 'Failed to fetch song list items' });
  }
});

app.post('/api/song-list-items', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { song_list_id, mass_part, title, score_id, order_number, notes } = req.body;
    const { data, error } = await supabaseAdmin
      .from('song_list_items')
      .insert([{ song_list_id, mass_part, title, score_id, order_number: order_number || 1, notes }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Song list item create error:', err);
    res.status(500).json({ message: 'Failed to create song list item' });
  }
});

app.put('/api/song-list-items/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { mass_part, title, score_id, order_number, notes } = req.body;
    const { data, error } = await supabaseAdmin
      .from('song_list_items')
      .update({ mass_part, title, score_id, order_number, notes, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ message: 'Song list item not found' });
    res.json(data);
  } catch (err) {
    console.error('Song list item update error:', err);
    res.status(500).json({ message: 'Failed to update song list item' });
  }
});

app.delete('/api/song-list-items/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('song_list_items')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Song list item delete error:', err);
    res.status(500).json({ message: 'Failed to delete song list item' });
  }
});

app.delete('/api/song-lists/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('song_lists')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data || { message: 'Song list deleted' });
  } catch (err) {
    console.error('Song list delete error:', err);
    res.status(500).json({ message: 'Failed to delete song list' });
  }
});

// ==================== SONG SEARCH ROUTE ====================

app.get('/api/song-search', async (req, res) => {
  try {
    const { q = '', category = '' } = req.query;
    const results = [];
    
    const searchSupabase = async () => {
      let query = supabaseAdmin.from('scores').select('id, title, category, file_url, file_type, created_at');
      if (q) query = query.ilike('title', `%${q}%`);
      if (category) query = query.eq('category', category);
      const { data, error } = await query.limit(20);
      if (error) throw error;
      return (data || []).map(s => ({ ...s, source: 'supabase' }));
    };
    
    const searchDrive = async () => {
      try {
        const files = await driveService.listScores({ search: q });
        return files.map(f => ({ id: f.id, title: f.name || 'Untitled', category: f.properties?.category || '', file_url: f.webViewLink || '', file_type: 'pdf', source: 'drive' }));
      } catch {
        return [];
      }
    };
    
    const [supabaseResults, driveResults] = await Promise.all([searchSupabase(), searchDrive()]);
    results.push(...supabaseResults, ...driveResults);

    if (category) {
      const filtered = results.filter(r => (r.category || '').toLowerCase() === category.toLowerCase());
      results.length = 0;
      results.push(...filtered);
    }
    
    const seen = new Set();
    const unique = results.filter(r => {
      const key = `${r.title}-${r.source}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    res.json(unique);
  } catch (err) {
    console.error('Song search error:', err);
    res.status(500).json({ message: 'Failed to search songs' });
  }
});

// ==================== EXECUTIVES ROUTES ====================

app.get('/api/executives', async (req, res) => {
  try {
    const { data, error } = await buildQuery('executives', req, 'id, name, role, bio, photo_url, position_order, created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Executives list error:', err);
    res.status(500).json({ message: 'Failed to fetch executives' });
  }
});

app.post('/api/executives', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { name, role, bio, photo_url, position_order } = req.body;
    const { data, error } = await supabaseAdmin
      .from('executives')
      .insert([{ name, role, bio, photo_url, position_order: position_order || 0 }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Executive create error:', err);
    res.status(500).json({ message: 'Failed to create executive' });
  }
});

app.put('/api/executives/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin
      .from('executives')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ message: 'Executive not found' });
    res.json(data);
  } catch (err) {
    console.error('Executive update error:', err);
    res.status(500).json({ message: 'Failed to update executive' });
  }
});

app.delete('/api/executives/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('executives')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Executive delete error:', err);
    res.status(500).json({ message: 'Failed to delete executive' });
  }
});

// ==================== GALLERY ROUTES ====================

app.get('/api/gallery', async (req, res) => {
  try {
    const { data, error } = await buildQuery('gallery', req, 'id, image_url, title, caption, created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Gallery list error:', err);
    res.status(500).json({ message: 'Failed to fetch gallery' });
  }
});

app.post('/api/gallery/upload', authMiddleware, adminOrExco, upload.single('image'), async (req, res) => {
  try {
    let imageUrl = req.body.image_url;
    const file = req.file;

    if (file) {
      if (cloudinary) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({ folder: 'choir-gallery' }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }).end(file.buffer);
        });
        imageUrl = result.secure_url;
      } else {
        return res.status(500).json({ message: 'Image upload requires Cloudinary configuration' });
      }
    }

    const { title, caption } = req.body;
    const { data, error } = await supabaseAdmin
      .from('gallery')
      .insert([{ image_url: imageUrl, title, caption, uploaded_by: req.user.id }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Gallery upload error:', err);
    res.status(500).json({ message: 'Failed to upload image' });
  }
});

// ==================== NOTIFICATIONS ROUTES ====================

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('id, title, message, icon, read, created_at')
      .or(`user_id.eq.${req.user.id},user_id.is.null`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Notifications list error:', err);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { title, message, icon } = req.body;
    const data = await createNotification({ title, message, icon: icon || 'notifications', user_id: null });
    res.status(201).json(data);
  } catch (err) {
    console.error('Notification create error:', err);
    res.status(500).json({ message: 'Failed to create notification' });
  }
});

app.post('/api/notifications/mark-read', authMiddleware, async (req, res) => {
  try {
    await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .or(`user_id.eq.${req.user.id},user_id.is.null`);

    res.json({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error('Notification mark-read error:', err);
    res.status(500).json({ message: 'Failed to mark notifications as read' });
  }
});

app.delete('/api/notifications/:id', authMiddleware, async (req, res) => {
  try {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('user_id')
      .eq('id', req.params.id)
      .single();

    if (fetchError) throw fetchError;

    const isAdmin = req.user.role === 'admin' || req.user.role === 'exco';
    const isOwner = existing && existing.user_id === req.user.id;
    const isGlobal = existing && existing.user_id === null;

    if (!isAdmin && !isOwner && !isGlobal) {
      return res.status(403).json({ message: 'Not authorized to delete this notification' });
    }

    await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('id', req.params.id);

    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Notification delete error:', err);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

app.get('/api/push/vapid-public-key', authMiddleware, (req, res) => {
  if (!webPushConfigured) {
    return res.status(503).json({ message: 'Browser notifications are not configured yet.' });
  }
  res.json({ publicKey: vapidPublicKey });
});

app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
  if (!webPushConfigured) {
    return res.status(503).json({ message: 'Browser notifications are not configured yet.' });
  }

  const subscription = req.body;
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys;
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !isAllowedPushEndpoint(endpoint)
    || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    return res.status(400).json({ message: 'This device could not be registered for notifications.' });
  }

  try {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('user_id')
      .eq('endpoint', endpoint)
      .limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length && existing[0].user_id !== req.user.id) {
      return res.status(409).json({ message: 'This device is already registered to another account.' });
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        endpoint,
        user_id: req.user.id,
        subscription,
        updated_at: new Date().toISOString()
      }, { onConflict: 'endpoint' });
    if (error) throw error;

    res.status(201).json({ message: 'This device is ready to receive choir notifications.' });
  } catch (error) {
    console.error('[Push] Subscription save failed:', error.message);
    res.status(500).json({ message: 'We could not save notification settings for this device.' });
  }
});

app.delete('/api/push/subscribe', authMiddleware, async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2048) {
    return res.status(400).json({ message: 'This device could not be removed from notifications.' });
  }

  try {
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Browser notifications have been turned off for this device.' });
  } catch (error) {
    console.error('[Push] Subscription removal failed:', error.message);
    res.status(500).json({ message: 'We could not turn off notifications for this device.' });
  }
});

// ==================== ANNOUNCEMENTS ROUTES ====================

app.get('/api/announcements', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .select('id, title, message, announcement_date, announcement_time, link, created_by, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const announcements = [];
    for (const ann of (data || [])) {
      announcements.push({
        ...ann,
        created_by_name: ann.created_by ? await getUserName(ann.created_by) : 'Admin'
      });
    }

    res.json(announcements);
  } catch (err) {
    console.error('Announcements list error:', err);
    res.status(500).json({ message: 'Failed to fetch announcements' });
  }
});

app.post('/api/announcements', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { title, message, announcement_date, announcement_time, link } = req.body;
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert([{
        title,
        message,
        announcement_date: announcement_date || null,
        announcement_time: announcement_time || null,
        link: link || null,
        created_by: req.user.id
      }])
      .select()
      .single();

    if (error) throw error;
    await sendPushToUsers({
      title: data.title,
      message: data.message,
      user_id: null
    });
    res.status(201).json(data);
  } catch (err) {
    console.error('Announcement create error:', err);
    res.status(500).json({ message: 'Failed to create announcement' });
  }
});

app.put('/api/announcements/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { title, message, announcement_date, announcement_time, link } = req.body;
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .update({
        title,
        message,
        announcement_date: announcement_date || null,
        announcement_time: announcement_time || null,
        link: link || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    await sendPushToUsers({
      title: data.title,
      message: data.message,
      user_id: null
    });
    res.json(data);
  } catch (err) {
    console.error('Announcement update error:', err);
    res.status(500).json({ message: 'Failed to update announcement' });
  }
});

app.delete('/api/announcements/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    await supabaseAdmin
      .from('announcements')
      .delete()
      .eq('id', req.params.id);

    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    console.error('Announcement delete error:', err);
    res.status(500).json({ message: 'Failed to delete announcement' });
  }
});

// ==================== SETTINGS ROUTES ====================

app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || {
      email_notifications: true,
      push_notifications: false,
      two_factor_enabled: false,
      theme: 'light',
      language: 'en'
    });
  } catch (err) {
    console.error('Settings fetch error:', err);
    res.json({
      email_notifications: true,
      push_notifications: false,
      two_factor_enabled: false,
      theme: 'light',
      language: 'en'
    });
  }
});

app.put('/api/settings', authMiddleware, async (req, res) => {
  try {
    const allowed = ['email_notifications', 'push_notifications', 'two_factor_enabled', 'theme'];
    const updates = { user_id: req.user.id, updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .upsert(updates, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

// ==================== AI (Cecilia AI) ROUTE ====================

app.post('/api/ai/chat', authMiddleware, async (req, res) => {
  try {
    const { message, mode = 'general', history = [], context = 'general_portal' } = req.body;
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Please enter a message before sending.' });
    }

    const referenceAnswer = answerFromChoirReferences(message);
    if (referenceAnswer) {
      const { error: historyError } = await supabaseAdmin
        .from('chat_history')
        .insert([{ user_id: req.user.id, message, response: referenceAnswer.reply, mode: 'reference' }]);
      if (historyError) console.error('[AI] Could not save reference answer to chat history:', historyError.message);
      return res.json({ ...referenceAnswer, mode: 'reference' });
    }

    if (!groq) {
      return res.status(500).json({ message: 'AI service not configured' });
    }

    const contextMap = {
      browsing_scores: 'The user is currently browsing the choir scores library. They may be looking for specific hymns, Mass settings, or sheet music.',
      viewing_events: 'The user is viewing choir events and rehearsals. They may be asking about upcoming rehearsals, performances, or feast day music.',
      viewing_attendance: 'The user is viewing attendance records. Keep responses brief and supportive.',
      viewing_gallery: 'The user is browsing the choir photo gallery. Gently guide conversation back to music if possible.',
      viewing_members: 'The user is viewing the members directory. You can mention choir voice parts and sections.',
      viewing_profile: 'The user is viewing their own profile. Be encouraging about their musical journey.',
      member_home: 'The user is on their member home dashboard. They may be checking announcements, upcoming rehearsals, or new scores.',
      general_portal: 'The user is somewhere in the choir portal.'
    };

    const contextNote = contextMap[context] || contextMap.general_portal;

    const systemPrompt = `You are Cecilia AI, a warm and knowledgeable female liturgical music assistant for St. Cecilia Choir HTCC Naze. You are named after St. Cecilia, the patron saint of musicians, and you embody her spirit of devotion to sacred music.

Current context: ${contextNote}

Your personality:
- You are gentle, encouraging, and nurturing — like a wise choir mistress or sister guiding her choristers
- You speak with warmth and feminine grace, using phrases like "my dear chorister", "let me help you", "wonderful question"
- You are deeply knowledgeable about Catholic liturgy, Gregorian chant, polyphony, hymns, and choral music
- You are context-aware and remember previous parts of the conversation

Your focus areas:
- Liturgical music suggestions for specific Mass parts (Kyrie, Gloria, Sanctus, Agnus Dei, etc.)
- Choir repertoire and voice part guidance (Soprano, Alto, Tenor, Bass)
- Music theory, sight-singing, and solfège
- Catholic liturgical seasons, feast days, and appropriate music choices
- Choir rehearsals, techniques, and performance preparation
- History of sacred music and composers

Guidelines:
- Always keep responses focused on liturgical and sacred music
- Never invent hymn lyrics, Mass responses, or choir by-law wording. Exact questions about these sources are answered from verified text; if a source is missing or incomplete, say so plainly.
- If asked non-music questions, gently redirect: "I'm here to help with all things related to our sacred music and liturgy, my dear. Is there a particular hymn or Mass setting you'd like to explore?"
- Reference St. Cecilia's patronage of music when appropriate
- Be encouraging: "Remember, every voice in God's choir matters beautifully"
- Use musical terminology naturally: "Let us find the perfect tempo for this Kyrie", "This Gloria would shine in a 4/4 time signature with organ accompaniment"
- If you don't know something, say so humbly: "That is a beautiful question, my dear. I am still learning about this — perhaps our Choir Master can shed light on it during our next rehearsal"

Be concise but warm. Sign off occasionally with a musical blessing like "May your voices rise like incense to heaven." or "Sing with joy, my dear chorister."`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10),
      { role: 'user', content: message }
    ];

    const completion = await groq.chat.completions.create({
      model: process.env.AI_MODEL || 'llama-3.1-70b-versatile',
      messages,
      max_tokens: 1024,
      temperature: 0.7
    });

    const reply = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';

    // Save chat history
    await supabaseAdmin
      .from('chat_history')
      .insert([{ user_id: req.user.id, message, response: reply, mode }]);

    res.json({ reply, mode });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ message: 'AI service error: ' + err.message });
  }
});

app.get('/api/ai/history', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_history')
      .select('id, message, response, mode, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('AI history error:', err);
    res.status(500).json({ message: 'Failed to fetch chat history' });
  }
});

app.delete('/api/ai/history', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('chat_history')
      .delete()
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ message: 'Chat history cleared' });
  } catch (err) {
    console.error('AI history delete error:', err);
    res.status(500).json({ message: 'Failed to clear chat history' });
  }
});

// ==================== DASHBOARD STATS ====================

app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const [usersResult, scoresResult, eventsResult, attendanceResult, pendingResult] = await Promise.all([
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('scores').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('events').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('attendance').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('pledge_accepted', false)
    ]);

    res.json({
      members: usersResult.count || 0,
      scores: scoresResult.count || 0,
      events: eventsResult.count || 0,
      attendance: attendanceResult.count || 0,
      pending: pendingResult.count || 0
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

// ==================== REAL-TIME SSE ENDPOINTS ====================

app.get('/api/realtime/:table', authMiddleware, (req, res) => {
  const table = req.params.table;
  const allowedTables = ['users', 'scores', 'events', 'song_lists', 'announcements', 'notifications', 'attendance'];
  
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ message: 'Invalid table for real-time' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const subscription = supabaseAdmin
    .channel(`public:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      if (res.writableEnded || res.destroyed) return;
      const record = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      if (table === 'notifications' && record?.user_id && record.user_id !== req.user.id) return;

      const update = {
        table,
        eventType: payload.eventType,
        id: record?.id || null
      };
      if (table === 'notifications' && record) {
        update.new = {
          id: record.id,
          user_id: record.user_id,
          title: record.title,
          message: record.message,
          created_at: record.created_at
        };
      }
      res.write(`data: ${JSON.stringify(update)}\n\n`);
    })
    .subscribe();

  res.on('close', () => {
    supabaseAdmin.removeChannel(subscription);
  });
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/cron/keep-supabase-alive', async (req, res) => {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = req.get('authorization') || '';
  const suppliedSecret = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';

  if (!expectedSecret) {
    console.error('[KeepAlive] CRON_SECRET is not configured.');
    return res.status(503).json({ message: 'Scheduled database check is not configured.' });
  }

  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  try {
    const { error } = await supabaseAdmin.from('users').select('id').limit(1);
    if (error) throw error;
    res.json({ status: 'ok', checked_at: new Date().toISOString() });
  } catch (error) {
    console.error('[KeepAlive] Supabase database check failed:', error.message);
    res.status(503).json({ message: 'The database could not be reached.' });
  }
});

// ==================== FALLBACK ====================

app.use((err, req, res, next) => {
  if (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: req.path.startsWith('/api/tickets/')
          ? 'Your payment receipt must be 4 MB or smaller. Please choose a smaller file.'
          : 'File size exceeds the 10 MB limit. Please choose a smaller file.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Please upload only one payment receipt.' });
    }
    console.error('Unhandled server error:', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
  next();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== AUTOMATED NOTIFICATIONS ====================

const REHEARSAL_SCHEDULE = [
  { day: 3, label: 'Wednesdays', target: 'Children Cardet Choir', time: '17:00' },
  { day: 5, label: 'Fridays', target: 'Adults', time: '17:00' },
  { day: 6, label: 'Saturdays', target: 'All Choristers', time: '17:00' }
];

function getNextOccurrence(dayOfWeek, hour, minute) {
  const now = new Date();
  const result = new Date(now);
  result.setHours(hour, minute, 0, 0);
  const currentDay = now.getDay();
  let daysUntil = (dayOfWeek - currentDay + 7) % 7;
  if (daysUntil === 0 && result <= now) daysUntil = 7;
  result.setDate(now.getDate() + daysUntil);
  return result;
}

async function sendRehearsalReminders() {
  try {
    const now = new Date();
    const notificationsToCreate = [];

    for (const slot of REHEARSAL_SCHEDULE) {
      const [hour, minute] = slot.time.split(':').map(Number);
      const nextRehearsal = getNextOccurrence(slot.day, hour, minute);
      const diffMs = nextRehearsal - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours > 22 && diffHours < 26) {
        notificationsToCreate.push({
          title: `Reminder: ${slot.label} Rehearsal`,
          message: `Join us for ${slot.target} choir practice today at ${slot.time === '17:00' ? '5:00 PM WAT' : slot.time}.`,
          icon: 'notifications_active'
        });
      }

      if (diffHours > 0 && diffHours < 2) {
        const exists = await supabaseAdmin
          .from('notifications')
          .select('id')
          .eq('title', `Reminder: ${slot.label} Rehearsal`)
          .gte('created_at', new Date(now - 1000 * 60 * 60 * 24).toISOString())
          .limit(1);

        if (!exists.error && exists.data && exists.data.length === 0) {
          notificationsToCreate.push({
            title: `Coming Up: ${slot.label} Rehearsal in 1 hour`,
            message: `Get ready! ${slot.target} rehearsal starts in 1 hour at ${slot.time === '17:00' ? '5:00 PM WAT' : slot.time}.`,
            icon: 'event'
          });
        }
      }
    }

    for (const note of notificationsToCreate) {
      await createNotification({ ...note, user_id: null });
    }

    if (notificationsToCreate.length > 0) {
      console.log(`[Notifications] Sent ${notificationsToCreate.length} rehearsal reminder(s)`);
    }
  } catch (err) {
    console.error('[Notifications] Automation error:', err);
  }
}

sendRehearsalReminders();
setInterval(sendRehearsalReminders, 1000 * 60 * 60);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
