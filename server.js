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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Supabase clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

// Multer for file uploads
const upload = multer({ dest: 'uploads/' });

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

    if (!email || !password || !metadata.username || !metadata.full_name || !metadata.phone_number || !metadata.address) {
      return res.status(400).json({ message: 'All required fields must be provided' });
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
    const { email, password } = req.body;

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
      { expiresIn: '7d' }
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
      .select('id, email, username, full_name, phone_number, address, date_of_birth, marital_status, choir_part, executive_position, tenure, pledge_accepted, role, created_at, updated_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
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
    const { data, error } = await buildQuery('users', req, 'id, email, username, full_name, phone_number, address, choir_part, executive_position, role, created_at');

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
      .select('id, email, username, full_name, phone_number, address, date_of_birth, marital_status, choir_part, executive_position, tenure, pledge_accepted, role, created_at, updated_at')
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
      .select('id, email, username, full_name, phone_number, address, date_of_birth, marital_status, choir_part, executive_position, tenure, pledge_accepted, role, created_at, updated_at')
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
    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('User delete error:', err);
    res.status(500).json({ message: 'Failed to delete user' });
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

const driveUpload = multer({ storage: multer.memoryStorage() });
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

    const driveFile = await driveService.uploadScore(req.file.buffer, fileName, category);

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
    res.json(data || []);
  } catch (err) {
    console.error('Attendance list error:', err);
    res.status(500).json({ message: 'Failed to fetch attendance' });
  }
});

app.post('/api/attendance', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { date, type, member_id, status, reason, event_name, event_date, ...rest } = req.body;
    const payload = {
      event_name: type || event_name,
      event_date: date || event_date,
      member_id,
      status: status || 'absent',
      reason,
      marked_by: req.user.id,
      ...rest
    };
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Attendance create error:', err);
    res.status(500).json({ message: 'Failed to create attendance record' });
  }
});

app.put('/api/attendance/:id', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { status, reason } = req.body;
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .update({ status, reason, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ message: 'Attendance record not found' });
    res.json(data);
  } catch (err) {
    console.error('Attendance update error:', err);
    res.status(500).json({ message: 'Failed to update attendance' });
  }
});

// ==================== EVENTS ROUTES ====================

app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await buildQuery('events', req, 'id, title, description, event_date, location, image_url, created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Events list error:', err);
    res.status(500).json({ message: 'Failed to fetch events' });
  }
});

app.post('/api/events', authMiddleware, adminOrExco, async (req, res) => {
  try {
    const { title, description, event_date, location, image_url } = req.body;
    const { data, error } = await supabaseAdmin
      .from('events')
      .insert([{ title, description, event_date, location, image_url }])
      .select()
      .single();

    if (error) throw error;
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
          }).end(fs.readFileSync(file.path));
        });
        imageUrl = result.secure_url;
        fs.unlinkSync(file.path);
      } else {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const filename = Date.now() + '-' + file.originalname;
        const dest = path.join(uploadDir, filename);
        fs.renameSync(file.path, dest);
        imageUrl = '/uploads/' + filename;
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
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert([{ title, message, icon: icon || 'notifications', user_id: null }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Notification create error:', err);
    res.status(500).json({ message: 'Failed to create notification' });
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
  const allowedTables = ['users', 'scores', 'events', 'executives', 'gallery', 'notifications', 'attendance', 'chat_history'];
  
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
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    })
    .subscribe();

  req.on('close', () => {
    supabaseAdmin.removeChannel(subscription);
  });
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== FALLBACK ====================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
