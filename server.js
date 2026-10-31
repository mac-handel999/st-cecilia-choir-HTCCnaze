require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await buildQuery('events', req, 'id, title, description, event_date, event_time, location, image_url, created_at');

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
    if (!message) return res.status(400).json({ message: 'Message is required' });

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
      return res.status(400).json({ message: 'File size exceeds 10MB limit. Please choose a smaller PDF.' });
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
