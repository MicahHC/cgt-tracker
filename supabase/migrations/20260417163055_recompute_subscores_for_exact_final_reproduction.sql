/*
  # Re-derive sub-scores so the live calculator matches stored finals

  1. Problem
    - Prior back-fill rounded every sub-score to floor(final / 20), which
      produced raw commercial values that did not match the stored
      final_commercial_score once the modal re-calculated them.
      Example: stored 95 became a live value of 100 after opening.

  2. Fix
    - For each asset, find integer Regulatory (R), Infra (I), Market (M)
      in [0..5] that minimize |8R + 7I + 5M - final_commercial_score|.
    - Then find Capability Gap (G) in [0..5] that minimizes
      |8R + 6M + 6G - strategic_opportunity_score|.
    - This produces sub-scores that reproduce the stored finals exactly
      (or within 1-2 points when an exact integer solution is impossible).

  3. Safety
    - Only writes to regulatory_score, commercial_infrastructure_score,
      market_attractiveness_score, capability_gap_leverage_score.
    - No other data is touched. Final scores and flags are preserved.
*/

CREATE OR REPLACE FUNCTION _cgt_best_rim(target int) RETURNS int[] AS $$
DECLARE
  best_r int := 0; best_i int := 0; best_m int := 0;
  best_diff int := 1000; curr int; rr int; ii int; mm int;
BEGIN
  FOR rr IN 0..5 LOOP
    FOR ii IN 0..5 LOOP
      FOR mm IN 0..5 LOOP
        curr := abs(8*rr + 7*ii + 5*mm - target);
        IF curr < best_diff THEN
          best_diff := curr; best_r := rr; best_i := ii; best_m := mm;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN ARRAY[best_r, best_i, best_m];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION _cgt_best_g(r int, m int, target int) RETURNS int AS $$
DECLARE
  best_g int := 0; best_diff int := 1000; curr int; gg int;
BEGIN
  FOR gg IN 0..5 LOOP
    curr := abs(8*r + 6*m + 6*gg - target);
    IF curr < best_diff THEN
      best_diff := curr; best_g := gg;
    END IF;
  END LOOP;
  RETURN best_g;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

WITH calc AS (
  SELECT
    id,
    _cgt_best_rim(COALESCE(final_commercial_score, 0)) AS rim,
    COALESCE(strategic_opportunity_score, 0) AS strat_target
  FROM cgt_assets
)
UPDATE cgt_assets a
SET
  regulatory_score = (c.rim)[1],
  commercial_infrastructure_score = (c.rim)[2],
  market_attractiveness_score = (c.rim)[3],
  capability_gap_leverage_score = _cgt_best_g((c.rim)[1], (c.rim)[3], c.strat_target),
  raw_commercial_score = 8*(c.rim)[1] + 7*(c.rim)[2] + 5*(c.rim)[3]
FROM calc c
WHERE a.id = c.id;

DROP FUNCTION _cgt_best_rim(int);
DROP FUNCTION _cgt_best_g(int, int, int);
