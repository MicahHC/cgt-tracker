/*
  # Fix Tier Calculation
  
  1. Changes
    - Remove tier as a generated column
    - Make tier a regular integer column that can be set by the auto-scoring function
    - The auto-scoring function now uses Phase III timeline as the primary determinant
    
  2. Reason
    - The old tier calculation only looked at total score
    - The new logic prioritizes Phase III completion timeline
    - Phase III completing within 6-12 months = Tier 1 (regardless of score)
*/

-- Drop the generated column constraint
ALTER TABLE company_scores 
  ALTER COLUMN tier DROP EXPRESSION IF EXISTS;

-- Make tier a regular integer column with default value
ALTER TABLE company_scores 
  ALTER COLUMN tier SET DEFAULT 4;

-- Update comment
COMMENT ON COLUMN company_scores.tier IS 'Tier classification (1-4) calculated by auto-scoring function based on Phase III timeline as primary determinant';
