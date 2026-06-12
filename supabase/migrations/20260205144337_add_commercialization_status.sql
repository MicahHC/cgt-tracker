/*
  # Add Commercialization Status to Companies

  1. Changes
    - Add `commercialization_status` column to companies table
      - Values: 'preclinical', 'phase_1', 'phase_2', 'phase_3', 'bla_nda_filed', 'commercialized'
    - Add default value based on phase
    - Add index for filtering by status

  2. Purpose
    - Track whether companies have commercialized products
    - Distinguish between companies in trials vs on market
    - Enable filtering for only commercialized cell/gene therapies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'commercialization_status'
  ) THEN
    ALTER TABLE companies 
    ADD COLUMN commercialization_status text DEFAULT 'phase_1'
    CHECK (commercialization_status IN ('preclinical', 'phase_1', 'phase_2', 'phase_3', 'bla_nda_filed', 'commercialized'));
  END IF;
END $$;

UPDATE companies
SET commercialization_status = CASE
  WHEN phase = 'Approved' THEN 'commercialized'
  WHEN phase = 'BLA/NDA Filed' THEN 'bla_nda_filed'
  WHEN phase = 'Phase III' THEN 'phase_3'
  WHEN phase LIKE '%Phase II%' THEN 'phase_2'
  WHEN phase LIKE '%Phase I%' THEN 'phase_1'
  ELSE 'preclinical'
END
WHERE commercialization_status = 'phase_1';

CREATE INDEX IF NOT EXISTS idx_companies_commercialization_status 
ON companies(commercialization_status);

CREATE INDEX IF NOT EXISTS idx_companies_therapeutic_area 
ON companies(therapeutic_area);