/*
  # Add anchor trial, filing target, and designation source columns

  1. Modified Tables
    - `company_scores`
      - `anchor_trial_id` (text) - NCT ID of the most commercialization-relevant trial
      - `anchor_trial_phase` (text) - Normalized phase of the anchor trial
      - `anchor_primary_completion` (date) - Primary completion date of anchor trial
      - `filing_target_date` (text) - BLA/NDA filing target extracted from SEC/web sources
      - `designations_detail` (jsonb) - Array of {label, source} for each FDA designation
      - `missing_fields` (jsonb) - Array of field names that could not be populated
      - `blunt_callout` (text) - One plain-English risk/opportunity callout
      - `all_trials_considered` (integer) - Count of ClinicalTrials.gov studies evaluated

  2. Important Notes
    - These columns support the anchor-trial-based scoring model
    - All columns are nullable to preserve backward compatibility
    - No existing data is modified or deleted
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'anchor_trial_id'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN anchor_trial_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'anchor_trial_phase'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN anchor_trial_phase text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'anchor_primary_completion'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN anchor_primary_completion date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'filing_target_date'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN filing_target_date text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'designations_detail'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN designations_detail jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'missing_fields'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN missing_fields jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'blunt_callout'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN blunt_callout text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'all_trials_considered'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN all_trials_considered integer DEFAULT 0;
  END IF;
END $$;
