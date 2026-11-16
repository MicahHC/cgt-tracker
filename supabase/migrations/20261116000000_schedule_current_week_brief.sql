-- Start the new ISO reporting week on Monday UTC so Monday's brief does not
-- inherit the previous week's label. The one-company-per-minute queue drains
-- overnight before the U.S. business day.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('cgt-weekly-signal-detection', 'cgt-weekly-discovery')
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'cgt-weekly-signal-detection',
  '0 0 * * 1',
  $$ SELECT public.trigger_agent_batches(
    'signal-detection', 'week_label',
    to_char(now() at time zone 'UTC', 'IYYY-"W"IW')
  ); $$
);

SELECT cron.schedule(
  'cgt-weekly-discovery',
  '0 1 * * 1',
  $$ SELECT public.trigger_discovery(
    to_char(now() at time zone 'UTC', 'IYYY-"W"IW')
  ); $$
);
