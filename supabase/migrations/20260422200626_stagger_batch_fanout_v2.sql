-- Stagger the fan-out so we do not hammer Anthropic with 11 batches x
-- ~10 parallel Haiku calls = ~110 concurrent requests in the same
-- second. Tier-1 Haiku caps at 50 RPM.
--
-- Redefine trigger_agent_batches to sleep between http_post calls.
-- 8 seconds between batches x 11 batches ~= 90 seconds of fan-out.

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
  v_batch         uuid[];
  v_count         int  := 0;
  v_stagger_secs  int  := 8;
  v_payload       jsonb;
BEGIN
  SELECT value INTO v_anon_key FROM public.app_config WHERE key = 'supabase_anon_key';
  IF v_anon_key IS NULL THEN
    RAISE NOTICE 'supabase_anon_key not configured in public.app_config; skipping fan-out.';
    RETURN 0;
  END IF;

  FOR v_batch IN
    WITH ranked AS (
      SELECT id, row_number() OVER (ORDER BY id) AS rn
      FROM public.cgt_companies
      WHERE COALESCE(status, 'active') = 'active'
    )
    SELECT array_agg(id)
    FROM ranked
    GROUP BY (rn - 1) / 10
    ORDER BY (rn - 1) / 10
  LOOP
    v_payload := jsonb_build_object('company_ids', to_jsonb(v_batch))
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

    IF v_count < ceil(
      (SELECT count(*)::numeric FROM public.cgt_companies WHERE COALESCE(status, 'active') = 'active') / 10
    ) THEN
      PERFORM pg_sleep(v_stagger_secs);
    END IF;
  END LOOP;

  RETURN v_count;
END
$$;
