/*
  # Add Deduction Rationale Fields

  1. Changes
    - Add rationale text fields for each deduction category
    - These store the reasoning/context for why each deduction was applied
    - Helps users understand the deterministic scoring decisions

  2. New Columns
    - clinical_strength_rationale (text)
    - regulatory_momentum_rationale (text)
    - financial_stability_rationale (text)
    - competitive_intensity_rationale (text)

  3. Security
    - No RLS changes needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'clinical_strength_rationale'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN clinical_strength_rationale text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'regulatory_momentum_rationale'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN regulatory_momentum_rationale text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'financial_stability_rationale'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN financial_stability_rationale text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_scores' AND column_name = 'competitive_intensity_rationale'
  ) THEN
    ALTER TABLE company_scores ADD COLUMN competitive_intensity_rationale text DEFAULT '';
  END IF;
END $$;