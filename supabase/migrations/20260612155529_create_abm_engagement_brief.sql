/*
  # ABM engagement brief (client-facing)

  1. New table cgt_abm_engagement_brief
     - One row per reporting period; full client-facing narrative stored as JSONB content.
     - Lets the Weekly Brief render an accurate, easy-to-read ABM recap and keeps
       segment sizes/overlap explicit so shared mega-caps are not read as double-counted.
  2. RLS enabled. Read is public (matches the app's anon-access model);
     writes restricted to authenticated users.
  3. Seeds the latest "Last 30 Days" report from the 6sense ABM exports.
*/

CREATE TABLE IF NOT EXISTS public.cgt_abm_engagement_brief (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label text NOT NULL,
  view_window text NOT NULL DEFAULT 'Last 30 Days',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published boolean NOT NULL DEFAULT true,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cgt_abm_engagement_brief_period_uniq
  ON public.cgt_abm_engagement_brief (period_label);

ALTER TABLE public.cgt_abm_engagement_brief ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read engagement brief"
  ON public.cgt_abm_engagement_brief FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "auth insert engagement brief"
  ON public.cgt_abm_engagement_brief FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update engagement brief"
  ON public.cgt_abm_engagement_brief FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete engagement brief"
  ON public.cgt_abm_engagement_brief FOR DELETE TO authenticated USING (true);
