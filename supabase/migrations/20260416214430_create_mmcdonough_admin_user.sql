/*
  # Create admin user for mmcdonough@curator24.com

  1. Auth
    - Inserts a confirmed auth.users row with email `mmcdonough@curator24.com`
      and the provided password (bcrypt-hashed via pgcrypto).
    - Idempotent: skipped if the user already exists.

  2. App role
    - Upserts a matching cgt_users row with role = 'admin' so the user can
      access scoring controls and admin features.

  3. Notes
    - Email is marked confirmed so the user can sign in immediately.
    - No destructive operations.
*/

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
  'mmcdonough@curator24.com',
  crypt('cgtforme', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'mmcdonough@curator24.com'
);

INSERT INTO cgt_users (id, email, name, role, is_active, created_at)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       'admin',
       true,
       now()
FROM auth.users u
WHERE u.email = 'mmcdonough@curator24.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin', is_active = true;
