/*
  # Seed fallback reference sources for every asset

  1. Changes
    - For every asset that has no row in cgt_asset_sources yet, insert a
      ClinicalTrials.gov search URL (by asset name) and an FDA.gov search
      URL so scorers have a verifiable entry point to start primary-source
      research. These are Tertiary (reference) links, not claims.

  2. Notes
    - Idempotent: only runs for assets with zero existing sources.
    - No destructive operations.
*/

INSERT INTO cgt_asset_sources (asset_id, source_url, source_type, source_title, source_domain, is_primary_source, source_date, signal_type, notes)
SELECT a.id,
       'https://clinicaltrials.gov/search?term=' || replace(a.asset_name, ' ', '+'),
       'Tertiary',
       'ClinicalTrials.gov — search "' || a.asset_name || '"',
       'clinicaltrials.gov',
       false,
       CURRENT_DATE,
       'reference',
       'Fallback search link. Replace with specific NCT when available.'
FROM cgt_assets a
WHERE NOT EXISTS (SELECT 1 FROM cgt_asset_sources s WHERE s.asset_id = a.id);

INSERT INTO cgt_asset_sources (asset_id, source_url, source_type, source_title, source_domain, is_primary_source, source_date, signal_type, notes)
SELECT a.id,
       'https://www.fda.gov/search?s=' || replace(a.asset_name, ' ', '+'),
       'Tertiary',
       'FDA.gov — search "' || a.asset_name || '"',
       'fda.gov',
       false,
       CURRENT_DATE,
       'reference',
       'Fallback search link. Replace with specific approval letter / press release.'
FROM cgt_assets a
WHERE NOT EXISTS (
  SELECT 1 FROM cgt_asset_sources s WHERE s.asset_id = a.id AND s.source_domain = 'fda.gov'
);
