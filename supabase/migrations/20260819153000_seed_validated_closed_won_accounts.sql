/*
  Seed only the user-validated Closed Won suppression list.

  Source: user-provided overlap/exclusion audit screenshot on 2026-08-19.
  These are suppressed from paid ABM activation, while remaining visible for
  tracker context and audit.
*/

INSERT INTO public.cgt_abm_client_domains (domain, account_name, notes)
VALUES
  ('roche.com', 'F. Hoffmann-La Roche Ltd', 'Validated Closed Won suppression list, 2026-08-19'),
  ('kitepharma.com', 'Kite Pharma Inc', 'Validated Closed Won suppression list, 2026-08-19'),
  ('krystalbio.com', 'Krystal Biotech Inc', 'Validated Closed Won suppression list, 2026-08-19'),
  ('sarepta.com', 'Sarepta Therapeutics Inc', 'Validated Closed Won suppression list, 2026-08-19'),
  ('sparktx.com', 'Spark Therapeutics Inc', 'Validated Closed Won suppression list, 2026-08-19'),
  ('uniqure.com', 'UniQure NV', 'Validated Closed Won suppression list, 2026-08-19')
ON CONFLICT (domain) DO UPDATE
SET account_name = EXCLUDED.account_name,
    notes = EXCLUDED.notes;

UPDATE public.cgt_abm_weekly_engagement
SET is_client = true
WHERE lower(normalized_account_name) IN (
  'f hoffmann la roche',
  'kite pharma',
  'krystal biotech',
  'sarepta therapeutics',
  'spark therapeutics',
  'uniqure'
);

UPDATE public.cgt_abm_audience_members
SET is_client = true
WHERE lower(coalesce(domain, '')) IN (
  'roche.com',
  'kitepharma.com',
  'krystalbio.com',
  'sarepta.com',
  'sparktx.com',
  'uniqure.com'
);
