/*
  Sync tracker-backed company phases into ABM audience lists.

  This keeps the main company defaults and ABM phase buckets aligned after
  weekly agent updates or manual tracker cleanup. It is intentionally
  conservative: exact domain/name matches only, no invented domains, and
  Closed Won/client rows are preserved.
*/

CREATE OR REPLACE FUNCTION public.cgt_abm_clean_domain(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both from regexp_replace(
    split_part(regexp_replace(lower(coalesce(p_value, '')), '^https?://', ''), '/', 1),
    '^www\.',
    ''
  ));
$$;

CREATE OR REPLACE FUNCTION public.cgt_abm_normalize_name(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      replace(lower(coalesce(p_value, '')), '&', 'and'),
      '\m(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|holdings|holding|therapeutics|pharmaceuticals|pharma|biopharmaceuticals|biotherapeutics|biosciences|sciences|technology|technologies|llc|ag|sa|nv)\M',
      '',
      'g'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.sync_abm_phase_lists()
RETURNS TABLE(action text, rows_affected integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_defaults int := 0;
  v_removed_excluded int := 0;
  v_removed_duplicates int := 0;
  v_moved_abm int := 0;
  v_inserted_abm int := 0;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'sync_abm_phase_lists is not available through the public API';
  END IF;

  DROP TABLE IF EXISTS pg_temp._cgt_abm_desired_all;
  DROP TABLE IF EXISTS pg_temp._cgt_abm_desired_domain;
  DROP TABLE IF EXISTS pg_temp._cgt_abm_excluded;

  CREATE TEMP TABLE _cgt_abm_desired_all ON COMMIT DROP AS
  WITH asset_flags AS (
    SELECT
      a.company_id,
      bool_or(
        NOT coalesce(a.no_us_path, false)
        AND (
          lower(coalesce(a.segment, '')) IN ('on-market', 'on market')
          OR lower(coalesce(a.filing_status, '')) LIKE '%approved%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%approved%'
          OR lower(coalesce(a.us_commercialization_window, '')) = 'approved'
        )
      ) AS has_on_market,
      bool_or(
        NOT coalesce(a.no_us_path, false)
        AND NOT (
          lower(coalesce(a.phase_regulatory_status, '')) LIKE '%no current phase 3%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%no current cgt phase 3%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%no phase 3 confirmed%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%phase 3 terminated%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%prior phase 3 terminated%'
        )
        AND (
          lower(coalesce(a.segment, '')) = 'late stage'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%phase 3%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%phase iii%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%bla%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%pdufa%'
          OR lower(coalesce(a.filing_status, '')) LIKE '%accepted%'
        )
      ) AS has_late_stage,
      bool_or(
        NOT coalesce(a.no_us_path, false)
        AND (
          lower(coalesce(a.segment, '')) = 'early stage'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%phase 1%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%phase i%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%phase 2%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%phase ii%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%candidate%'
          OR lower(coalesce(a.phase_regulatory_status, '')) LIKE '%preclinical%'
        )
      ) AS has_early_stage
    FROM public.cgt_assets a
    GROUP BY a.company_id
  )
  SELECT
    c.id AS company_id,
    c.company_name,
    public.cgt_abm_normalize_name(c.company_name) AS normalized_company_name,
    public.cgt_abm_clean_domain(c.website) AS domain,
    coalesce(nullif(c.hq_country, ''), 'United States') AS country,
    CASE
      WHEN coalesce(c.status, 'active') = 'excluded' THEN NULL
      WHEN coalesce(af.has_on_market, false) THEN 'On Market'
      WHEN coalesce(af.has_late_stage, false) THEN 'Late Stage'
      WHEN coalesce(af.has_early_stage, false) THEN 'Early Stage'
      WHEN c.segment_default = 'On-Market' THEN 'On Market'
      WHEN c.segment_default IN ('On Market', 'Late Stage', 'Early Stage') THEN c.segment_default
      WHEN coalesce(c.status, '') = 'candidate' THEN 'Early Stage'
      ELSE NULL
    END AS desired_segment
  FROM public.cgt_companies c
  LEFT JOIN asset_flags af ON af.company_id = c.id
  WHERE coalesce(c.status, 'active') <> 'excluded';

  CREATE TEMP TABLE _cgt_abm_desired_domain ON COMMIT DROP AS
  SELECT DISTINCT ON (desired_segment, domain)
    *
  FROM _cgt_abm_desired_all
  WHERE desired_segment IS NOT NULL
    AND domain <> ''
  ORDER BY desired_segment, domain, length(company_name), company_name;

  CREATE TEMP TABLE _cgt_abm_excluded ON COMMIT DROP AS
  SELECT
    c.company_name,
    public.cgt_abm_normalize_name(c.company_name) AS normalized_company_name,
    public.cgt_abm_clean_domain(c.website) AS domain
  FROM public.cgt_companies c
  WHERE coalesce(c.status, '') = 'excluded';

  UPDATE public.cgt_companies c
  SET
    segment_default = CASE
      WHEN d.desired_segment = 'On Market' THEN 'On-Market'
      ELSE d.desired_segment
    END,
    updated_at = now()
  FROM _cgt_abm_desired_all d
  WHERE c.id = d.company_id
    AND d.desired_segment IS NOT NULL
    AND c.segment_default IS DISTINCT FROM CASE
      WHEN d.desired_segment = 'On Market' THEN 'On-Market'
      ELSE d.desired_segment
    END;
  GET DIAGNOSTICS v_company_defaults = ROW_COUNT;

  DELETE FROM public.cgt_abm_audience_members m
  USING _cgt_abm_excluded e
  WHERE NOT coalesce(m.is_client, false)
    AND m.audience_segment IN ('Early Stage', 'Late Stage', 'On Market')
    AND (
      (e.domain <> '' AND public.cgt_abm_clean_domain(m.domain) = e.domain)
      OR public.cgt_abm_normalize_name(m.account_name) = e.normalized_company_name
    );
  GET DIAGNOSTICS v_removed_excluded = ROW_COUNT;

  DELETE FROM public.cgt_abm_audience_members m
  USING _cgt_abm_desired_domain d
  WHERE NOT coalesce(m.is_client, false)
    AND m.audience_segment IN ('Early Stage', 'Late Stage', 'On Market')
    AND m.audience_segment <> d.desired_segment
    AND (
      public.cgt_abm_clean_domain(m.domain) = d.domain
      OR public.cgt_abm_normalize_name(m.account_name) = d.normalized_company_name
    )
    AND EXISTS (
      SELECT 1
      FROM public.cgt_abm_audience_members target
      WHERE target.audience_segment = d.desired_segment
        AND public.cgt_abm_clean_domain(target.domain) = d.domain
    );
  GET DIAGNOSTICS v_removed_duplicates = ROW_COUNT;

  UPDATE public.cgt_abm_audience_members m
  SET
    account_name = d.company_name,
    domain = d.domain,
    country = d.country,
    audience_segment = d.desired_segment
  FROM _cgt_abm_desired_domain d
  WHERE NOT coalesce(m.is_client, false)
    AND m.audience_segment IN ('Early Stage', 'Late Stage', 'On Market')
    AND (
      public.cgt_abm_clean_domain(m.domain) = d.domain
      OR public.cgt_abm_normalize_name(m.account_name) = d.normalized_company_name
    )
    AND (
      m.account_name IS DISTINCT FROM d.company_name
      OR public.cgt_abm_clean_domain(m.domain) IS DISTINCT FROM d.domain
      OR coalesce(m.country, '') IS DISTINCT FROM d.country
      OR m.audience_segment IS DISTINCT FROM d.desired_segment
    );
  GET DIAGNOSTICS v_moved_abm = ROW_COUNT;

  INSERT INTO public.cgt_abm_audience_members (
    account_name,
    country,
    domain,
    audience_segment,
    is_client
  )
  SELECT
    d.company_name,
    d.country,
    d.domain,
    d.desired_segment,
    false
  FROM _cgt_abm_desired_domain d
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.cgt_abm_audience_members m
    WHERE (
      public.cgt_abm_clean_domain(m.domain) = d.domain
      OR public.cgt_abm_normalize_name(m.account_name) = d.normalized_company_name
    )
    AND (
      m.audience_segment = d.desired_segment
      OR coalesce(m.is_client, false)
    )
  )
  ON CONFLICT (audience_segment, domain) DO NOTHING;
  GET DIAGNOSTICS v_inserted_abm = ROW_COUNT;

  RETURN QUERY VALUES
    ('company_segment_defaults', v_company_defaults),
    ('removed_excluded_abm_rows', v_removed_excluded),
    ('removed_duplicate_wrong_phase_rows', v_removed_duplicates),
    ('moved_or_refreshed_abm_rows', v_moved_abm),
    ('inserted_missing_abm_rows', v_inserted_abm);
END;
$$;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'cgt-abm-phase-sync'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'cgt-abm-phase-sync',
  '30 4 * * *',
  $$ SELECT public.sync_abm_phase_lists(); $$
);
