/*
  # Enable realtime broadcasts for live UI updates

  1. Purpose
    Let the frontend subscribe to changes on scoring, research, and signal
    tables so every page updates automatically when agents or users make edits.

  2. Tables added to the supabase_realtime publication
    - cgt_assets              (score/tier changes)
    - cgt_companies           (company edits)
    - cgt_score_history       (historical score snapshots)
    - cgt_change_log          (audit trail of field changes)
    - cgt_asset_sources       (source evidence additions)
    - cgt_agent_runs          (weekly/monthly agent run status)
    - cgt_signals             (detected signals)
    - research_jobs           (research job progress/completion)

  3. Security notes
    Realtime respects existing RLS policies on each table — clients only
    receive change events for rows they are already authorized to read.
    No policy changes are made here.
*/

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cgt_assets',
    'cgt_companies',
    'cgt_score_history',
    'cgt_change_log',
    'cgt_asset_sources',
    'cgt_agent_runs',
    'cgt_signals',
    'research_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
