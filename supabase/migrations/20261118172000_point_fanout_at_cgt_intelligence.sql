-- The queue resolves its function base URL locally so scheduled work cannot
-- accidentally route back to the retired Bolt-backed project.
CREATE OR REPLACE FUNCTION public.drain_fanout_queue(p_limit integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url text := 'https://xftbvoxvrosqitzwimbk.functions.supabase.co';
  v_anon_key text;
  v_row record;
  v_sent integer := 0;
BEGIN
  SELECT value INTO v_anon_key
  FROM public.app_config
  WHERE key = 'supabase_anon_key';

  IF v_anon_key IS NULL THEN
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
        url := v_base_url || '/' || v_row.function_name,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key,
          'apikey', v_anon_key
        ),
        body := v_row.payload
      );

      UPDATE public.cgt_fanout_queue
      SET status = 'sent', sent_at = now(), attempts = attempts + 1
      WHERE id = v_row.id;
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.cgt_fanout_queue
      SET attempts = attempts + 1,
          last_error = SQLERRM,
          status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END
      WHERE id = v_row.id;
    END;
  END LOOP;

  RETURN v_sent;
END
$$;
