-- The monthly worker can rewrite scores, flags, and priorities from model output
-- without retrieving the cited documents. Keep weekly source gathering and
-- discovery running while monthly reevaluation is made evidence-backed.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'cgt-monthly-reevaluation'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END
$$;
