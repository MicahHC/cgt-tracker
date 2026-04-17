/*
  # CGT Commercial Intelligence Tracker Schema

  Rebuild schema for tracking cell and gene therapy companies and assets across
  three segments (Late Stage, Early Stage, On-Market) with formula-driven scoring,
  audit trails, and collaboration controls.

  ## New Tables

  1. `cgt_companies` - company master (one row per company)
  2. `cgt_assets` - asset master (one row per asset / current state)
  3. `cgt_asset_sources` - links and citations per asset
  4. `cgt_change_log` - append-only change history
  5. `cgt_score_history` - append-only score snapshots
  6. `cgt_users` - app users (mirrors auth.users + role)
  7. `cgt_agent_assignments` - analyst-to-company assignments

  ## Security

  - RLS enabled on all tables
  - All reads require authenticated role
  - Writes are role-gated (admin/analyst) via policies that check cgt_users.role
  - History tables are append-only: no update/delete policies for non-admins

  ## Important Notes

  1. Final scores and tiers are recomputed by the application layer, not manually
     editable by users. The DB just stores them.
  2. History tables have no UPDATE/DELETE policies for non-admins to preserve
     audit trail integrity.
  3. Scoring inputs are 0-5 integers. Readiness/Opportunity final scores are 0-100.
*/

-- Companies ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cgt_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  parent_company text DEFAULT '',
  hq_country text DEFAULT '',
  website text DEFAULT '',
  ticker text DEFAULT '',
  segment_default text DEFAULT 'Late Stage',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cgt_companies_name_uniq
  ON cgt_companies (lower(company_name));

ALTER TABLE cgt_companies ENABLE ROW LEVEL SECURITY;

-- Assets ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cgt_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES cgt_companies(id) ON DELETE CASCADE,
  asset_name text NOT NULL,
  modality text DEFAULT '',
  target_indication text DEFAULT '',
  lead_indication text DEFAULT '',
  clinicaltrials_gov_id text DEFAULT '',
  segment text NOT NULL DEFAULT 'Late Stage',
  phase_regulatory_status text DEFAULT '',
  filing_status text DEFAULT '',
  fda_designations text DEFAULT '',
  pdufa_date date,
  key_upcoming_catalyst text DEFAULT '',
  catalyst_date date,
  us_commercialization_window text DEFAULT '',
  likely_us_launch_within_24_months text DEFAULT 'No',
  manufacturing_status text DEFAULT 'Early',
  manufacturing_pathway text DEFAULT 'Unclear',
  manufacturing_cmc_risk_notes text DEFAULT '',
  commercial_buildout_status text DEFAULT 'Minimal',
  commercial_readiness_signals text DEFAULT '',
  treatment_network_status text DEFAULT '',
  distribution_model text DEFAULT '',
  key_executive_hires_changes text DEFAULT '',
  regulatory_clinical_risk_notes text DEFAULT '',
  market_access_complexity_notes text DEFAULT '',
  latest_material_update text DEFAULT '',
  clinical_hold boolean DEFAULT false,
  no_manufacturing_pathway boolean DEFAULT false,
  timeline_over_24_months boolean DEFAULT false,
  no_us_path boolean DEFAULT false,
  regulatory_score integer DEFAULT 0 CHECK (regulatory_score BETWEEN 0 AND 5),
  commercial_infrastructure_score integer DEFAULT 0 CHECK (commercial_infrastructure_score BETWEEN 0 AND 5),
  market_attractiveness_score integer DEFAULT 0 CHECK (market_attractiveness_score BETWEEN 0 AND 5),
  capability_gap_leverage_score integer DEFAULT 0 CHECK (capability_gap_leverage_score BETWEEN 0 AND 5),
  raw_commercial_score integer DEFAULT 0,
  final_commercial_score integer DEFAULT 0,
  strategic_opportunity_score integer DEFAULT 0,
  commercial_priority_tier text,
  strategic_priority_tier text,
  confidence_level text DEFAULT 'Medium',
  last_reviewed_at timestamptz,
  last_reviewed_by uuid,
  lock_status text DEFAULT 'Open',
  locked_by uuid,
  locked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cgt_assets_company_idx ON cgt_assets (company_id);
CREATE INDEX IF NOT EXISTS cgt_assets_segment_idx ON cgt_assets (segment);
CREATE INDEX IF NOT EXISTS cgt_assets_commercial_tier_idx ON cgt_assets (commercial_priority_tier);
CREATE INDEX IF NOT EXISTS cgt_assets_strategic_tier_idx ON cgt_assets (strategic_priority_tier);

ALTER TABLE cgt_assets ENABLE ROW LEVEL SECURITY;

-- Asset Sources --------------------------------------------------------
CREATE TABLE IF NOT EXISTS cgt_asset_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES cgt_assets(id) ON DELETE CASCADE,
  source_type text DEFAULT '',
  source_title text DEFAULT '',
  source_url text NOT NULL,
  source_domain text DEFAULT '',
  source_date date,
  is_primary_source boolean DEFAULT false,
  signal_type text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cgt_asset_sources_asset_idx ON cgt_asset_sources (asset_id);
ALTER TABLE cgt_asset_sources ENABLE ROW LEVEL SECURITY;

