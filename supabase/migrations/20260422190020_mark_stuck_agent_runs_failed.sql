-- Clean up cgt_agent_runs rows that were killed by the Edge Function
-- timeout before the function was parallelized. They're stuck in
-- "running" even though per-asset writes committed successfully.
-- Defensive: only touch runs older than 10 minutes.

UPDATE public.cgt_agent_runs
SET
  status = 'failed',
  error = COALESCE(NULLIF(error, ''), 'edge_function_timeout_pre_parallelization'),
  finished_at = COALESCE(finished_at, now())
WHERE
  status = 'running'
  AND started_at < now() - interval '10 minutes';
