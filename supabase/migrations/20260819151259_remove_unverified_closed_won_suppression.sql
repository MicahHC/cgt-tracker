/*
  Remove unverified Closed Won suppression seeds.

  These accounts were originally added as a static suppression seed, not from a
  CRM-backed closed-won source. Closed Won should now come only from explicit
  uploaded Closed Won Pipeline data or a manual user toggle.
*/

DELETE FROM public.cgt_abm_client_domains
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
);

UPDATE public.cgt_abm_weekly_engagement
SET is_client = false
WHERE coalesce(is_client, false)
  AND coalesce(closed_won_pipeline, 0) = 0
  AND (
    lower(normalized_account_name) IN (
      'iovance biotherapeutics',
      'vertex pharmaceuticals',
      'kite pharma',
      'gilead',
      'gilead sciences',
      'regeneron',
      'regeneron pharmaceuticals',
      'precigen',
      'ptc therapeutics',
      'merck',
      'rocket pharmaceuticals',
      'orca bio',
      'juno therapeutics',
      'bms',
      'bristol myers squibb',
      'bristol myers squibb juno therapeutics',
      'nanoscope therapeutics'
    )
    OR lower(account_name) IN (
      'iovance biotherapeutics',
      'vertex pharmaceuticals',
      'kite pharma',
      'gilead',
      'gilead sciences',
      'regeneron',
      'regeneron pharmaceuticals',
      'precigen',
      'ptc therapeutics',
      'merck',
      'rocket pharmaceuticals',
      'orca bio',
      'juno therapeutics',
      'bms',
      'bristol myers squibb',
      'nanoscope therapeutics'
    )
  );

UPDATE public.cgt_abm_audience_members
SET is_client = false
WHERE coalesce(is_client, false)
  AND lower(coalesce(domain, '')) IN (
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
  );
