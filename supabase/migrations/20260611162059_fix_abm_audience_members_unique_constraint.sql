DROP INDEX IF EXISTS public.cgt_abm_audience_members_domain_uniq;
ALTER TABLE public.cgt_abm_audience_members
  DROP CONSTRAINT IF EXISTS cgt_abm_audience_members_domain_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS cgt_abm_audience_members_seg_domain_uniq
  ON public.cgt_abm_audience_members (audience_segment, domain);
