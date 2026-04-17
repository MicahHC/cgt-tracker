/*
  # Update Scoring Model Schema for New Deterministic Engine

  1. Changes
    - Drop generated columns that depend on individual scores
    - Remove old scoring columns that don't align with new model
    - Add new columns for deterministic scoring:
      - base_score (0-100): determined by Phase III primary completion date
      - clinical_strength_deduction (0-20)
      - regulatory_momentum_deduction (0-15)
      - financial_stability_deduction (0-15)
      - competitive_intensity_deduction (0-10)
      - data_confidence_level (text: "high", "medium", "low")
      - commercialization_insight (text)
    - Recreate total_score as a writable column
    - Update tier to text type for Tier 1/2/3/4 labels

  2. Security
    - All existing RLS policies remain intact
    - No changes to authentication or authorization

  3. Notes
    - Final score = base_score - all deductions, clamped 0-100
    - Tier assignment: 85-100=Tier 1, 70-84=Tier 2, 55-69=Tier 3, <55=Tier 4
*/

-- Drop generated columns first
ALTER TABLE company_scores DROP COLUMN IF EXISTS clinical_data_total CASCADE;
ALTER TABLE company_scores DROP COLUMN IF EXISTS regulatory_momentum_total CASCADE;
ALTER TABLE company_scores DROP COLUMN IF EXISTS investor_funding_total CASCADE;
ALTER TABLE company_scores DROP COLUMN IF EXISTS market_competitive_total CASCADE;
ALTER TABLE company_scores DROP COLUMN IF EXISTS total_score CASCADE;

-- Drop old constraints
ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_phase3_enrollment_score_check;
ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_data_readout_timing_score_check;
ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_phase3_timeline_score_check;
ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_regulatory_designations_score_check;
ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_differentiation_score_check;
ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_publication_timing_score_check;
ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_funding_momentum_score_check;

-- Remove old scoring columns
ALTER TABLE company_scores DROP COLUMN IF EXISTS phase3_enrollment_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS phase3_enrollment_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS phase2_efficacy_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS phase2_efficacy_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS safety_profile_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS safety_profile_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS data_readout_timing_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS data_readout_timing_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS regulatory_designations_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS regulatory_designations_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS phase3_timeline_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS phase3_timeline_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS fda_engagement_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS fda_engagement_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS recent_funding_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS recent_funding_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS strategic_partnerships_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS strategic_partnerships_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS valuation_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS valuation_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS market_size_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS market_size_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS differentiation_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS differentiation_notes;
ALTER TABLE company_scores DROP COLUMN IF EXISTS commercial_readiness_score;
ALTER TABLE company_scores DROP COLUMN IF EXISTS commercial_readiness_notes;

-- Add new deterministic scoring columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'base_score'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN base_score integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'clinical_strength_deduction'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN clinical_strength_deduction integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'regulatory_momentum_deduction'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN regulatory_momentum_deduction integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'financial_stability_deduction'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN financial_stability_deduction integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'competitive_intensity_deduction'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN competitive_intensity_deduction integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'data_confidence_level'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN data_confidence_level text DEFAULT 'low';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'commercialization_insight'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN commercialization_insight text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'total_score'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN total_score integer DEFAULT 0;
  END IF;
END $$;

-- Update tier column to text if it's currently integer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'tier' AND data_type = 'integer'
  ) THEN
    ALTER TABLE company_scores ALTER COLUMN tier TYPE text USING 'Tier ' || tier::text;
    ALTER TABLE company_scores ALTER COLUMN tier SET DEFAULT 'Tier 4';
  END IF;
END $$;

-- Add constraints for new columns
ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_base_score_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_base_score_check 
  CHECK (base_score >= 0 AND base_score <= 100);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_clinical_strength_deduction_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_clinical_strength_deduction_check 
  CHECK (clinical_strength_deduction >= 0 AND clinical_strength_deduction <= 20);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_regulatory_momentum_deduction_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_regulatory_momentum_deduction_check 
  CHECK (regulatory_momentum_deduction >= 0 AND regulatory_momentum_deduction <= 15);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_financial_stability_deduction_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_financial_stability_deduction_check 
  CHECK (financial_stability_deduction >= 0 AND financial_stability_deduction <= 15);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_competitive_intensity_deduction_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_competitive_intensity_deduction_check 
  CHECK (competitive_intensity_deduction >= 0 AND competitive_intensity_deduction <= 10);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_data_confidence_level_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_data_confidence_level_check 
  CHECK (data_confidence_level IN ('high', 'medium', 'low'));

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_total_score_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_total_score_check 
  CHECK (total_score >= 0 AND total_score <= 100);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_tier_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_tier_check 
  CHECK (tier IN ('Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'));