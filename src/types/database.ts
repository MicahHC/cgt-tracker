export type Segment = 'Late Stage' | 'Early Stage' | 'On-Market' | 'ATC';
export type AbmAudienceSegment = 'Priority 1' | 'Priority 2' | 'ATC' | 'Early Stage' | 'Late Stage' | 'On Market' | '';
export type Tier = 'Tier 1' | 'Tier 2' | 'Watchlist' | 'Deprioritized' | 'Excluded';
export type ManufacturingStatus = 'Established' | 'Scaling' | 'Early' | 'Constrained' | 'Critical Gap';
export type ManufacturingPathway = 'Yes' | 'No' | 'Unclear';
export type CommercialBuildoutStatus = 'Established' | 'Scaling' | 'Early' | 'Minimal' | 'None';
export type LikelyLaunch18 = 'Yes' | 'No' | 'Watchlist';
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
  status: string;
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
  // Legacy database column name; product meaning is likely U.S. launch within 18 months.
  likely_us_launch_within_24_months: LikelyLaunch18;
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

export interface CgtAbmWeeklyEngagement {
  id: string;
  week_label: string;
  reporting_period: string;
  report_generated_at: string;
  source_file_name: string;
  account_name: string;
  normalized_account_name: string;
  is_total: boolean;
  spend: number;
  impressions: number;
  ecpm: number;
  clicks: number;
  ctr: number;
  ecpc: number;
  viewability: number | null;
  accounts_reached: number;
  accounts_engaged: number;
  account_ctr: number | null;
  account_vtr: number | null;
  campaigns: number;
  cost_per_account_reached: number | null;
  cost_per_account_engaged: number | null;
  newly_qualified_accounts: number;
  pipeline: number;
  new_pipeline: number;
  closed_won_pipeline: number;
  audience_segment: AbmAudienceSegment;
  is_client: boolean;
  uploaded_at: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface CgtAbmClientDomain {
  id: string;
  domain: string;
  account_name: string;
  notes: string;
  created_at: string;
}

export interface CgtAbmAudienceMember {
  id: string;
  domain: string;
  account_name: string;
  country: string;
  audience_segment: AbmAudienceSegment;
  created_at: string;
  is_client: boolean;
  buying_stage: string | null;
  profile_fit: string | null;
  intent_score: number | null;
  sixsense_segments: string | null;
  enriched_at: string | null;
}

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      cgt_companies: Table<CgtCompany>;
      cgt_assets: Table<CgtAsset>;
      cgt_asset_sources: Table<CgtAssetSource>;
      cgt_change_log: Table<CgtChangeLog>;
      cgt_score_history: Table<CgtScoreHistory>;
      cgt_users: Table<CgtUser>;
      cgt_agent_assignments: Table<CgtAgentAssignment>;
      cgt_abm_weekly_engagement: Table<CgtAbmWeeklyEngagement>;
      cgt_abm_client_domains: Table<CgtAbmClientDomain>;
      cgt_abm_audience_members: Table<CgtAbmAudienceMember>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
