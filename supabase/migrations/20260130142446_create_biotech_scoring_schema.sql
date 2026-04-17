/*
  # Biotech Pipeline Scoring Schema

  This migration creates the database schema for a CGT (Cell & Gene Therapy) company
  scoring system used to prioritize companies for commercial partnership outreach.

  1. New Tables
    - `companies`
      - `id` (uuid, primary key) - Unique identifier
      - `name` (text) - Company name
      - `indication` (text) - Disease/condition being targeted
      - `phase` (text) - Current clinical phase (Phase II, Phase III, etc.)
      - `trial_id` (text) - ClinicalTrials.gov identifier (NCT number)
      - `therapeutic_area` (text) - Broader therapeutic category
      - `headquarters` (text) - Company location
      - `website` (text) - Company website URL
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp

    - `company_scores`
      - `id` (uuid, primary key) - Unique identifier
      - `company_id` (uuid, foreign key) - Reference to companies table
      - Clinical Data Quality scores (30 points total)
      - Regulatory & Momentum scores (25 points total)
      - Investor & Funding scores (25 points total)
      - Market & Competitive scores (20 points total)
      - `total_score` (integer) - Calculated total out of 100
      - `tier` (integer) - Tier assignment (1-4)
      - `key_insights` (text) - Summary insights
      - `next_milestone` (text) - Critical upcoming milestone
      - `engagement_recommendation` (text) - Recommended action
      - `scored_at` (timestamptz) - When scoring was performed
      - `scored_by` (text) - Who performed the scoring

    - `company_data_sources`
      - `id` (uuid, primary key) - Unique identifier
      - `company_id` (uuid, foreign key) - Reference to companies table
      - `source_type` (text) - Type of source (SEC, ClinicalTrials.gov, etc.)
      - `source_url` (text) - URL to the source
      - `source_description` (text) - Description of what data was obtained
      - `accessed_at` (timestamptz) - When source was accessed

    - `funding_rounds`
      - `id` (uuid, primary key) - Unique identifier
      - `company_id` (uuid, foreign key) - Reference to companies table
      - `round_type` (text) - Series A, B, C, etc.
      - `amount` (numeric) - Funding amount in millions
      - `post_money_valuation` (numeric) - Post-money valuation in millions
      - `closed_date` (date) - When round closed
      - `investors` (text) - Key investors

    - `strategic_partnerships`
      - `id` (uuid, primary key) - Unique identifier
      - `company_id` (uuid, foreign key) - Reference to companies table
      - `partner_name` (text) - Partner company name
      - `partnership_type` (text) - Co-development, commercialization, manufacturing, etc.
      - `announced_date` (date) - When partnership was announced
      - `details` (text) - Partnership details

  2. Security
    - RLS enabled on all tables
    - Policies for authenticated access

  3. Indexes
    - Index on company name for searching
    - Index on tier and total_score for ranking queries
*/

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  indication text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('Phase I', 'Phase I/II', 'Phase II', 'Phase II/III', 'Phase III', 'BLA/NDA Filed', 'Approved')),
  trial_id text,
  therapeutic_area text,
  headquarters text,
  website text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Company scores table with detailed breakdown
