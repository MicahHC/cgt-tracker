/*
  # ABM audience segments + client suppression

  1. Add audience_segment and is_client to cgt_abm_weekly_engagement
  2. Create cgt_abm_client_domains lookup table for persistent client flagging
*/

-- Add segment + client flag to weekly engagement rows
ALTER TABLE public.cgt_abm_weekly_engagement
  ADD COLUMN IF NOT EXISTS audience_segment text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_client boolean NOT NULL DEFAULT false;

-- Persistent client domain lookup
CREATE TABLE IF NOT EXISTS public.cgt_abm_client_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cgt_abm_client_domains_domain_uniq
  ON public.cgt_abm_client_domains (domain);

ALTER TABLE public.cgt_abm_client_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read client domains"
  ON public.cgt_abm_client_domains FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert client domains"
  ON public.cgt_abm_client_domains FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update client domains"
  ON public.cgt_abm_client_domains FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete client domains"
  ON public.cgt_abm_client_domains FOR DELETE TO anon, authenticated USING (true);
