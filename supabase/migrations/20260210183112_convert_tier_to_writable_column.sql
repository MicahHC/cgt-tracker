/*
  # Convert tier from generated column to writable column

  The tier calculation now considers Phase III timeline priority, minimum total
  score thresholds, and data coverage percentage. This complexity cannot be
  expressed in a SQL GENERATED ALWAYS column, so tier is converted to a regular
  writable column that the application computes and saves.

  1. Changes
    - Converts `tier` from GENERATED ALWAYS AS to a regular integer column
    - Preserves all existing tier values
    - Recalculates tier for all existing records using the new formula:
      - Phase III timeline as primary factor
      - Minimum score thresholds: Tier 1 >= 55, Tier 2 >= 40, Tier 3 >= 25
      - Data coverage: <30% scored = Tier 4 cap, <50% scored = Tier 3 cap
      - Clinical red flag downgrade if clinical total < 10
      - Upgrade path if total >= 80 or >= 65

  2. Important Notes
    - No data is lost; existing tier values are preserved and then recalculated
    - The tier column retains a DEFAULT of 4
    - Index on tier is recreated after column conversion
*/

ALTER TABLE company_scores ADD COLUMN IF NOT EXISTS tier_value integer DEFAULT 4;

UPDATE company_scores SET tier_value = tier;

ALTER TABLE company_scores DROP COLUMN tier;

ALTER TABLE company_scores RENAME COLUMN tier_value TO tier;

DO $$
DECLARE
  r RECORD;
  base_tier integer;
  max_tier_score integer;
  max_tier_coverage integer;
  clinical_total integer;
  total integer;
  scored_count integer;
  final_tier integer;
BEGIN
  FOR r IN SELECT * FROM company_scores LOOP
    clinical_total := r.phase3_enrollment_score + r.phase2_efficacy_score +
      r.safety_profile_score + r.data_readout_timing_score;
    total := clinical_total + r.regulatory_designations_score +
      r.phase3_timeline_score + r.fda_engagement_score +
      r.recent_funding_score + r.strategic_partnerships_score +
      r.valuation_score + r.market_size_score +
      r.differentiation_score + r.commercial_readiness_score;

    scored_count := 0;
    IF r.phase3_enrollment_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.phase2_efficacy_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.safety_profile_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.data_readout_timing_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.regulatory_designations_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.phase3_timeline_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.fda_engagement_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.recent_funding_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.strategic_partnerships_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.valuation_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.market_size_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.differentiation_score > 0 THEN scored_count := scored_count + 1; END IF;
    IF r.commercial_readiness_score > 0 THEN scored_count := scored_count + 1; END IF;

    IF r.phase3_timeline_score > 0 THEN
      IF r.phase3_timeline_score = 10 THEN base_tier := 1;
      ELSIF r.phase3_timeline_score = 7 THEN base_tier := 2;
      ELSIF r.phase3_timeline_score = 4 THEN base_tier := 3;
      ELSE base_tier := 4;
      END IF;

      IF total >= 55 THEN max_tier_score := 1;
      ELSIF total >= 40 THEN max_tier_score := 2;
      ELSIF total >= 25 THEN max_tier_score := 3;
      ELSE max_tier_score := 4;
      END IF;

      IF scored_count < 4 THEN max_tier_coverage := 4;
      ELSIF scored_count < 7 THEN max_tier_coverage := 3;
      ELSE max_tier_coverage := 1;
      END IF;

      IF clinical_total < 10 AND base_tier <= 2 THEN
        base_tier := LEAST(base_tier + 1, 4);
      END IF;

      final_tier := GREATEST(base_tier, max_tier_score, max_tier_coverage);

      IF total >= 80 AND final_tier = 2 THEN final_tier := 1;
      ELSIF total >= 65 AND final_tier = 3 THEN final_tier := 2;
      END IF;
    ELSE
      IF total >= 85 THEN final_tier := 1;
      ELSIF total >= 70 THEN final_tier := 2;
      ELSIF total >= 50 THEN final_tier := 3;
      ELSE final_tier := 4;
      END IF;
    END IF;

    UPDATE company_scores SET tier = final_tier WHERE id = r.id;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_scores_tier ON company_scores(tier);
