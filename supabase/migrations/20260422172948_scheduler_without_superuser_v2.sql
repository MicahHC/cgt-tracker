-- Scheduler without superuser (v2). Extensions pg_cron and pg_net are
-- already installed; we skip CREATE EXTENSION to avoid re-running the
-- after-create scripts which require superuser.

CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_service_only" ON public.app_config;
CREATE POLICY "app_config_service_only" ON public.app_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

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
  v_base_url  text := 'https://dbnmnorholzehkppwvap.functions.supabase.co';
  v_anon_key  text;
  v_batch     uuid[];
  v_count     int := 0;
  v_payload   jsonb;
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
  END LOOP;

  RETURN v_count;
END
$$;

CREATE OR REPLACE FUNCTION public.trigger_discovery(p_week_label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url text := 'https://dbnmnorholzehkppwvap.functions.supabase.co';
  v_anon_key text;
BEGIN
  SELECT value INTO v_anon_key FROM public.app_config WHERE key = 'supabase_anon_key';
  IF v_anon_key IS NULL THEN
    RAISE NOTICE 'supabase_anon_key not configured in public.app_config; skipping discovery.';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_base_url || '/discovery',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_anon_key,
                 'apikey',        v_anon_key
               ),
    body    := jsonb_build_object('week_label', p_week_label)
  );
END
$$;

DO $$
DECLARE
  v_id bigint;
BEGIN
  FOR v_id IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'cgt-weekly-signal-detection',
      'cgt-weekly-discovery',
      'cgt-monthly-reevaluation'
    )
  LOOP
    PERFORM cron.unschedule(v_id);
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END
$$;

SELECT cron.schedule(
  'cgt-weekly-signal-detection',
  '0 2 * * 0',
  $CRON$
    SELECT public.trigger_agent_batches(
      'signal-detection',
      'week_label',
      to_char(now() at time zone 'UTC', 'IYYY-"W"IW')
    );
  $CRON$
);

SELECT cron.schedule(
  'cgt-weekly-discovery',
  '0 3 * * 0',
  $CRON$
    SELECT public.trigger_discovery(
      to_char(now() at time zone 'UTC', 'IYYY-"W"IW')
    );
  $CRON$
);

SELECT cron.schedule(
  'cgt-monthly-reevaluation',
  '0 3 1 * *',
  $CRON$
    SELECT public.trigger_agent_batches(
      'monthly-reevaluation',
      'month_label',
      to_char(now() at time zone 'UTC', 'YYYY-MM')
    );
  $CRON$
);
