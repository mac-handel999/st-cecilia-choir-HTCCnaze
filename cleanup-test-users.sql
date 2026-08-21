-- Remove test/seed users from Supabase
-- Run this in the Supabase SQL Editor

-- First, show what will be deleted (preview)
SELECT 
  u.id,
  u.email,
  u.username,
  u.full_name,
  u.role,
  COUNT(DISTINCT s.id) AS scores_count,
  COUNT(DISTINCT a.id) AS attendance_count,
  COUNT(DISTINCT ch.id) AS chat_count,
  COUNT(DISTINCT n.id) AS notif_count
FROM users u
LEFT JOIN scores s ON s.uploaded_by = u.id
LEFT JOIN attendance a ON a.member_id = u.id
LEFT JOIN chat_history ch ON ch.user_id = u.id
LEFT JOIN notifications n ON n.user_id = u.id
WHERE 
  u.email LIKE '%test%' 
  OR u.username LIKE '%test%'
  OR u.full_name ILIKE '%test%'
  OR u.email = 'admin@stceciliachoir.org'
  OR u.username = 'admin'
GROUP BY u.id, u.email, u.username, u.full_name, u.role
ORDER BY u.created_at DESC;

-- Delete related data first (if not using CASCADE)
DELETE FROM chat_history WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE '%test%' OR username LIKE '%test%' OR full_name ILIKE '%test%' OR email = 'admin@stceciliachoir.org'
);

DELETE FROM notifications WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE '%test%' OR username LIKE '%test%' OR full_name ILIKE '%test%' OR email = 'admin@stceciliachoir.org'
);

DELETE FROM attendance WHERE member_id IN (
  SELECT id FROM users WHERE email LIKE '%test%' OR username LIKE '%test%' OR full_name ILIKE '%test%' OR email = 'admin@stceciliachoir.org'
);

DELETE FROM scores WHERE uploaded_by IN (
  SELECT id FROM users WHERE email LIKE '%test%' OR username LIKE '%test%' OR full_name ILIKE '%test%' OR email = 'admin@stceciliachoir.org'
);

DELETE FROM user_settings WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE '%test%' OR username LIKE '%test%' OR full_name ILIKE '%test%' OR email = 'admin@stceciliachoir.org'
);

-- Finally delete the users
DELETE FROM users WHERE 
  email LIKE '%test%' 
  OR username LIKE '%test%'
  OR full_name ILIKE '%test%'
  OR email = 'admin@stceciliachoir.org'
  OR username = 'admin';

-- Verify deletion
SELECT * FROM users WHERE email LIKE '%test%' OR username LIKE '%test%' OR full_name ILIKE '%test%' OR email = 'admin@stceciliachoir.org';