-- Change Log (append-only) --------------------------------------------
CREATE TABLE IF NOT EXISTS cgt_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES cgt_assets(id) ON DELETE CASCADE,
  run_date date DEFAULT CURRENT_DATE,
  update_week text DEFAULT '',
  agent_id uuid,
  change_type text DEFAULT '',
  field_changed text DEFAULT '',
  previous_value text DEFAULT '',
  new_value text DEFAULT '',
  why_it_matters text DEFAULT '',
  score_impact_explanation text DEFAULT '',
  source_url text DEFAULT '',
  confidence_level text DEFAULT 'Medium',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cgt_change_log_asset_idx ON cgt_change_log (asset_id);
CREATE INDEX IF NOT EXISTS cgt_change_log_run_date_idx ON cgt_change_log (run_date DESC);
ALTER TABLE cgt_change_log ENABLE ROW LEVEL SECURITY;

-- Score History (append-only) -----------------------------------------
CREATE TABLE IF NOT EXISTS cgt_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES cgt_assets(id) ON DELETE CASCADE,
  week_label text DEFAULT '',
  regulatory_score integer DEFAULT 0,
  commercial_infrastructure_score integer DEFAULT 0,
  market_attractiveness_score integer DEFAULT 0,
  capability_gap_leverage_score integer DEFAULT 0,
  raw_commercial_score integer DEFAULT 0,
  final_commercial_score integer DEFAULT 0,
  strategic_opportunity_score integer DEFAULT 0,
  commercial_priority_tier text,
  strategic_priority_tier text,
  recorded_at timestamptz DEFAULT now(),
  recorded_by uuid
);

CREATE INDEX IF NOT EXISTS cgt_score_history_asset_idx ON cgt_score_history (asset_id);
CREATE INDEX IF NOT EXISTS cgt_score_history_recorded_idx ON cgt_score_history (recorded_at DESC);
ALTER TABLE cgt_score_history ENABLE ROW LEVEL SECURITY;

-- Users ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cgt_users (
  id uuid PRIMARY KEY,
  name text DEFAULT '',
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cgt_users_email_uniq ON cgt_users (lower(email));
ALTER TABLE cgt_users ENABLE ROW LEVEL SECURITY;

-- Agent Assignments ---------------------------------------------------
CREATE TABLE IF NOT EXISTS cgt_agent_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES cgt_companies(id) ON DELETE CASCADE,
  assignment_group text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cgt_assignments_user_idx ON cgt_agent_assignments (user_id);
CREATE INDEX IF NOT EXISTS cgt_assignments_company_idx ON cgt_agent_assignments (company_id);
ALTER TABLE cgt_agent_assignments ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES ========================================================
-- Read: any authenticated user can read everything (internal tool)
-- Write: admin and analyst roles (checked via cgt_users.role)
-- History deletes: none (append-only)

-- cgt_users: user can read own record; admins can read all
CREATE POLICY "users read own" ON cgt_users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "admins read all users" ON cgt_users
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY "admins insert users" ON cgt_users
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY "admins update users" ON cgt_users
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- cgt_companies
CREATE POLICY "read companies" ON cgt_companies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write companies admin/analyst" ON cgt_companies
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

CREATE POLICY "update companies admin/analyst" ON cgt_companies
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')))
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

CREATE POLICY "delete companies admin" ON cgt_companies
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- cgt_assets
CREATE POLICY "read assets" ON cgt_assets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert assets admin/analyst" ON cgt_assets
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

CREATE POLICY "update assets admin/analyst" ON cgt_assets
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')))
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

CREATE POLICY "delete assets admin" ON cgt_assets
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- cgt_asset_sources
CREATE POLICY "read sources" ON cgt_asset_sources
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert sources admin/analyst" ON cgt_asset_sources
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

CREATE POLICY "update sources admin/analyst" ON cgt_asset_sources
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')))
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

CREATE POLICY "delete sources admin" ON cgt_asset_sources
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- cgt_change_log (append-only: no update/delete policies)
CREATE POLICY "read change log" ON cgt_change_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert change log admin/analyst" ON cgt_change_log
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

-- cgt_score_history (append-only)
CREATE POLICY "read score history" ON cgt_score_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert score history admin/analyst" ON cgt_score_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role IN ('admin','analyst')));

-- cgt_agent_assignments
CREATE POLICY "read assignments" ON cgt_agent_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert assignments admin" ON cgt_agent_assignments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY "update assignments admin" ON cgt_agent_assignments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY "delete assignments admin" ON cgt_agent_assignments
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM cgt_users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- Auto-provision a cgt_users row for the first authenticated user as admin.
-- Additional users default to 'viewer' unless promoted by an admin.
CREATE OR REPLACE FUNCTION cgt_ensure_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count integer;
BEGIN
  SELECT COUNT(*) INTO existing_count FROM cgt_users;
  INSERT INTO cgt_users (id, email, name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    CASE WHEN existing_count = 0 THEN 'admin' ELSE 'viewer' END,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cgt_on_auth_user_created ON auth.users;
CREATE TRIGGER cgt_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION cgt_ensure_user();
