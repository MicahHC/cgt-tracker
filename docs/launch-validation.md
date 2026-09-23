# Launch audience validation

Priority 1 means a source-reviewed U.S. launch target within 18 months.
Priority 2 means beyond 18 months through 24 months. A company with both is
Priority 1 only. These are conditional forecasts, not guaranteed launches.

Source reviews are recorded in `data/launch-reviews-2026-09-23.json`, attached
to the therapy in `cgt_asset_sources`, and explained in the asset update and
append-only change log. Unreviewed launch forecasts are not evidence of
ineligibility: former near-term candidates remain in Launch Timing Review.
Counts must be described as a reviewed subset until that queue is resolved.

The September review covers 29 therapy records. Other tier changes remove
legacy labels that treated virtually every non-Priority-1 asset as Tier 2;
they do not represent clinical reviews of those assets. Numerical commercial
scores are unchanged. Approved products awaiting first commercial availability
can qualify; already marketed indications do not qualify merely by approval.

## Weekly checks

- Review updated company, FDA, registry, and filing evidence by therapy and indication.
- Keep filing, trial completion, approval, and first availability dates distinct.
- Reconcile GlobalData estimates without silently treating estimates as facts.
- Record sources and explanations for every accepted or disputed launch target.
- Rebuild exclusive company audiences and apply the existing CRM client suppression.
- Check missing domains, company aliases, parent ownership, and unresolved records.
- Report failed/missing research runs as coverage gaps, not 'no changes'.

The website and research functions share the same launch calculation. Research
function deployment is separate from website deployment. The September 23
CLI account does not expose the live Bolt database project, so deployment of
the revised scheduled functions has not been verified. A website deployment
alone does not close this automation gap.
