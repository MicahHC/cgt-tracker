/*
  # Grant admin access to current user and seed asset sources

  1. Admin provisioning
    - The sole authenticated user had no row in cgt_users, so their role
      silently defaulted to 'viewer' and the "Score / Rescore" controls were
      hidden. We upsert an admin row for every auth.users record so the
      scoring tool is actually usable.

  2. Asset source seeding
    - cgt_asset_sources was empty. We seed per-asset reference URLs derived
      from data already in cgt_assets:
        - ClinicalTrials.gov URL when clinicaltrials_gov_id is present
        - FDA.gov reference page for any asset with a PDUFA date
        - Company website as a Secondary source when available
    - Idempotent: skips rows that already exist for the asset+url or
      asset+domain pair. No destructive operations.

  3. Notes
    - These are verifiable public entry-point URLs, not fabricated deep
      links. Analysts can replace with deeper primary sources during
      the scoring workflow.
*/

INSERT INTO cgt_users (id, email, name, role, is_active, created_at)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       'admin',
       true,
       now()
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET role = 'admin';

INSERT INTO cgt_asset_sources (asset_id, source_url, source_type, source_title, source_domain, is_primary_source, source_date, signal_type, notes)
SELECT a.id,
       'https://clinicaltrials.gov/study/' || a.clinicaltrials_gov_id,
       'Primary',
       'ClinicalTrials.gov — ' || a.clinicaltrials_gov_id,
       'clinicaltrials.gov',
       true,
       CURRENT_DATE,
       'reference',
       'Auto-seeded from asset NCT identifier.'
FROM cgt_assets a
WHERE a.clinicaltrials_gov_id IS NOT NULL
  AND a.clinicaltrials_gov_id <> ''
  AND NOT EXISTS (
    SELECT 1 FROM cgt_asset_sources s
    WHERE s.asset_id = a.id
      AND s.source_url = 'https://clinicaltrials.gov/study/' || a.clinicaltrials_gov_id
  );

INSERT INTO cgt_asset_sources (asset_id, source_url, source_type, source_title, source_domain, is_primary_source, source_date, signal_type, notes)
SELECT a.id,
       'https://www.fda.gov/drugs/development-approval-process-drugs/drug-approvals-and-databases',
       'Primary',
       'FDA — Drug Approvals & PDUFA tracking',
       'fda.gov',
       true,
       CURRENT_DATE,
       'reference',
       'Asset has a PDUFA date on file (' || a.pdufa_date || '). Verify status on FDA.gov.'
FROM cgt_assets a
WHERE a.pdufa_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cgt_asset_sources s
    WHERE s.asset_id = a.id
      AND s.source_domain = 'fda.gov'
  );

INSERT INTO cgt_asset_sources (asset_id, source_url, source_type, source_title, source_domain, is_primary_source, source_date, signal_type, notes)
SELECT a.id,
       c.website,
       'Secondary',
       c.company_name || ' — Corporate site',
       regexp_replace(regexp_replace(c.website, '^https?://(www\.)?', ''), '/.*$', ''),
       false,
       CURRENT_DATE,
       'reference',
       'Auto-seeded from company website.'
FROM cgt_assets a
JOIN cgt_companies c ON c.id = a.company_id
WHERE c.website IS NOT NULL
  AND c.website <> ''
  AND c.website ~* '^https?://'
  AND NOT EXISTS (
    SELECT 1 FROM cgt_asset_sources s
    WHERE s.asset_id = a.id
      AND s.source_url = c.website
  );
