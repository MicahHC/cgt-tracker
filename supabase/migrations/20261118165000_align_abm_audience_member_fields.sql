-- Preserve the historical ABM enrichment fields already present in the live
-- tracker. This migration stores existing values only; it does not connect to
-- or invoke any external intent provider.
ALTER TABLE public.cgt_abm_audience_members
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS is_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buying_stage text,
  ADD COLUMN IF NOT EXISTS profile_fit text,
  ADD COLUMN IF NOT EXISTS intent_score numeric,
  ADD COLUMN IF NOT EXISTS sixsense_segments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;