CREATE TABLE IF NOT EXISTS company_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Clinical Data Quality (30 points total)
  phase3_enrollment_score integer NOT NULL DEFAULT 0 CHECK (phase3_enrollment_score >= 0 AND phase3_enrollment_score <= 10),
  phase3_enrollment_notes text,
  phase2_efficacy_score integer NOT NULL DEFAULT 0 CHECK (phase2_efficacy_score >= 0 AND phase2_efficacy_score <= 10),
  phase2_efficacy_notes text,
  safety_profile_score integer NOT NULL DEFAULT 0 CHECK (safety_profile_score >= 0 AND safety_profile_score <= 5),
  safety_profile_notes text,
  data_readout_timing_score integer NOT NULL DEFAULT 0 CHECK (data_readout_timing_score >= 0 AND data_readout_timing_score <= 5),
  data_readout_timing_notes text,
  
  -- Regulatory & Commercial Momentum (25 points total)
  regulatory_designations_score integer NOT NULL DEFAULT 0 CHECK (regulatory_designations_score >= 0 AND regulatory_designations_score <= 10),
  regulatory_designations_notes text,
  phase3_timeline_score integer NOT NULL DEFAULT 0 CHECK (phase3_timeline_score >= 0 AND phase3_timeline_score <= 10),
  phase3_timeline_notes text,
  fda_engagement_score integer NOT NULL DEFAULT 0 CHECK (fda_engagement_score >= 0 AND fda_engagement_score <= 5),
  fda_engagement_notes text,
  
  -- Investor & Funding Signals (25 points total)
  recent_funding_score integer NOT NULL DEFAULT 0 CHECK (recent_funding_score >= 0 AND recent_funding_score <= 10),
  recent_funding_notes text,
  strategic_partnerships_score integer NOT NULL DEFAULT 0 CHECK (strategic_partnerships_score >= 0 AND strategic_partnerships_score <= 10),
  strategic_partnerships_notes text,
  valuation_score integer NOT NULL DEFAULT 0 CHECK (valuation_score >= 0 AND valuation_score <= 5),
  valuation_notes text,
  
  -- Market & Competitive Position (20 points total)
  market_size_score integer NOT NULL DEFAULT 0 CHECK (market_size_score >= 0 AND market_size_score <= 10),
  market_size_notes text,
  differentiation_score integer NOT NULL DEFAULT 0 CHECK (differentiation_score >= 0 AND differentiation_score <= 5),
  differentiation_notes text,
  commercial_readiness_score integer NOT NULL DEFAULT 0 CHECK (commercial_readiness_score >= 0 AND commercial_readiness_score <= 5),
  commercial_readiness_notes text,
  
  -- Calculated totals
  clinical_data_total integer GENERATED ALWAYS AS (
    phase3_enrollment_score + phase2_efficacy_score + safety_profile_score + data_readout_timing_score
  ) STORED,
  regulatory_momentum_total integer GENERATED ALWAYS AS (
    regulatory_designations_score + phase3_timeline_score + fda_engagement_score
  ) STORED,
  investor_funding_total integer GENERATED ALWAYS AS (
    recent_funding_score + strategic_partnerships_score + valuation_score
  ) STORED,
  market_competitive_total integer GENERATED ALWAYS AS (
    market_size_score + differentiation_score + commercial_readiness_score
  ) STORED,
  total_score integer GENERATED ALWAYS AS (
    phase3_enrollment_score + phase2_efficacy_score + safety_profile_score + data_readout_timing_score +
    regulatory_designations_score + phase3_timeline_score + fda_engagement_score +
    recent_funding_score + strategic_partnerships_score + valuation_score +
    market_size_score + differentiation_score + commercial_readiness_score
  ) STORED,
  
  -- Tier is calculated based on total score
  tier integer GENERATED ALWAYS AS (
    CASE 
      WHEN (phase3_enrollment_score + phase2_efficacy_score + safety_profile_score + data_readout_timing_score +
            regulatory_designations_score + phase3_timeline_score + fda_engagement_score +
            recent_funding_score + strategic_partnerships_score + valuation_score +
            market_size_score + differentiation_score + commercial_readiness_score) >= 85 THEN 1
      WHEN (phase3_enrollment_score + phase2_efficacy_score + safety_profile_score + data_readout_timing_score +
            regulatory_designations_score + phase3_timeline_score + fda_engagement_score +
            recent_funding_score + strategic_partnerships_score + valuation_score +
            market_size_score + differentiation_score + commercial_readiness_score) >= 70 THEN 2
      WHEN (phase3_enrollment_score + phase2_efficacy_score + safety_profile_score + data_readout_timing_score +
            regulatory_designations_score + phase3_timeline_score + fda_engagement_score +
            recent_funding_score + strategic_partnerships_score + valuation_score +
            market_size_score + differentiation_score + commercial_readiness_score) >= 50 THEN 3
      ELSE 4
    END
  ) STORED,
  
  -- Insights and recommendations
  key_insights text,
  next_milestone text,
  next_milestone_date date,
  engagement_recommendation text,
  
  -- Metadata
  scored_at timestamptz DEFAULT now(),
  scored_by text,
  
  CONSTRAINT unique_company_score UNIQUE (company_id)
);

