-- Scheduler for the agent workflow using pg_cron + pg_net.
--
-- This migration:
--   1. Enables required extensions.
--   2. Creates a helper function that fans out active companies into
--      batches of 10 and POSTs each batch to the target Edge Function.
--   3. Registers three cron jobs:
--        - weekly signal-detection   — Sunday 02:00 UTC
--        - weekly discovery          — Sunday 03:00 UTC
--        - monthly re-evaluation     — 1st of month, 03:00 UTC
--
-- Prereqs (set once via SQL or Supabase Dashboard → Database → Vault):
--   app.functions_base_url  → e.g. https://<project>.functions.supabase.co
--   app.service_role_key    → the SUPABASE_SERVICE_ROLE_KEY (used only by
--                             pg_net to call the Edge Functions; not the
--                             anon key)
--
-- Note: we batch active companies only. Candidate companies (status=
-- 'candidate') are excluded until an analyst promotes them to 'active'.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- Config helpers: read from current_setting so secrets live in the DB config.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._functions_base_url()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.functions_base_url', true)
$$;

CREATE OR REPLACE FUNCTION public._service_role_key()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.service_role_key', true)
$$;

-- ---------------------------------------------------------------------------
-- Fan-out helper: batch active cgt_companies into groups of 10 and POST each
-- batch to the named Edge Function with a shared payload of { company_ids,
-- <label_field>: <label_value> }.
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
  v_base_url  text := public._functions_base_url();
  v_key       text := public._service_role_key();
  v_batch     uuid[];
  v_count     int := 0;
  v_payload   jsonb;
BEGIN
  IF v_base_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'app.functions_base_url and app.service_role_key must be configured';
  END IF;

  FOR v_batch IN
    WITH ranked AS (
      SELECT id, row_number() OVER (ORDER BY id) AS rn
      FROM public.cgt_companies
      WHERE status = 'active'
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
                   'Authorization', 'Bearer ' || v_key
                 ),
      body    := v_payload
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END
$$;

-- Discovery doesn't take company_ids — it just needs a week_label.
CREATE OR REPLACE FUNCTION public.trigger_discovery(p_week_label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url text := public._functions_base_url();
  v_key      text := public._service_role_key();
BEGIN
  IF v_base_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'app.functions_base_url and app.service_role_key must be configured';
  END IF;
  PERFORM net.http_post(
    url     := v_base_url || '/discovery',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('week_label', p_week_label)
  );
END
$$;

-- ---------------------------------------------------------------------------
-- Cron jobs
-- ---------------------------------------------------------------------------

-- Clean up any prior schedules of the same name so re-runs are idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
    WHERE jobname IN (
      'cgt-weekly-signal-detection',
      'cgt-weekly-discovery',
      'cgt-monthly-reevaluation'
    );
EXCEPTION WHEN undefined_table THEN
  -- pg_cron not yet initialized in this session
  NULL;
END
$$;

-- Weekly signal detection — Sundays 02:00 UTC
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

-- Weekly discovery — Sundays 03:00 UTC
SELECT cron.schedule(
  'cgt-weekly-discovery',
  '0 3 * * 0',
  $$
    SELECT public.trigger_discovery(
      to_char(now() at time zone 'UTC', 'IYYY-"W"IW')
    );
  $$
);

-- Monthly re-evaluation — 1st of month, 03:00 UTC
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
