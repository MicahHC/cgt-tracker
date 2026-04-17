export type Segment = 'Late Stage' | 'Early Stage' | 'On-Market';
export type Tier = 'Tier 1' | 'Tier 2' | 'Watchlist' | 'Deprioritized';
export type ManufacturingStatus = 'Established' | 'Scaling' | 'Early' | 'Constrained' | 'Critical Gap';
export type ManufacturingPathway = 'Yes' | 'No' | 'Unclear';
export type CommercialBuildoutStatus = 'Established' | 'Scaling' | 'Early' | 'Minimal' | 'None';
export type LikelyLaunch24 = 'Yes' | 'No' | 'Watchlist';
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
export type LockStatus = 'Open' | 'In Progress' | 'Complete';
export type UserRole = 'admin' | 'analyst' | 'viewer';

export interface CgtCompany {
  id: string;
  company_name: string;
  parent_company: string;
  hq_country: string;
  website: string;
  ticker: string;
  segment_default: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CgtAsset {
  id: string;
  company_id: string;
  asset_name: string;
  modality: string;
  target_indication: string;
  lead_indication: string;
  clinicaltrials_gov_id: string;
  segment: Segment;
  phase_regulatory_status: string;
  filing_status: string;
  fda_designations: string;
  pdufa_date: string | null;
  key_upcoming_catalyst: string;
  catalyst_date: string | null;
  us_commercialization_window: string;
  likely_us_launch_within_24_months: LikelyLaunch24;
  manufacturing_status: ManufacturingStatus;
  manufacturing_pathway: ManufacturingPathway;
  manufacturing_cmc_risk_notes: string;
  commercial_buildout_status: CommercialBuildoutStatus;
  commercial_readiness_signals: string;
  treatment_network_status: string;
  distribution_model: string;
  key_executive_hires_changes: string;
  regulatory_clinical_risk_notes: string;
  market_access_complexity_notes: string;
  latest_material_update: string;
  clinical_hold: boolean;
  no_manufacturing_pathway: boolean;
  timeline_over_24_months: boolean;
  no_us_path: boolean;
  regulatory_score: number;
  commercial_infrastructure_score: number;
  market_attractiveness_score: number;
  capability_gap_leverage_score: number;
  raw_commercial_score: number;
  final_commercial_score: number;
  strategic_opportunity_score: number;
  commercial_priority_tier: Tier | null;
  strategic_priority_tier: Tier | null;
  confidence_level: ConfidenceLevel;
  last_reviewed_at: string | null;
  last_reviewed_by: string | null;
  lock_status: LockStatus;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CgtAssetWithCompany extends CgtAsset {
  company?: CgtCompany;
}

export interface CgtAssetSource {
  id: string;
  asset_id: string;
  source_type: string;
  source_title: string;
  source_url: string;
  source_domain: string;
  source_date: string | null;
  is_primary_source: boolean;
  signal_type: string;
  notes: string;
  created_at: string;
}

export interface CgtChangeLog {
  id: string;
  asset_id: string;
  run_date: string;
  update_week: string;
  agent_id: string | null;
  change_type: string;
  field_changed: string;
  previous_value: string;
  new_value: string;
  why_it_matters: string;
  score_impact_explanation: string;
  source_url: string;
  confidence_level: ConfidenceLevel;
  created_at: string;
}

export interface CgtScoreHistory {
  id: string;
  asset_id: string;
  week_label: string;
  regulatory_score: number;
  commercial_infrastructure_score: number;
  market_attractiveness_score: number;
  capability_gap_leverage_score: number;
  raw_commercial_score: number;
  final_commercial_score: number;
  strategic_opportunity_score: number;
  commercial_priority_tier: Tier | null;
  strategic_priority_tier: Tier | null;
  recorded_at: string;
  recorded_by: string | null;
}

export interface CgtUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface CgtAgentAssignment {
  id: string;
  user_id: string;
  company_id: string;
  assignment_group: string;
  is_active: boolean;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      cgt_companies: { Row: CgtCompany; Insert: Partial<CgtCompany>; Update: Partial<CgtCompany> };
      cgt_assets: { Row: CgtAsset; Insert: Partial<CgtAsset>; Update: Partial<CgtAsset> };
      cgt_asset_sources: { Row: CgtAssetSource; Insert: Partial<CgtAssetSource>; Update: Partial<CgtAssetSource> };
      cgt_change_log: { Row: CgtChangeLog; Insert: Partial<CgtChangeLog>; Update: Partial<CgtChangeLog> };
      cgt_score_history: { Row: CgtScoreHistory; Insert: Partial<CgtScoreHistory>; Update: Partial<CgtScoreHistory> };
      cgt_users: { Row: CgtUser; Insert: Partial<CgtUser>; Update: Partial<CgtUser> };
      cgt_agent_assignments: { Row: CgtAgentAssignment; Insert: Partial<CgtAgentAssignment>; Update: Partial<CgtAgentAssignment> };
    };
  };
};
