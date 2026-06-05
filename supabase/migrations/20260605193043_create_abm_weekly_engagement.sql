/*
  # ABM weekly engagement layer

  Stores the Friday manual ABM performance upload used by the Weekly Brief.
  Rows are keyed by week_label + account_name so a Friday re-upload replaces
  the prior file for that week without touching agent-generated CGT data.
*/

CREATE TABLE IF NOT EXISTS public.cgt_abm_weekly_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_label text NOT NULL,
  reporting_period text DEFAULT '',
  report_generated_at text DEFAULT '',
  source_file_name text DEFAULT '',
  account_name text NOT NULL,
  normalized_account_name text NOT NULL,
  is_total boolean NOT NULL DEFAULT false,
  spend numeric(14,2) DEFAULT 0,
  impressions integer DEFAULT 0,
  ecpm numeric(14,2) DEFAULT 0,
  clicks integer DEFAULT 0,
  ctr numeric(10,4) DEFAULT 0,
  ecpc numeric(14,2) DEFAULT 0,
  viewability numeric(10,4),
  accounts_reached integer DEFAULT 0,
  accounts_engaged integer DEFAULT 0,
  account_ctr numeric(10,4),
  account_vtr numeric(10,4),
  campaigns integer DEFAULT 0,
  cost_per_account_reached numeric(14,2),
  cost_per_account_engaged numeric(14,2),
  newly_qualified_accounts integer DEFAULT 0,
  pipeline numeric(16,2) DEFAULT 0,
  new_pipeline numeric(16,2) DEFAULT 0,
  closed_won_pipeline numeric(16,2) DEFAULT 0,
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cgt_abm_weekly_engagement_week_account_uniq
  ON public.cgt_abm_weekly_engagement (week_label, normalized_account_name);

CREATE INDEX IF NOT EXISTS cgt_abm_weekly_engagement_week_idx
  ON public.cgt_abm_weekly_engagement (week_label, accounts_engaged DESC, clicks DESC);

ALTER TABLE public.cgt_abm_weekly_engagement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read abm weekly engagement" ON public.cgt_abm_weekly_engagement;
DROP POLICY IF EXISTS "public insert abm weekly engagement" ON public.cgt_abm_weekly_engagement;
DROP POLICY IF EXISTS "public update abm weekly engagement" ON public.cgt_abm_weekly_engagement;
DROP POLICY IF EXISTS "public delete abm weekly engagement" ON public.cgt_abm_weekly_engagement;

CREATE POLICY "public read abm weekly engagement"
  ON public.cgt_abm_weekly_engagement
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "public insert abm weekly engagement"
  ON public.cgt_abm_weekly_engagement
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "public update abm weekly engagement"
  ON public.cgt_abm_weekly_engagement
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public delete abm weekly engagement"
  ON public.cgt_abm_weekly_engagement
  FOR DELETE TO anon, authenticated
  USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'cgt_abm_weekly_engagement'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.cgt_abm_weekly_engagement;
    END IF;
  END IF;
END $$;