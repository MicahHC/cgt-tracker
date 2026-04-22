-- Clean up cgt_agent_runs rows that were killed by the Edge Function
-- timeout before my code was parallelized. They're stuck in "running"
-- even though the per-asset writes (signals, score_history, change_log)
-- committed successfully. Mark them as "failed" with a clear reason so
-- the UI and future queries filter them out.
--
-- Defensive: only touch runs older than 10 minutes so in-flight runs
-- are not affected.

UPDATE public.cgt_agent_runs
SET
  status = 'failed',
  error = COALESCE(NULLIF(error, ''), 'edge_function_timeout_pre_parallelization'),
  finished_at = COALESCE(finished_at, now())
WHERE
  status = 'running'
  AND started_at < now() - interval '10 minutes';
