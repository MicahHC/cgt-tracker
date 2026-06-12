-- Allow the serialized fan-out to complete under pg_cron.
--
-- Problem: pg_cron runs jobs under a role whose statement_timeout is
-- 2 minutes. The serialized fan-out sleeps 12s between 108 companies
-- (~22 min total), so pg_cron cancels it after ~10 iterations with:
--   canceling statement due to statement timeout
--   CONTEXT: SQL statement "SELECT pg_sleep(v_stagger_secs)"
--
-- Fix: set statement_timeout to 0 at the top of the function, scoped
-- to the function transaction via set_config(..., true).

CREATE OR REPLACE FUNCTION public.trigger_agent_batches(
  p_function_name text,
  p_label_field   text,
  p_label_value   text
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url      text := 'https://dbnmnorholzehkppwvap.functions.supabase.co';
  v_anon_key      text;
  v_company_id    uuid;
  v_count         int  := 0;
  v_total         int;
  v_stagger_secs  int  := 12;
  v_payload       jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '0', true);

  SELECT value INTO v_anon_key FROM public.app_config WHERE key = 'supabase_anon_key';
  IF v_anon_key IS NULL THEN
    RAISE NOTICE 'supabase_anon_key not configured in public.app_config; skipping fan-out.';
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.cgt_companies
  WHERE COALESCE(status, 'active') = 'active';

  FOR v_company_id IN
    SELECT id FROM public.cgt_companies
    WHERE COALESCE(status, 'active') = 'active'
    ORDER BY id
  LOOP
    v_payload := jsonb_build_object('company_ids', jsonb_build_array(v_company_id))
                 || jsonb_build_object(p_label_field, p_label_value);

    PERFORM net.http_post(
      url     := v_base_url || '/' || p_function_name,
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_anon_key,
                   'apikey',        v_anon_key
                 ),
      body    := v_payload
    );
    v_count := v_count + 1;

    IF v_count < v_total THEN
      PERFORM pg_sleep(v_stagger_secs);
    END IF;
  END LOOP;

  RETURN v_count;
END
$$;
