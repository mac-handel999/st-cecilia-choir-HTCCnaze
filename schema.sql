-- St. Cecilia Choir HTCC Naze - Supabase Database Schema
-- Run this entire SQL script in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  address TEXT NOT NULL,
  date_of_birth TEXT,
  marital_status TEXT CHECK (marital_status IN ('married', 'single')),
  choir_part TEXT CHECK (choir_part IN ('soprano', 'alto', 'tenor', 'bass', 'baritone', 'others')),
  executive_position TEXT,
  tenure TEXT,
  pledge_accepted BOOLEAN DEFAULT FALSE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'exco', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- SCORES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  public_id TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  type TEXT CHECK (type IN ('Mass/Liturgy', 'Rehearsal', 'Concert', 'Social Gathering')),
  event_date TEXT NOT NULL,
  time TEXT,
  description TEXT,
  location TEXT,
  image_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- EXECUTIVES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS executives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  bio TEXT,
  photo_url TEXT,
  position_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- GALLERY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS gallery (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_url TEXT NOT NULL,
  title TEXT,
  caption TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  icon TEXT DEFAULT 'notifications',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- ATTENDANCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('present', 'absent', 'excused')),
  reason TEXT,
  marked_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(member_id, event_date)
);

-- ============================================
-- CHAT HISTORY TABLE (Cecilia AI)
-- ============================================
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- EVENT SONGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS event_songs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  order_number INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- SONG LISTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS song_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- SONG LIST ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS song_list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  song_list_id UUID NOT NULL REFERENCES song_lists(id) ON DELETE CASCADE,
  mass_part TEXT NOT NULL,
  title TEXT NOT NULL,
  score_id UUID REFERENCES scores(id) ON DELETE SET NULL,
  order_number INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- USER SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  push_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_scores_uploaded_by ON scores(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_scores_created_at ON scores(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_event_date ON attendance(event_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_created_at ON gallery(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_songs_event_id ON event_songs(event_id);
CREATE INDEX IF NOT EXISTS idx_event_songs_order ON event_songs(order_number);
CREATE INDEX IF NOT EXISTS idx_song_lists_event_id ON song_lists(event_id);
CREATE INDEX IF NOT EXISTS idx_song_lists_status ON song_lists(status);
CREATE INDEX IF NOT EXISTS idx_song_list_items_song_list_id ON song_list_items(song_list_id);
CREATE INDEX IF NOT EXISTS idx_song_list_items_order ON song_list_items(order_number);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE executives ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_list_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (idempotent)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view all users" ON users;
  DROP POLICY IF EXISTS "Users can update own profile" ON users;
  DROP POLICY IF EXISTS "Users can delete own account" ON users;
  DROP POLICY IF EXISTS "Anyone can view scores" ON scores;
  DROP POLICY IF EXISTS "Exco and admin can insert scores" ON scores;
  DROP POLICY IF EXISTS "Exco and admin can delete scores" ON scores;
  DROP POLICY IF EXISTS "Anyone can view events" ON events;
  DROP POLICY IF EXISTS "Exco and admin can insert events" ON events;
  DROP POLICY IF EXISTS "Exco and admin can update events" ON events;
  DROP POLICY IF EXISTS "Exco and admin can delete events" ON events;
  DROP POLICY IF EXISTS "Anyone can view executives" ON executives;
  DROP POLICY IF EXISTS "Exco and admin can insert executives" ON executives;
  DROP POLICY IF EXISTS "Exco and admin can update executives" ON executives;
  DROP POLICY IF EXISTS "Exco and admin can delete executives" ON executives;
  DROP POLICY IF EXISTS "Anyone can view gallery" ON gallery;
  DROP POLICY IF EXISTS "Exco and admin can insert gallery" ON gallery;
  DROP POLICY IF EXISTS "Exco and admin can delete gallery" ON gallery;
  DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
  DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
  DROP POLICY IF EXISTS "Exco and admin can insert notifications" ON notifications;
  DROP POLICY IF EXISTS "Users can view attendance" ON attendance;
  DROP POLICY IF EXISTS "Exco and admin can insert attendance" ON attendance;
  DROP POLICY IF EXISTS "Exco and admin can update attendance" ON attendance;
  DROP POLICY IF EXISTS "Users can view own chat history" ON chat_history;
  DROP POLICY IF EXISTS "Users can insert own chat history" ON chat_history;
  DROP POLICY IF EXISTS "Users can delete own chat history" ON chat_history;
  DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
  DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
  DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
  DROP POLICY IF EXISTS "Anyone can view song lists" ON song_lists;
  DROP POLICY IF EXISTS "Exco and admin can insert song lists" ON song_lists;
  DROP POLICY IF EXISTS "Exco and admin can update song lists" ON song_lists;
  DROP POLICY IF EXISTS "Anyone can view song list items" ON song_list_items;
  DROP POLICY IF EXISTS "Exco and admin can insert song list items" ON song_list_items;
  DROP POLICY IF EXISTS "Exco and admin can update song list items" ON song_list_items;
  DROP POLICY IF EXISTS "Exco and admin can delete song list items" ON song_list_items;
END $$;

-- Users policies
CREATE POLICY "Users can view all users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can delete own account" ON users FOR DELETE USING (auth.uid() = id);

-- Scores policies
CREATE POLICY "Anyone can view scores" ON scores FOR SELECT USING (true);
CREATE POLICY "Exco and admin can insert scores" ON scores FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can delete scores" ON scores FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);

-- Events policies
CREATE POLICY "Anyone can view events" ON events FOR SELECT USING (true);
CREATE POLICY "Exco and admin can insert events" ON events FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can update events" ON events FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can delete events" ON events FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);

-- Executives policies
CREATE POLICY "Anyone can view executives" ON executives FOR SELECT USING (true);
CREATE POLICY "Exco and admin can insert executives" ON executives FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can update executives" ON executives FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can delete executives" ON executives FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);

-- Gallery policies
CREATE POLICY "Anyone can view gallery" ON gallery FOR SELECT USING (true);
CREATE POLICY "Exco and admin can insert gallery" ON gallery FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can delete gallery" ON gallery FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Exco and admin can insert notifications" ON notifications FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);

-- Attendance policies
CREATE POLICY "Users can view attendance" ON attendance FOR SELECT USING (true);
CREATE POLICY "Exco and admin can insert attendance" ON attendance FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can update attendance" ON attendance FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);

-- Event songs policies
CREATE POLICY "Anyone can view event songs" ON event_songs FOR SELECT USING (true);
CREATE POLICY "Exco and admin can insert event songs" ON event_songs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can update event songs" ON event_songs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can delete event songs" ON event_songs FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);