-- Data sources for each company
CREATE TABLE IF NOT EXISTS company_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_url text,
  source_description text,
  accessed_at timestamptz DEFAULT now()
);

-- Funding rounds history
CREATE TABLE IF NOT EXISTS funding_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  round_type text NOT NULL,
  amount_millions numeric,
  post_money_valuation_millions numeric,
  closed_date date,
  investors text,
  created_at timestamptz DEFAULT now()
);

-- Strategic partnerships
CREATE TABLE IF NOT EXISTS strategic_partnerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  partnership_type text NOT NULL,
  announced_date date,
  details text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_partnerships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for companies
CREATE POLICY "Allow authenticated users to view companies"
  ON companies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert companies"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update companies"
  ON companies FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete companies"
  ON companies FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for company_scores
CREATE POLICY "Allow authenticated users to view scores"
  ON company_scores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert scores"
  ON company_scores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update scores"
  ON company_scores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete scores"
  ON company_scores FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for company_data_sources
CREATE POLICY "Allow authenticated users to view data sources"
  ON company_data_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert data sources"
  ON company_data_sources FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update data sources"
  ON company_data_sources FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete data sources"
  ON company_data_sources FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for funding_rounds
CREATE POLICY "Allow authenticated users to view funding rounds"
  ON funding_rounds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert funding rounds"
  ON funding_rounds FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update funding rounds"
  ON funding_rounds FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete funding rounds"
  ON funding_rounds FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for strategic_partnerships
CREATE POLICY "Allow authenticated users to view partnerships"
  ON strategic_partnerships FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert partnerships"
  ON strategic_partnerships FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update partnerships"
  ON strategic_partnerships FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete partnerships"
  ON strategic_partnerships FOR DELETE
  TO authenticated
  USING (true);

-- Anonymous access policies for demo purposes
CREATE POLICY "Allow anonymous users to view companies"
  ON companies FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous users to insert companies"
  ON companies FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to update companies"
  ON companies FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to delete companies"
  ON companies FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous users to view scores"
  ON company_scores FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous users to insert scores"
  ON company_scores FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to update scores"
  ON company_scores FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to delete scores"
  ON company_scores FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous users to view data sources"
  ON company_data_sources FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous users to insert data sources"
  ON company_data_sources FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to update data sources"
  ON company_data_sources FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to delete data sources"
  ON company_data_sources FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous users to view funding rounds"
  ON funding_rounds FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous users to insert funding rounds"
  ON funding_rounds FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to update funding rounds"
  ON funding_rounds FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to delete funding rounds"
  ON funding_rounds FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous users to view partnerships"
  ON strategic_partnerships FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous users to insert partnerships"
  ON strategic_partnerships FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to update partnerships"
  ON strategic_partnerships FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous users to delete partnerships"
  ON strategic_partnerships FOR DELETE
  TO anon
  USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_company_scores_total ON company_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_company_scores_tier ON company_scores(tier);
CREATE INDEX IF NOT EXISTS idx_company_scores_company_id ON company_scores(company_id);
CREATE INDEX IF NOT EXISTS idx_funding_rounds_company_id ON funding_rounds(company_id);
CREATE INDEX IF NOT EXISTS idx_partnerships_company_id ON strategic_partnerships(company_id);
CREATE INDEX IF NOT EXISTS idx_data_sources_company_id ON company_data_sources(company_id);
