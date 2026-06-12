/*
  # Seed Closed Won ABM suppression

  Closed Won/client accounts should not appear in active ABM recommendations,
  ranking, or spend reporting. The app also has a defensive client-side filter,
  but this migration updates the live database so current and future uploads are
  marked consistently.
*/

INSERT INTO public.cgt_abm_client_domains (domain, account_name, notes)
VALUES
  ('iovance.com', 'Iovance Biotherapeutics', 'Closed Won suppression seed'),
  ('vrtx.com', 'Vertex Pharmaceuticals', 'Closed Won suppression seed'),
  ('kitepharma.com', 'Kite Pharma (Gilead)', 'Closed Won suppression seed'),
  ('gilead.com', 'Gilead Sciences', 'Closed Won parent alias for Kite Pharma'),
  ('regeneron.com', 'Regeneron Pharmaceuticals', 'Closed Won suppression seed'),
  ('precigen.com', 'Precigen', 'Closed Won suppression seed'),
  ('ptcbio.com', 'PTC Therapeutics', 'Closed Won suppression seed'),
  ('merck.com', 'Merck', 'Closed Won suppression seed'),
  ('rocketpharma.com', 'Rocket Pharmaceuticals', 'Closed Won suppression seed'),
  ('orcabio.com', 'Orca Bio', 'Closed Won suppression seed'),
  ('bms.com', 'Bristol Myers Squibb / Juno Therapeutics', 'Closed Won parent alias for Juno Therapeutics'),
  ('nanostherapeutics.com', 'NanoScope Therapeutics', 'Closed Won suppression seed')
ON CONFLICT (domain)
DO UPDATE SET
  account_name = EXCLUDED.account_name,
  notes = EXCLUDED.notes;

WITH closed_won_accounts(normalized_account_name) AS (
  VALUES
    ('iovance biotherapeutics'),
    ('vertex pharmaceuticals'),
    ('kite pharma'),
    ('kite pharma gilead'),
    ('gilead'),
    ('gilead sciences'),
    ('regeneron'),
    ('regeneron pharmaceuticals'),
    ('precigen'),
    ('ptc therapeutics'),
    ('merck'),
    ('rocket pharmaceuticals'),
    ('orca bio'),
    ('juno therapeutics'),
    ('juno therapeutics bms'),
    ('bms'),
    ('bristol myers squibb'),
    ('nanostherapeutics'),
    ('nanoscope therapeutics')
)
UPDATE public.cgt_abm_weekly_engagement w
SET is_client = true
FROM closed_won_accounts c
WHERE w.normalized_account_name = c.normalized_account_name;

DO $$
BEGIN
  IF to_regclass('public.cgt_abm_audience_members') IS NOT NULL THEN
    UPDATE public.cgt_abm_audience_members
    SET is_client = true
    WHERE lower(domain) IN (
      'iovance.com',
      'vrtx.com',
      'kitepharma.com',
      'gilead.com',
      'regeneron.com',
      'precigen.com',
      'ptcbio.com',
      'merck.com',
      'rocketpharma.com',
      'orcabio.com',
      'bms.com',
      'nanostherapeutics.com'
    )
    OR lower(account_name) LIKE '%iovance%'
    OR lower(account_name) LIKE '%vertex%'
    OR lower(account_name) LIKE '%kite pharma%'
    OR lower(account_name) LIKE '%gilead%'
    OR lower(account_name) LIKE '%regeneron%'
    OR lower(account_name) LIKE '%precigen%'
    OR lower(account_name) LIKE '%ptc therapeutics%'
    OR lower(account_name) = 'merck'
    OR lower(account_name) LIKE '%rocket pharmaceuticals%'
    OR lower(account_name) LIKE '%orca bio%'
    OR lower(account_name) LIKE '%juno therapeutics%'
    OR lower(account_name) LIKE '%bristol%myers%squibb%'
    OR lower(account_name) LIKE '%nanoscope%';
  END IF;
END $$;
