-- Anthropic's current tier has a 5 RPM and 10k input TPM ceiling. Dispatch
-- one asset per minute so weekly work drains without bursting the token limit.
-- Keep the enqueue step idempotent even after a prior run has drained.

CREATE OR REPLACE FUNCTION public.trigger_agent_batches(
  p_function_name text,
  p_label_field text,
  p_label_value text
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int;
BEGIN
  IF NOT (
    (p_function_name = 'signal-detection' AND p_label_field = 'week_label') OR
    (p_function_name = 'monthly-reevaluation' AND p_label_field = 'month_label')
  ) THEN
    RAISE EXCEPTION 'Unsupported agent batch: %/%', p_function_name, p_label_field;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cgt-agent-batches:' || p_function_name || ':' || p_label_value));
  IF EXISTS (
    SELECT 1 FROM public.cgt_fanout_queue
    WHERE function_name = p_function_name AND label_value = p_label_value
  ) THEN
    RETURN 0;
  END IF;

  WITH ins AS (
    INSERT INTO public.cgt_fanout_queue (function_name, label_field, label_value, company_id, payload)
    SELECT p_function_name, p_label_field, p_label_value, c.id,
           jsonb_build_object('company_ids', jsonb_build_array(c.id), p_label_field, p_label_value)
    FROM public.cgt_companies c
    WHERE COALESCE(c.status, 'active') = 'active'
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END
$$;

CREATE OR REPLACE FUNCTION public.trigger_discovery(p_week_label text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cgt-discovery:' || p_week_label));
  IF EXISTS (
    SELECT 1 FROM public.cgt_fanout_queue
    WHERE function_name = 'discovery' AND label_value = p_week_label
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.cgt_fanout_queue (function_name, label_field, label_value, company_id, payload)
  VALUES ('discovery', 'week_label', p_week_label, NULL, jsonb_build_object('week_label', p_week_label));
  RETURN 1;
END
$$;

DO $$
DECLARE v_id bigint;
BEGIN
  FOR v_id IN SELECT jobid FROM cron.job WHERE jobname = 'cgt-fanout-tick' LOOP
    PERFORM cron.unschedule(v_id);
  END LOOP;
END
$$;

SELECT cron.schedule('cgt-fanout-tick', '* * * * *',
  $$ SELECT public.drain_fanout_queue(1); $$);
