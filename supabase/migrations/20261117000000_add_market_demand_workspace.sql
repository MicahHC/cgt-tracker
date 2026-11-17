-- Persistent inputs for the Market Demand workspace. These observations are
-- deliberately source-level records so pipeline activity and buyer demand are
-- never conflated in the content-opportunity view.

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

ALTER TABLE public.cgt_market_demand_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read market demand observations"
  ON public.cgt_market_demand_observations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated insert market demand observations"
  ON public.cgt_market_demand_observations FOR INSERT TO authenticated WITH CHECK (true);

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
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_week, nct_id)
);

CREATE INDEX IF NOT EXISTS cgt_trial_market_snapshots_week_idx
  ON public.cgt_trial_market_snapshots (snapshot_week DESC);
CREATE INDEX IF NOT EXISTS cgt_trial_market_snapshots_dimensions_idx
  ON public.cgt_trial_market_snapshots (modality, therapeutic_area, phase);

ALTER TABLE public.cgt_trial_market_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read trial market snapshots"
  ON public.cgt_trial_market_snapshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated insert trial market snapshots"
  ON public.cgt_trial_market_snapshots FOR INSERT TO authenticated WITH CHECK (true);