-- Song lists policies
CREATE POLICY "Anyone can view song lists" ON song_lists FOR SELECT USING (true);
CREATE POLICY "Exco and admin can insert song lists" ON song_lists FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can update song lists" ON song_lists FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);

-- Song list items policies
CREATE POLICY "Anyone can view song list items" ON song_list_items FOR SELECT USING (true);
CREATE POLICY "Exco and admin can insert song list items" ON song_list_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can update song list items" ON song_list_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);
CREATE POLICY "Exco and admin can delete song list items" ON song_list_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('exco', 'admin'))
);

-- Chat history policies
CREATE POLICY "Users can view own chat history" ON chat_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat history" ON chat_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own chat history" ON chat_history FOR DELETE USING (auth.uid() = user_id);

-- User settings policies
CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- REAL-TIME REPLICATION
-- ============================================
-- Enable real-time for all main tables (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'users') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE users;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'scores') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE scores;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'executives') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE executives;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gallery') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gallery;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'attendance') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_history') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_history;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'event_songs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE event_songs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'song_lists') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE song_lists;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'song_list_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE song_list_items;
  END IF;
END $$;

-- ============================================
-- SEED DATA
-- ============================================
-- Default admin user (password: admin123 - CHANGE IN PRODUCTION!)
INSERT INTO users (email, password, username, full_name, phone_number, address, role)
VALUES (
  'admin@stceciliachoir.org',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYPqQqFqG4i',
  'admin',
  'Admin User',
  '0000000000',
  'Admin Address',
  'admin'
) ON CONFLICT (email) DO NOTHING;
