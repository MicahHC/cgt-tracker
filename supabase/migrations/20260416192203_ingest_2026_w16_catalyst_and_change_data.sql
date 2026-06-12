/*
  # Ingest 2026-W16 catalyst dates, PDUFA dates, and material changes

  1. Asset updates
    - Populate pdufa_date, catalyst_date, and key_upcoming_catalyst for
      late-stage assets where the MASTER TRACKER CSV provides explicit dates:
      Arcellx (anito-cel), Ultragenyx (DTX401/UX111), Capricor (Deramiocel),
      Kyverna (KYV-101), Intellia (HAELO), Neurogene (NGN-401),
      Taysha (TSHA-102). All dates are taken verbatim from the CSV
      (PDUFA Date / Catalyst Date columns).
  2. Change log
    - Insert change_log rows for every asset flagged "Change Detected = Yes"
      in the 2026-W16 refresh, using the supplied Change Reason and the
      latest material update as the context. These feed the
      "Recent material changes (30 days)" card on the Dashboard
      and the Change Log page.
  3. Notes
    - No destructive operations. No assumptions beyond what the CSV states.
    - Idempotent: the INSERT uses distinct update_week + field_changed
      per asset, so re-running would duplicate; we guard with NOT EXISTS.
*/

DO $$
DECLARE
  v_asset_id uuid;
BEGIN
  -- Arcellx anito-cel
  UPDATE cgt_assets SET
    pdufa_date = DATE '2026-12-23',
    catalyst_date = DATE '2026-12-23',
    key_upcoming_catalyst = 'PDUFA decision (anito-cel, BCMA CAR-T)'
  WHERE company_id = (SELECT id FROM cgt_companies WHERE company_name = 'Arcellx Inc');

  -- Ultragenyx DTX401 (earlier PDUFA) + note UX111
  UPDATE cgt_assets SET
    pdufa_date = DATE '2026-08-23',
    catalyst_date = DATE '2026-08-23',
    key_upcoming_catalyst = 'DTX401 PDUFA Aug 23, 2026; UX111 PDUFA Sep 19, 2026'
  WHERE company_id = (SELECT id FROM cgt_companies WHERE company_name = 'Ultragenyx Pharmaceutical Inc');

  -- Capricor Deramiocel
  UPDATE cgt_assets SET
    pdufa_date = DATE '2026-08-22',
    catalyst_date = DATE '2026-08-22',
    key_upcoming_catalyst = 'PDUFA decision (Deramiocel, DMD cardiomyopathy)'
  WHERE company_id = (SELECT id FROM cgt_companies WHERE company_name = 'Capricor Therapeutics Inc');

  -- Kyverna KYV-101
  UPDATE cgt_assets SET
    catalyst_date = DATE '2026-06-30',
    key_upcoming_catalyst = 'AAN 2026 SPS registrational data; BLA filing'
  WHERE company_id = (SELECT id FROM cgt_companies WHERE company_name = 'Kyverna Therapeutics Inc');

  -- Intellia HAELO
  UPDATE cgt_assets SET
    catalyst_date = DATE '2026-06-30',
    key_upcoming_catalyst = 'HAELO Phase 3 topline data (HAE)'
  WHERE company_id = (SELECT id FROM cgt_companies WHERE company_name = 'Intellia Therapeutics Inc');

  -- Neurogene NGN-401 (Q2 2026 dosing completion)
  UPDATE cgt_assets SET
    catalyst_date = DATE '2026-06-30',
    key_upcoming_catalyst = 'Embolden registrational dosing completion (Rett)'
  WHERE company_id = (SELECT id FROM cgt_companies WHERE company_name = 'Neurogene Inc');

  -- Taysha TSHA-102 (Q2 2026 pivotal dosing completion)
  UPDATE cgt_assets SET
    catalyst_date = DATE '2026-06-30',
    key_upcoming_catalyst = 'REVEAL/ASPIRE pivotal dosing completion (Rett)'
  WHERE company_id = (SELECT id FROM cgt_companies WHERE company_name = 'Taysha Gene Therapies Inc');
