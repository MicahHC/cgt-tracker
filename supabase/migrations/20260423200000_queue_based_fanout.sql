-- Queue-based fan-out that respects Anthropic Haiku tier-1 (5 RPM)
-- without relying on long-running pg_sleep loops.
--
-- Prior attempts used pg_sleep(12) between http_post calls to pace
-- dispatch at 5 RPM. That approach failed because the managed cluster
-- enforces a 2-minute statement_timeout on the pg_cron role, and the
-- function-level SET statement_timeout = '0' does not re-arm the
-- timer for the already-running statement.
--
-- New design:
--   1. cgt_fanout_queue table holds one row per HTTP call to dispatch.
--   2. trigger_agent_batches / trigger_discovery are now ENQUEUE
--      functions — they insert rows and return in <1s.
--   3. A new every-minute cron (cgt-fanout-tick) pops up to 5 pending
--      rows per minute and fires the actual http_post calls. Each
--      tick completes in <5s, well under the 2-min cap.
--   4. Rate envelope is identical (5 RPM) but split across many short
--      invocations instead of one long one. Crash-resilient: if a
--      tick dies, the next tick picks up remaining pending rows.

-- ---------------------------------------------------------------------
-- Queue table
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cgt_fanout_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name  text NOT NULL,                              -- 'signal-detection' | 'discovery' | 'monthly-reevaluation'
  label_field    text NOT NULL,                              -- 'week_label' | 'month_label'
  label_value    text NOT NULL,                              -- e.g. '2026-W17'
  company_id     uuid REFERENCES public.cgt_companies(id) ON DELETE CASCADE,
  payload        jsonb NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'failed')),
  attempts       int  NOT NULL DEFAULT 0,
  last_error     text,
  enqueued_at    timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz
);

CREATE INDEX IF NOT EXISTS cgt_fanout_queue_pending_idx
  ON public.cgt_fanout_queue (enqueued_at)
  WHERE status = 'pending';

ALTER TABLE public.cgt_fanout_queue ENABLE ROW LEVEL SECURITY;
-- service_role only (MCP + edge functions bypass RLS; nothing else should touch this)
DROP POLICY IF EXISTS "cgt_fanout_queue_service_only" ON public.cgt_fanout_queue;
CREATE POLICY "cgt_fanout_queue_service_only" ON public.cgt_fanout_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- Enqueue functions (replace the prior dispatchers)
-- ---------------------------------------------------------------------

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
  v_inserted int;
BEGIN
  -- Idempotency: if this label_value already has pending rows for this
  -- function, don't re-enqueue. Prevents double-queueing when cron
  -- fires accidentally or admin invokes the same label twice.
  IF EXISTS (
    SELECT 1 FROM public.cgt_fanout_queue
    WHERE function_name = p_function_name
      AND label_value   = p_label_value
      AND status        = 'pending'
  ) THEN
    RAISE NOTICE 'fan-out already pending for %/%; skipping enqueue.', p_function_name, p_label_value;
    RETURN 0;
  END IF;

  WITH ins AS (
    INSERT INTO public.cgt_fanout_queue (function_name, label_field, label_value, company_id, payload)
    SELECT
      p_function_name,
      p_label_field,
      p_label_value,
      c.id,
      jsonb_build_object('company_ids', jsonb_build_array(c.id))
        || jsonb_build_object(p_label_field, p_label_value)
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
  IF EXISTS (
    SELECT 1 FROM public.cgt_fanout_queue
    WHERE function_name = 'discovery'
      AND label_value   = p_week_label
      AND status        = 'pending'
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.cgt_fanout_queue (function_name, label_field, label_value, company_id, payload)
  VALUES (
    'discovery',
    'week_label',
    p_week_label,
    NULL,
    jsonb_build_object('week_label', p_week_label)
  );
  RETURN 1;
END
$$;

-- ---------------------------------------------------------------------
-- Drain function — fires http_post for up to N pending rows
-- ---------------------------------------------------------------------
--
-- Called by the every-minute tick cron. Uses SELECT ... FOR UPDATE
-- SKIP LOCKED so concurrent ticks don't double-send the same row.

CREATE OR REPLACE FUNCTION public.drain_fanout_queue(p_limit int DEFAULT 5)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url  text := 'https://dbnmnorholzehkppwvap.functions.supabase.co';
  v_anon_key  text;
  v_row       RECORD;
  v_sent      int := 0;
BEGIN
  SELECT value INTO v_anon_key FROM public.app_config WHERE key = 'supabase_anon_key';
  IF v_anon_key IS NULL THEN
    RAISE NOTICE 'supabase_anon_key not configured; skipping drain.';
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT id, function_name, payload
    FROM public.cgt_fanout_queue
    WHERE status = 'pending'
    ORDER BY enqueued_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := v_base_url || '/' || v_row.function_name,
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || v_anon_key,
                     'apikey',        v_anon_key
                   ),
        body    := v_row.payload
      );

      UPDATE public.cgt_fanout_queue
      SET status  = 'sent',
          sent_at = now(),
          attempts = attempts + 1
      WHERE id = v_row.id;

      v_sent := v_sent + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.cgt_fanout_queue
      SET attempts   = attempts + 1,
          last_error = SQLERRM,
          status     = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END
      WHERE id = v_row.id;
    END;
  END LOOP;

  RETURN v_sent;
END
$$;

-- ---------------------------------------------------------------------
-- Every-minute tick + cleanup of any stale one-off test jobs
-- ---------------------------------------------------------------------

DO $$
DECLARE v_id bigint;
BEGIN
  FOR v_id IN
    SELECT jobid FROM cron.job
    WHERE jobname = 'cgt-fanout-tick'
       OR jobname LIKE 'cgt-oneoff-test-%'
  LOOP
    PERFORM cron.unschedule(v_id);
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END
$$;

SELECT cron.schedule(
  'cgt-fanout-tick',
  '* * * * *',
  $$ SELECT public.drain_fanout_queue(5); $$
);
