/*
  # Fix Scoring Constraints to Match Auto-Scoring Logic

  1. Changes
    - Update phase3_enrollment_score constraint: 0-10 -> 0-15
    - Update data_readout_timing_score constraint: 0-5 -> 0-15
    - Update phase3_timeline_score constraint: 0-10 -> 0-20
    - Update regulatory_designations_score constraint: 0-10 -> 0-20
    - Update differentiation_score constraint: 0-5 -> 0-30

  2. Reasoning
    - Auto-scoring function uses different score ranges than original schema
    - Enrollment: max 15 (completed = 15, recruiting = 5)
    - Data Readout: max 15 (already completed = 15, <6mo = 10, 6-12mo = 6, 12+mo = 3)
    - Phase3 Timeline: max 20 (completed = 20, <12mo = 20, 12-18mo = 14, 18-24mo = 8, 24+mo = 4)
    - Regulatory Designations: max 20 (breakthrough+orphan = 20, other = 10)
    - Differentiation: max 30 (first-in-class = 30, few competitors = 20, moderate = 10, crowded = 5)
*/

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_phase3_enrollment_score_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_phase3_enrollment_score_check 
  CHECK (phase3_enrollment_score >= 0 AND phase3_enrollment_score <= 15);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_data_readout_timing_score_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_data_readout_timing_score_check 
  CHECK (data_readout_timing_score >= 0 AND data_readout_timing_score <= 15);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_phase3_timeline_score_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_phase3_timeline_score_check 
  CHECK (phase3_timeline_score >= 0 AND phase3_timeline_score <= 20);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_regulatory_designations_score_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_regulatory_designations_score_check 
  CHECK (regulatory_designations_score >= 0 AND regulatory_designations_score <= 20);

ALTER TABLE company_scores DROP CONSTRAINT IF EXISTS company_scores_differentiation_score_check;
ALTER TABLE company_scores ADD CONSTRAINT company_scores_differentiation_score_check 
  CHECK (differentiation_score >= 0 AND differentiation_score <= 30);
