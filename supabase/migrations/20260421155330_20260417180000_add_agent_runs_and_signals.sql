/*
  # Agent Workflow — Runs, Signals, and Discovery Candidates

  Adds infrastructure for the weekly signal-detection and discovery agent workflow.

  ## New Tables
  1. cgt_agent_runs - one row per agent invocation.
  2. cgt_signals - raw signal queue (append-only audit).

  ## Column Additions
  1. cgt_companies.status - active | candidate | excluded.

  ## Security
  - RLS enabled on both new tables.
  - Reads: any authenticated user.
  - Writes: admin or analyst.
*/

CREATE TABLE IF NOT EXISTS cgt_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL CHECK (agent_type IN ('signal_detection','discovery','monthly_reevaluation')),
  mode text NOT NULL DEFAULT 'weekly' CHECK (mode IN ('weekly','monthly','manual')),
  week_label text NOT NULL DEFAULT '',
  batch_company_ids uuid[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','partial')),
  signals_found int DEFAULT 0,
  material_signals int DEFAULT 0,
  score_updates int DEFAULT 0,
  tokens_input int DEFAULT 0,
  tokens_output int DEFAULT 0,
  cost_usd numeric(10,4) DEFAULT 0,
  error text DEFAULT '',
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS cgt_agent_runs_started_idx ON cgt_agent_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS cgt_agent_runs_type_idx ON cgt_agent_runs (agent_type, status);

ALTER TABLE cgt_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS cgt_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid REFERENCES cgt_agent_runs(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES cgt_assets(id) ON DELETE CASCADE,
  company_id uuid REFERENCES cgt_companies(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN (
    'regulatory','trial','manufacturing','commercial_hiring','partnership','financial','other'
  )),
  source_url text NOT NULL,
  source_tier int CHECK (source_tier IN (1,2,3)),
  source_domain text DEFAULT '',
  published_date date,
  raw_summary text NOT NULL DEFAULT '',
  materiality_reasons text[] DEFAULT '{}',
  is_material boolean NOT NULL DEFAULT false,
  conflicts_with text DEFAULT '',
  reviewed boolean DEFAULT false,
  reviewed_by uuid,
  detected_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cgt_signals_asset_idx ON cgt_signals (asset_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS cgt_signals_company_idx ON cgt_signals (company_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS cgt_signals_material_idx ON cgt_signals (is_material, reviewed) WHERE is_material = true;
CREATE INDEX IF NOT EXISTS cgt_signals_run_idx ON cgt_signals (agent_run_id);

ALTER TABLE cgt_signals ENABLE ROW LEVEL SECURITY;

ALTER TABLE cgt_companies
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','candidate','excluded'));

CREATE INDEX IF NOT EXISTS cgt_companies_status_idx ON cgt_companies (status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cgt_agent_runs' AND policyname='read agent runs') THEN
    CREATE POLICY "read agent runs" ON cgt_agent_runs
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cgt_agent_runs' AND policyname='insert agent runs admin/analyst') THEN
    CREATE POLICY "insert agent runs admin/analyst" ON cgt_agent_runs
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cgt_agent_runs' AND policyname='update agent runs admin/analyst') THEN
    CREATE POLICY "update agent runs admin/analyst" ON cgt_agent_runs
      FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')))
      WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cgt_signals' AND policyname='read signals') THEN
    CREATE POLICY "read signals" ON cgt_signals
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cgt_signals' AND policyname='insert signals admin/analyst') THEN
    CREATE POLICY "insert signals admin/analyst" ON cgt_signals
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cgt_signals' AND policyname='update signals review admin/analyst') THEN
    CREATE POLICY "update signals review admin/analyst" ON cgt_signals
      FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')))
      WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cgt_signals' AND policyname='delete signals admin') THEN
    CREATE POLICY "delete signals admin" ON cgt_signals
      FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));
  END IF;
END $$;
