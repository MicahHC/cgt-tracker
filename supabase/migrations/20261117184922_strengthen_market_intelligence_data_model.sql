-- Market intelligence is deliberately built on two independent evidence sets:
-- 1) ClinicalTrials.gov snapshots measure development activity.
-- 2) Licensed/imported search data measures buyer demand.
-- Neither table is used to infer the other.

CREATE TABLE IF NOT EXISTS public.cgt_market_snapshot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_week text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  source_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  studies_discovered integer NOT NULL DEFAULT 0,
  studies_stored integer NOT NULL DEFAULT 0,
  coverage_status text NOT NULL DEFAULT 'unknown' CHECK (coverage_status IN ('complete', 'partial', 'unknown')),
  error text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cgt_trial_market_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_week text NOT NULL,
  nct_id text NOT NULL,
  sponsor_name text NOT NULL DEFAULT '',
  asset_name text NOT NULL DEFAULT '',
  modality text NOT NULL DEFAULT '',
  therapeutic_area text NOT NULL DEFAULT '',
  phase text NOT NULL DEFAULT '',
  overall_status text NOT NULL DEFAULT '',
  study_start_date date,
  primary_completion_date date,
  last_update_date date,
  source_url text NOT NULL,
  study_title text NOT NULL DEFAULT '',
  conditions text[] NOT NULL DEFAULT '{}',
  interventions text[] NOT NULL DEFAULT '{}',
  source_query text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_week, nct_id)
);

ALTER TABLE public.cgt_trial_market_snapshots
  ADD COLUMN IF NOT EXISTS study_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS conditions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interventions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_query text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS cgt_trial_market_snapshots_week_idx
  ON public.cgt_trial_market_snapshots (snapshot_week DESC);
CREATE INDEX IF NOT EXISTS cgt_trial_market_snapshots_dimensions_idx
  ON public.cgt_trial_market_snapshots (modality, therapeutic_area, phase);
CREATE INDEX IF NOT EXISTS cgt_trial_market_snapshots_nct_idx
  ON public.cgt_trial_market_snapshots (nct_id);

CREATE TABLE IF NOT EXISTS public.cgt_market_demand_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_period date NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('keyword', 'prompt', 'buyer_research', 'trial_trend')),
  query_text text NOT NULL DEFAULT '',
  modality text NOT NULL DEFAULT '',
  therapeutic_area text NOT NULL DEFAULT '',
  phase text NOT NULL DEFAULT '',
  geography text NOT NULL DEFAULT 'United States',
  monthly_search_volume integer,
  prior_period_volume integer,
  trend_percent numeric,
  intent text NOT NULL DEFAULT '',
  confidence_level text NOT NULL DEFAULT 'Medium',
  source_url text NOT NULL DEFAULT '',
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid
);

CREATE INDEX IF NOT EXISTS cgt_market_demand_period_idx
  ON public.cgt_market_demand_observations (observation_period DESC);
CREATE INDEX IF NOT EXISTS cgt_market_demand_dimensions_idx
  ON public.cgt_market_demand_observations (modality, therapeutic_area, phase);

ALTER TABLE public.cgt_trial_market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cgt_market_snapshot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cgt_market_demand_observations ENABLE ROW LEVEL SECURITY;

-- The app needs read-only access. Ingestion is server-side with the service
-- role, so browser users cannot manufacture research records.
DROP POLICY IF EXISTS "public read trial market snapshots" ON public.cgt_trial_market_snapshots;
DROP POLICY IF EXISTS "authenticated insert trial market snapshots" ON public.cgt_trial_market_snapshots;
DROP POLICY IF EXISTS "public read market demand observations" ON public.cgt_market_demand_observations;
DROP POLICY IF EXISTS "authenticated insert market demand observations" ON public.cgt_market_demand_observations;
DROP POLICY IF EXISTS "public read market snapshot runs" ON public.cgt_market_snapshot_runs;

CREATE POLICY "public read trial market snapshots"
  ON public.cgt_trial_market_snapshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read market snapshot runs"
  ON public.cgt_market_snapshot_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read market demand observations"
  ON public.cgt_market_demand_observations FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.cgt_trial_market_snapshots FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cgt_market_snapshot_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cgt_market_demand_observations FROM anon, authenticated;
GRANT SELECT ON public.cgt_trial_market_snapshots, public.cgt_market_snapshot_runs, public.cgt_market_demand_observations TO anon, authenticated;
