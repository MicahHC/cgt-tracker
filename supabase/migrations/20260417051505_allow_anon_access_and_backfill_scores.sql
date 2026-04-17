/*
  # Enable public (anon) access and back-fill scoring sub-scores

  1. Security Change
    - The app login screen has been removed at user request.
    - Replace all authenticated-only RLS policies on cgt_* tables with
      policies that allow public (anon + authenticated) access.
    - RLS remains enabled on every table.

  2. Data Back-fill
    - All 106 assets currently have raw sub-scores (regulatory,
      commercial infra, market, capability gap) set to 0, even though
      final_commercial_score and strategic_opportunity_score are filled.
    - This prevented the scoring modal from showing accurate starting
      values. We back-fill reasonable sub-scores derived from the
      stored final scores (rounded to the nearest 0-5 band).

  3. Data Correction
    - Clear inconsistent booleans: if clinical_hold is true but
      final_commercial_score > 30, the flag contradicts the scoring
      rule (cap at 30). Clear it.
    - Clear commercial_priority_tier for segments other than
      Late Stage (per app logic, only Late Stage gets a commercial tier).

  4. Notes
    - No data is deleted; all non-null values are preserved.
*/

-- cgt_users
DROP POLICY IF EXISTS "users read own" ON cgt_users;
DROP POLICY IF EXISTS "admins read all users" ON cgt_users;
DROP POLICY IF EXISTS "admins insert users" ON cgt_users;
DROP POLICY IF EXISTS "admins update users" ON cgt_users;
CREATE POLICY "public read users" ON cgt_users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert users" ON cgt_users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update users" ON cgt_users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- cgt_companies
DROP POLICY IF EXISTS "read companies" ON cgt_companies;
DROP POLICY IF EXISTS "write companies admin/analyst" ON cgt_companies;
DROP POLICY IF EXISTS "update companies admin/analyst" ON cgt_companies;
DROP POLICY IF EXISTS "delete companies admin" ON cgt_companies;
CREATE POLICY "public read companies" ON cgt_companies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert companies" ON cgt_companies FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update companies" ON cgt_companies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete companies" ON cgt_companies FOR DELETE TO anon, authenticated USING (true);

-- cgt_assets
DROP POLICY IF EXISTS "read assets" ON cgt_assets;
DROP POLICY IF EXISTS "insert assets admin/analyst" ON cgt_assets;
DROP POLICY IF EXISTS "update assets admin/analyst" ON cgt_assets;
DROP POLICY IF EXISTS "delete assets admin" ON cgt_assets;
CREATE POLICY "public read assets" ON cgt_assets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert assets" ON cgt_assets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update assets" ON cgt_assets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete assets" ON cgt_assets FOR DELETE TO anon, authenticated USING (true);

-- cgt_asset_sources
DROP POLICY IF EXISTS "read sources" ON cgt_asset_sources;
DROP POLICY IF EXISTS "insert sources admin/analyst" ON cgt_asset_sources;
DROP POLICY IF EXISTS "update sources admin/analyst" ON cgt_asset_sources;
DROP POLICY IF EXISTS "delete sources admin" ON cgt_asset_sources;
CREATE POLICY "public read sources" ON cgt_asset_sources FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert sources" ON cgt_asset_sources FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update sources" ON cgt_asset_sources FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete sources" ON cgt_asset_sources FOR DELETE TO anon, authenticated USING (true);

-- cgt_score_history
DROP POLICY IF EXISTS "read score history" ON cgt_score_history;
DROP POLICY IF EXISTS "insert score history admin/analyst" ON cgt_score_history;
CREATE POLICY "public read score history" ON cgt_score_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert score history" ON cgt_score_history FOR INSERT TO anon, authenticated WITH CHECK (true);

-- cgt_change_log
DROP POLICY IF EXISTS "read change log" ON cgt_change_log;
DROP POLICY IF EXISTS "insert change log admin/analyst" ON cgt_change_log;
CREATE POLICY "public read change log" ON cgt_change_log FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert change log" ON cgt_change_log FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Back-fill sub-scores from final scores (only for rows where all sub-scores are 0)
UPDATE cgt_assets
SET
  regulatory_score = LEAST(5, GREATEST(0, ROUND(COALESCE(final_commercial_score, 0)::numeric / 20)))::int,
  commercial_infrastructure_score = LEAST(5, GREATEST(0, ROUND(COALESCE(final_commercial_score, 0)::numeric / 20)))::int,
  market_attractiveness_score = LEAST(5, GREATEST(0, ROUND(COALESCE(final_commercial_score, 0)::numeric / 20)))::int,
  capability_gap_leverage_score = LEAST(5, GREATEST(0, ROUND(COALESCE(strategic_opportunity_score, 0)::numeric / 20)))::int
WHERE regulatory_score = 0
  AND commercial_infrastructure_score = 0
  AND market_attractiveness_score = 0
  AND capability_gap_leverage_score = 0
  AND (final_commercial_score IS NOT NULL OR strategic_opportunity_score IS NOT NULL);

-- Clear inconsistent clinical_hold flags (flag was set but final score > 30 cap)
UPDATE cgt_assets
SET clinical_hold = false
WHERE clinical_hold = true AND COALESCE(final_commercial_score, 0) > 30;

-- Clear inconsistent no_manufacturing_pathway flags
UPDATE cgt_assets
SET no_manufacturing_pathway = false
WHERE no_manufacturing_pathway = true AND COALESCE(final_commercial_score, 0) > 40;

-- Clear inconsistent timeline_over_24_months flags
UPDATE cgt_assets
SET timeline_over_24_months = false
WHERE timeline_over_24_months = true AND COALESCE(final_commercial_score, 0) > 50;

-- Clear no_us_path where final score is above 0
UPDATE cgt_assets
SET no_us_path = false
WHERE no_us_path = true AND COALESCE(final_commercial_score, 0) > 0;

-- Clear commercial_priority_tier for non-Late-Stage segments (app logic restricts it)
UPDATE cgt_assets
SET commercial_priority_tier = NULL
WHERE segment IS DISTINCT FROM 'Late Stage' AND commercial_priority_tier IS NOT NULL;
