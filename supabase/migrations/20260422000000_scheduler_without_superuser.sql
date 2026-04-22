-- Replaces the prior scheduler (20260420000000) with one that does NOT
-- require ALTER DATABASE superuser privileges.
--
-- Prior design used `app.functions_base_url` and `app.service_role_key`
-- GUCs which can only be set via `ALTER DATABASE postgres SET …` (needs
-- superuser). Bolt's MCP connection is not superuser, and the user can't
-- reliably access the Supabase dashboard, so that path is blocked.
--
-- New design:
--   * Functions URL is hardcoded (project ref is not a secret).
--   * Cron authenticates to the Edge Functions using the ANON key, which
--     is a public JWT (it's in every frontend bundle). The key is stored
--     in a small `app_config` table in the `public` schema, which any
--     role with INSERT rights can populate — no superuser needed.
--   * Each Edge Function uses its own `SUPABASE_SERVICE_ROLE_KEY` (from
--     its runtime env) for DB writes. Cron never sees that key.
--
-- After this migration runs, Bolt should insert the anon key once:
--   INSERT INTO public.app_config (key, value)
--   VALUES ('supabase_anon_key', '<anon key from .env>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
-- Until that row exists, cron calls will return 401 but will NOT crash.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- App config table (public so Bolt's MCP can INSERT without superuser)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Deny anon/authenticated by default (RLS). Service role bypasses RLS, so
-- the Edge Functions can still read it. Bolt's MCP connects as service
-- role → INSERT works without policy.
DROP POLICY IF EXISTS "app_config_service_only" ON public.app_config;
CREATE POLICY "app_config_service_only" ON public.app_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Cron helper — fan out active companies into batches of 10 and POST each
-- to an Edge Function. Uses anon key from app_config for auth.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Re-schedule cron jobs (idempotent)
-- ---------------------------------------------------------------------------

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
  $$
    SELECT public.trigger_agent_batches(
      'signal-detection',
      'week_label',
      to_char(now() at time zone 'UTC', 'IYYY-"W"IW')
    );
  $$
);

SELECT cron.schedule(
  'cgt-weekly-discovery',
  '0 3 * * 0',
  $$
    SELECT public.trigger_discovery(
      to_char(now() at time zone 'UTC', 'IYYY-"W"IW')
    );
  $$
);

SELECT cron.schedule(
  'cgt-monthly-reevaluation',
  '0 3 1 * *',
  $$
    SELECT public.trigger_agent_batches(
      'monthly-reevaluation',
      'month_label',
      to_char(now() at time zone 'UTC', 'YYYY-MM')
    );
  $$
);