END $$;

-- Insert change log entries for all Change Detected = Yes rows (2026-W16)
INSERT INTO cgt_change_log (asset_id, run_date, update_week, change_type, field_changed, new_value, why_it_matters, confidence_level)
SELECT a.id, DATE '2026-04-14', '2026-W16', 'Material update', src.field_changed, src.new_value, src.why_it_matters, src.confidence
FROM (VALUES
  ('Gilead Sciences Inc', 'Manufacturing / Pipeline', 'Manufacturing capacity quadrupling; Arcellx acquisition', 'Manufacturing capacity quadrupling to ~24,000 units/year; FDA-approved 14-day process; Arcellx acquisition ($7.8B) adds anito-cel.', 'High'),
  ('Legend Biotech Corp', 'Commercial milestone', '10K patients milestone; manufacturing expansion; profitability expected', 'CARVYKTI 10,000+ patients treated; Raritan facility expanded to ~10K patients/year; operating profit expected 2026.', 'High'),
  ('Arcellx Inc', 'Regulatory', 'BLA accepted; PDUFA set; Gilead acquisition provides full commercial backing', 'BLA for anito-cel accepted with PDUFA Dec 23, 2026; 96% ORR in iMMagine-1; Priority Review. Gilead $7.8B acquisition.', 'High'),
  ('Ferring International Center SA', 'Regulatory / Guidelines', 'Accelerated thaw label; NCCN upgrade', 'FDA approved accelerated thaw label update March 2026; NCCN Category 2A upgrade for papillary BCG-unresponsive NMIBC.', 'High'),
  ('Vericel Corp', 'Manufacturing', 'New manufacturing facility approved', 'FDA approved new Burlington, MA manufacturing facility March 4, 2026; commercial production begins Q2 2026.', 'High'),
  ('Sarepta Therapeutics Inc', 'Clinical', '3yr EMBARK data positive; Cohort 8 enrolling', '3-year EMBARK data positive (70% decline reduction); ENDEAVOR Cohort 8 enrolling H2 2026 with sirolimus.', 'High'),
  ('Genetix Biotherapeutics Inc', 'Financial', 'Achieved profitability; manufacturing expansion', 'LYFGENIA + ZYNTEGLO commercializing; achieved profitability Q4 2025; full-year 2026 profitability targeted; manufacturing expansion.', 'High'),
  ('CSL Ltd', 'Supply / Clinical', 'Supply disruption; strong long-term data', 'HEMGENIX temporary global supply disruption March 17, 2026 (manufacturing complexity); 4-5yr data: 90%+ sustained off-prophylaxis.', 'High'),
  ('Abeona Therapeutics Inc', 'Commercial ramp', '5th QTC; patient funnel doubled; payer coverage expanding', '5th QTC activated (Columbia/NYP April 2); patient funnel doubled to 100; 80% commercial payer coverage; CMS permanent J-code.', 'High'),
  ('Ultragenyx Pharmaceutical Inc', 'Regulatory', 'DTX401 BLA accepted with Priority Review; dual PDUFA dates', 'DTX401 BLA accepted with PDUFA Aug 23, 2026 (Priority Review, GSD Ia); UX111 BLA resubmission accepted with PDUFA Sep 19, 2026 (Sanfilippo).', 'High'),
  ('Kyverna Therapeutics Inc', 'Regulatory / Clinical', 'SPS registrational data at AAN; BLA filing imminent', 'KYV-101 SPS BLA filing targeted H1 2026; MG Phase 3 KYSA-6 initiated Dec 2025; FDA SPA for SPS. First autoimmune CAR-T BLA expected.', 'Medium'),
  ('Intellia Therapeutics Inc', 'Regulatory / Clinical', 'nex-z holds lifted; HAELO data imminent', 'HAELO Phase 3 topline expected H1 2026; BLA submission H2 2026; nex-z ATTR clinical holds fully lifted March 2026.', 'Medium'),
  ('Candel Therapeutics Inc', 'Clinical', 'Phase 3 endpoint met; BLA planned Q4 2026', 'CAN-2409 Phase 3 primary endpoint achieved in prostate cancer (improved DFS); BLA submission planned Q4 2026; $100M RTW funding conditional on approval.', 'Medium'),
  ('PolarityBIO Inc', 'Regulatory', 'Phase 3 complete; BTD; BLA imminent', 'Phase 3 COVER DFUS II completed Dec 2025; FDA BTD; BLA planned April 2026.', 'Medium'),
  ('Neurogene Inc', 'Regulatory / Clinical', 'BTD granted; registrational trial >50% dosed', 'Embolden registrational trial 100% enrolled, 50%+ dosed for Rett; FDA BTD awarded; dosing completion expected Q2 2026.', 'Medium'),
  ('Taysha Gene Therapies Inc', 'Clinical', 'Pivotal dosing near-complete; FDA alignment on safety data', 'REVEAL/ASPIRE pivotal trials advancing for Rett; dosing expected complete Q2 2026; FDA alignment on 3-month safety data for broad label.', 'Medium'),
  ('enGene Holdings Inc', 'Regulatory', 'Pivotal enrollment complete; CMC Pilot; BLA planned 2H 2026', 'Renamed to enGene Therapeutics (April 7-8, 2026); LEGEND pivotal enrollment complete (125 patients, 62% 6-month CR); FDA CMC Pilot selected; BLA planned 2H 2026.', 'Medium'),
  ('RegenxBio Inc', 'Regulatory', 'RGX-121 CRL; RGX-202 data positive; RGX-111 hold', 'RGX-121 (MPS II) CRL Feb 2026; RGX-202 (DMD) 18mo positive, BLA filing mid-2026; RGX-111 clinical hold (CNS tumor).', 'Medium'),
  ('4D Molecular Therapeutics Inc', 'Clinical', 'Phase 3 enrollment completed ahead of schedule', '4FRONT-1 Phase 3 enrollment completed Feb 2026 (500+ patients) in wet AMD; 4FRONT-2 on track for H2 2026 completion.', 'Medium'),
  ('Bayer AG', 'Strategic', 'Pipeline narrowing; Pompe + Huntingtons dropped', 'Discontinued ACTUS-101 for Pompe; dropped Huntington program. Focus on AB-1009 (Fast Track/Orphan Drug).', 'Medium'),
  ('Moderna Inc', 'Clinical', '5-year data confirms benefit; NSCLC Phase 3 initiated', '5-year Phase 2b follow-up: 49% reduction in recurrence/death risk (HR 0.510); Phase 3 INTerpath-001 ongoing; parallel Phase 3 initiated for NSCLC.', 'Medium'),
  ('Lyell Immunopharma Inc', 'Clinical', 'Phase 3 initiated with strong Phase 2 data', 'PiNACLE Phase 3 initiated Feb 12, 2026 (first head-to-head CAR-T vs CAR-T) in R/R LBCL; ~400 patients; 3L+ data: 93% ORR, 76% CR.', 'Medium'),
  ('Aurion Biotech', 'Clinical', 'Pivotal Phase 3 initiated; Alcon backing', 'First patients dosed in pivotal ASTRA Phase 3 (April 13, 2026); Alcon acquisition completed; Japan commercialization underway.', 'Medium'),
  ('Cabaletta Bio', 'Clinical', 'Registrational cohort initiated; strong early efficacy', 'Pivotal RESET-Myositis registrational cohort initiated; all 4 eligible patients achieved moderate+ TIS improvement at week 16 off-drug; BLA 2027.', 'Medium'),
  ('Protara Therapeutics Inc', 'Regulatory / Clinical', 'BTD + Fast Track + CMC Pilot; strong Phase 2 interim', 'TARA-002 FDA BTD + Fast Track; CMC Pilot Program; Phase 2 ADVANCED-2 interim: 68.2% CR at 6 months in BCG-unresponsive NMIBC.', 'Medium'),
  ('MeiraGTx Holdings Plc', 'Regulatory / Partnership', 'BTD granted; Lilly partnership', 'FDA BTD (March 26, 2026) for radiation-induced xerostomia; 3-year Phase 1 data April 16; Eli Lilly deal ($75M upfront + $400M+ milestones) for LCA4.', 'Medium'),
  ('iECURE Inc', 'Regulatory / Clinical', 'RMAT + CMC Pilot; complete response in first patient', 'ECUR-506 (OTC) RMAT Jan 2026; CMC Pilot March 2026; complete clinical response in first infant; OTC-HOPE data 1H 2026.', 'Medium'),
  ('Laboratoires Pierre Fabre SA', 'Regulatory', 'sBLA resubmitted post-CRL', 'Tabelecleucel sBLA resubmitted March 2, 2026 following January CRL; Type A meeting requested.', 'Medium'),
  ('Adaptimmune Therapeutics Plc', 'Strategic', 'Asset sale to US WorldMeds; delisted', 'Sold TECELRA, lete-cel, afami-cel, uza-cel to US WorldMeds (closed Aug 2025); Nasdaq delisted Oct 2025; SEC deregistration underway.', 'High'),
  ('UniQure NV', 'Regulatory (negative)', 'FDA requires new randomized trial; timeline extends well beyond 24 months', 'FDA indicated (March 2, 2026 Type A meeting) Phase 1/2 data insufficient; recommended new randomized double-blind trial for AMT-130.', 'High'),
  ('Spark Therapeutics Inc', 'Strategic', 'SPK-8011 shelved; major restructuring', 'SPK-8011 (hemophilia A) shelved by Roche; $2.4B impairment; >50% staff reduction; $575M Gene Therapy Innovation Center 2026; $1B+ Dyno AI collaboration.', 'High'),
  ('Replimune Group Inc', 'Regulatory (negative)', 'Second CRL; workforce reductions; program viability uncertain', 'FDA issued second CRL for RP1 April 10, 2026. Workforce reductions and manufacturing cutbacks April 11. No clear path without new investment.', 'High'),
  ('Pfizer Inc', 'Discontinuation', 'Product discontinued; full CGT exit', 'Beqvez discontinued; Sangamo gene therapy partnership terminated. Complete CGT exit.', 'High'),
  ('Sumitomo Pharma Co Ltd', 'Regulatory (ex-US)', 'Japan approval; no U.S. path', 'Amchepry (iPSC-derived dopaminergic cells) conditional approval in Japan Feb 19, 2026 — world''s first iPSC therapy. No U.S. path.', 'High'),
  ('BioMarin Pharmaceutical Inc', 'Discontinuation', 'Product withdrawal; commercial failure', 'Roctavian withdrawal by May 2026 continues. Commercial viability concerns for high-cost gene therapy validated.', 'High'),
  ('ProQR Therapeutics', 'Strategic', 'Company exiting ophthalmology', 'Exiting ophthalmology entirely; refocusing on Axiomer RNA-editing platform for liver/CNS via Eli Lilly partnership.', 'High'),
  ('Boehringer Ingelheim', 'Discontinuation', 'Program terminated', 'Shelved inhaled lentiviral CF gene therapy (BI 3720931) after terminating Lenticlair 1 trial.', 'High')
) AS src(company_name, field_changed, new_value, why_it_matters, confidence)
JOIN cgt_companies c ON c.company_name = src.company_name
JOIN cgt_assets a ON a.company_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM cgt_change_log cl
  WHERE cl.asset_id = a.id
    AND cl.update_week = '2026-W16'
    AND cl.field_changed = src.field_changed
);
