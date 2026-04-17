/*
  # Add country column to companies table

  1. Modified Tables
    - `companies`
      - Added `country` (text, default 'United States') - Company country of operation
  2. Data Updates
    - Sets all existing companies to 'United States' since current data
      was sourced from US clinical trials
  3. Important Notes
    - Default value ensures all new inserts default to United States
    - No data loss or destructive operations
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'country'
  ) THEN
    ALTER TABLE companies ADD COLUMN country text DEFAULT 'United States';
  END IF;
END $$;

UPDATE companies SET country = 'United States' WHERE country IS NULL;
