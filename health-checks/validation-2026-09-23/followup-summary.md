# Candidate Launch Review - September 23, 2026

## Completed

- Evidence assessment recorded for all 56 candidate therapy records across the original 52-company review batch.
- 42 additional asset updates saved and read back successfully. Sources, review notes, change logs and score history retained.
- 72 distinct therapy records now have a cumulative review in the two review manifests. This is not a full clinical or numerical-score revalidation of all assets.
- All 627 assets and 450 companies retained. A subsequent hard-cap correction changed RGX-202 from 50 to 58 and OCU-410ST from 50 to 40; six other supported launch records had only their contradictory over-24-month flags corrected. Each change has source-linked change-log and score-history entries.
- Priority 1: 12 companies. Priority 2: 0 companies currently qualifying under the source-reviewed launch rule and CGT scope. These are supported subsets, not market-size estimates.
- Saved and displayed priorities match; no overlap and no missing qualified-account domains. Existing closed-won suppression rules retained and regression-tested.
- Vercel production deployment dpl_C3fwobT68gesFvKUMKWb4guAzjEQ is READY at https://cgt-tracker-three.vercel.app/.
- Browser verified 12 Late Stage/Priority 1 accounts, 50 Launch Timing Review accounts, and therapy-specific explanations on review cards.
- Typecheck, production build and audience regression tests pass. Deployment error-log query returned no logs, not proof of continuous monitoring.
- Full-universe field audit found 14 source-reviewed U.S. launch targets among 627 assets, 445 assets without a linked asset source, and 103 records with late-stage/filing language but no source-reviewed launch target. These 103 are a research queue, not 103 eligible accounts.
- App-side cap labels and Priority 2 explanation were deployed to cgt-tracker-three.vercel.app in Vercel deployment dpl_C3fwobT68gesFvKUMKWb4guAzjEQ.

## Important Distinctions

- Reviewed does not mean a launch has been confirmed. The 50 review accounts now have evidence notes; some lack dates, some have conflicting/stale records, and some have clinical risks or identity/scope issues.
- Ocugen qualified in the preceding correction batch. Orchard OTL-203 is now explicitly outside the 24-month window based on the parent company's planned 2029/2030 approval.
- Nanoscope BLA acceptance and Aurion U.S. Phase 3 enrollment completion are recorded without inventing launch dates.
- Cynata's June sponsor results and announced early termination supersede an older active trial-registry status.
- Dyne has a supported H1 2028 forecast for DYNE-101, but remains outside strict CGT priority audiences pending a decision on oligonucleotide-conjugate scope. DYNE-251 is a different product.
- A study's primary completion, BLA filing, approval decision and commercial availability are separate milestones.

## Remaining Limits

- This completes an evidence pass for the original candidate batch, not an exhaustive current-source audit of all 627 assets or proof that every eligible company in the global market has been found.
- Exact launch forecasts remain unavailable or insufficient for several clinically advanced programs. These are evidence gaps, not proof they cannot launch inside 24 months.
- Unresolved product aliases/platform-level records need authoritative identity mapping before broader changes. No assets were merged or deleted to hide those gaps.
- The local weekly and monthly agent fixes are not live: Supabase Edge Function deployment against the Bolt-backed project returned HTTP 403. Deployed weekly worker versions and full scheduled-run coverage remain unverified. Frontend deployment and database writes do not resolve that access issue.
- The previous discovery worker supplied no live search evidence. The local revision now checks a bounded ClinicalTrials.gov sample, but this is not exhaustive company-IR/FDA/SEC discovery and cannot independently validate a launch date.
- The Vercel frontend was updated; this does not establish that the cgtscore.com domain has been moved from its older hosting configuration.

## Evidence Files

- `candidate-review-findings.csv`: one row per candidate with saved status, specific finding and sources.
- `followup-verification.json`: database read-back checks and counts.
- `corrections-2026-09-23T17-55-05-326Z.json`: before values, patches and verified application status for the 42 updates.
- Repository manifests: `data/launch-reviews-2026-09-23.json` and `data/launch-review-followup-2026-09-23.json`.
