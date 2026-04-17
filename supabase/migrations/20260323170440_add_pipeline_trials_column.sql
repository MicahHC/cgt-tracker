/*
  # Add pipeline_trials column to company_scores

  1. Modified Tables
    - `company_scores`
      - `pipeline_trials` (jsonb) - Array of active Phase 2/3 trials with their NCT ID, phase, status, title, and primary completion date

  2. Notes
    - Stores all active clinical trials in the pipeline so the company list can show filing target dates for every therapy
    - Default value is an empty JSON array
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'pipeline_trials'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN pipeline_trials jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;
