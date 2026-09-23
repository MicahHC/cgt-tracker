# Audience validation status - September 23, 2026

## Completed

- Reviewed primary-source evidence for 29 therapy records and saved the sources.
- Recorded 14 conditional launch targets: 12 Priority 1 therapies and two
  Priority 2 therapies. The two Priority 2 therapies belong to companies that
  already qualify for Priority 1, so there are no separate Priority 2
  companies in this reviewed subset.
- Retained 52 unresolved accounts under Launch Timing Review rather than
  presenting their forecasts as confirmed targeting eligibility.
- Removed the legacy Tier 2 fallback from current asset metadata. In total,
  495 asset records had data or classification corrections; this does not mean
  495 therapies received clinical research reviews.
- Preserved all 627 therapy records and every numerical commercial score.
- Rebuilt saved audiences, checked priority exclusivity, and retained existing
  client suppression rules. No new closed-won claims were inferred.
- Corrected enGene's domain from engen.com to engene.com in the company and
  its three audience records.
- Appended source-backed change logs and score snapshots; original values
  remain in the audit files and change logs.
- Type checks, production build, audience regression tests, and launch-rule
  tests passed. The Vercel production interface displays the review warning
  and counts. Commit: 7093945.
- Audited all 627 live therapy records across 450 companies for source coverage,
  launch verification, and conflicting stage/identity flags. A separate registry
  query collected leads for late-stage-looking records; registry search results
  alone were not used to assert a launch window.
- Corrected three additional live records using direct evidence: Denali's
  AVLAYAH is an approved enzyme-replacement therapy, not a CGT launch prospect;
  a 4DMT composite record incorrectly said BLA accepted; Ray's RTx-015 was
  incorrectly listed as Phase 3 despite its Phase 1 study.

## Not Complete

This is a source-supported subset, not an exhaustive CGT market count. The
52 unresolved accounts must not be interpreted as confirmed nonqualifiers.
Neither GlobalData nor the tracker is assumed correct merely by being present.

The latest full-universe audit found 99 records with late-stage or filing
language but no source-reviewed U.S. launch target, and 507 records without a
direct primary-source link attached. These are work queues, not claims that
the programs are invalid or outside 24 months. The current audience is a
verified subset, not a complete validated market census.

The research function changes are committed but not deployed: the connected
Supabase management account does not expose live project dbnmnorholzehkppwvap.
Recent research run coverage cannot be certified from the available access.
The queue-pacing and deduplication migration is also not applied to that live
project; the historical five-per-minute drain can still hit the Anthropic
token limit. Weekly updates must not be described as reliable until this is
deployed and a complete run is verified.

The new interface is at https://cgt-tracker-three.vercel.app. cgtscore.com
still points at the older hosting setup. Shared database corrections do not
establish that the custom-domain frontend or scheduled functions were updated.

Arcellx/Gilead parent-account routing and Nanoscope's announced InspiroGene
agreement need CRM reconciliation. A public partnership announcement is not
proof of a closed-won CRM classification.

## Evidence

The full-universe field audit is in `full-universe-coverage.csv`, with totals in
`full-universe-coverage-summary.json`. The direct-evidence corrections are in
`data/evidence-corrections-2026-09-23.json`. The initial reviewed record/source map is in
`data/launch-reviews-2026-09-23.json` and on the corresponding tracker records.
Launch targets remain contingent on the stated clinical, regulatory, and
commercial dependencies; none is represented as a guaranteed future event.
