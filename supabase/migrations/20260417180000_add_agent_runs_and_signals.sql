/*
  # Agent Workflow — Runs, Signals, and Discovery Candidates

  Adds infrastructure for the weekly signal-detection and discovery agent workflow.

  ## New Tables

  1. `cgt_agent_runs` - one row per agent invocation (signal detection, discovery,
     monthly re-evaluation). Captures batch composition, counts, cost, and status.
  2. `cgt_signals` - raw signal queue. Every candidate signal an agent surfaces
     is recorded here (material or not) for audit. Material signals drive writes
     to cgt_change_log and cgt_score_history downstream.

  ## Column Additions

  1. `cgt_companies.status` - distinguishes active companies from discovery
     candidates awaiting analyst review.

  ## Security

  - RLS enabled on both new tables, mirroring existing append-only pattern
    used by cgt_change_log and cgt_score_history.
  - Reads: any authenticated user.
  - Writes: admin or analyst (via cgt_users.role check).
  - No UPDATE/DELETE policies on cgt_signals for non-admins: append-only audit.
  - cgt_agent_runs permits UPDATE for admin/analyst so the orchestrator can
    transition status from 'running' to 'succeeded' / 'failed' / 'partial'.

  ## Notes

  - Hard-cap inputs (clinical_hold, no_manufacturing_pathway, timeline_over_24_months,
    no_us_path) already exist on cgt_assets and are reused as-is by the scoring
    module added in a follow-up change.
  - `status` on cgt_companies defaults to 'active' so existing rows are
    unaffected; discovery agent writes new rows with status='candidate'.
*/

-- Agent Runs --------------------------------------------------------------
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

-- Signals (append-only audit of every candidate signal, material or not) ---
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

-- Discovery candidate status on companies ----------------------------------
ALTER TABLE cgt_companies
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','candidate','excluded'));

CREATE INDEX IF NOT EXISTS cgt_companies_status_idx ON cgt_companies (status);

-- RLS POLICIES ============================================================

-- cgt_agent_runs
CREATE POLICY "read agent runs" ON cgt_agent_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert agent runs admin/analyst" ON cgt_agent_runs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

CREATE POLICY "update agent runs admin/analyst" ON cgt_agent_runs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')))
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

-- cgt_signals (append-only for non-admins; admins may correct entries)
CREATE POLICY "read signals" ON cgt_signals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert signals admin/analyst" ON cgt_signals
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

-- Only allow updates to mark signals as reviewed (admin/analyst).
CREATE POLICY "update signals review admin/analyst" ON cgt_signals
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')))
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

CREATE POLICY "delete signals admin" ON cgt_signals
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));
