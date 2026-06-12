/*
  # Create Admin User

  1. Security
    - Creates a single admin user for platform access
    - Email: inspirogenius@biotech-platform.app
    - Password will be set to: CGT2026!
  
  2. Important Notes
    - This user will have full access to the platform
    - Password is securely hashed by Supabase Auth
*/

-- Create the admin user using Supabase's auth.users table
-- The password will be hashed automatically
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'inspirogenius@biotech-platform.app',
  crypt('CGT2026!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'inspirogenius@biotech-platform.app'
);
