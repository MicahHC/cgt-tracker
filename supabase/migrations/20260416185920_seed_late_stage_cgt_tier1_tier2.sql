/*
  # Seed Late Stage CGT Tier 1 & Tier 2 Companies and Assets

  Loads the master list of Late Stage cell and gene therapy companies with
  their scores, flags, filing targets, indications, modality, and notes.

  Rerun-safe: uses NOT EXISTS guards on both companies and assets.
*/

INSERT INTO cgt_companies (company_name, segment_default)
SELECT v.company_name, 'Late Stage'
FROM (VALUES
  ('Johnson & Johnson / Janssen'),('Gilead Sciences Inc'),('Legend Biotech Corp'),
  ('Bristol-Myers Squibb Co'),('Novartis AG'),('Arcellx Inc'),
  ('Ferring International Center SA'),('Vericel Corp'),('Sarepta Therapeutics Inc'),
  ('Genetix Biotherapeutics Inc'),('Krystal Biotech Inc'),('CSL Ltd'),
  ('Novartis Gene Therapies'),('Abeona Therapeutics Inc'),('Autolus Therapeutics Plc'),
  ('Immunocore Ltd'),('ImmunityBio Inc'),('Gamida Cell Ltd'),
  ('Dendreon Pharmaceuticals LLC'),('Ultragenyx Pharmaceutical Inc'),('Kyverna Therapeutics Inc'),
  ('Mesoblast Ltd'),('Intellia Therapeutics Inc'),('Candel Therapeutics Inc'),
  ('US WorldMeds LLC'),('PolarityBIO Inc'),('Neurogene Inc'),
  ('Taysha Gene Therapies Inc'),('enGene Holdings Inc'),('Capricor Therapeutics Inc'),
  ('Nanoscope Therapeutics Inc'),('RegenxBio Inc'),('Ocugen Inc'),
  ('Laboratoires Pierre Fabre SA'),('BioMarin Pharmaceutical Inc'),('CSL Behring'),
  ('Amgen Inc'),('F. Hoffmann-La Roche Ltd'),('Boehringer Ingelheim'),
  ('Janssen-Cilag Pty Ltd'),('Orchard Therapeutics Ltd'),('CG Oncology Inc'),
  ('Immatics NV'),('4D Molecular Therapeutics Inc'),('Cartesian Therapeutics Inc'),
  ('AstraZeneca Plc'),('AbbVie Inc'),('Moderna Inc'),('BlueRock Therapeutics LP'),
  ('Bayer AG'),('Gracell Biotechnologies Inc'),('Beam Therapeutics Inc'),
  ('Immatics US Inc'),('Denali Therapeutics Inc'),('Biogen'),
  ('Lyell Immunopharma Inc'),('Aurion Biotech'),('Cabaletta Bio'),
  ('Protara Therapeutics Inc'),('NS Pharma'),('Arcturus Therapeutics Holdings Inc'),
  ('MeiraGTx Holdings Plc'),('iECURE Inc'),('Tenaya Therapeutics Inc'),
  ('Beacon Therapeutics Ltd'),('Imunon Inc'),('Prokidney Corp'),
  ('Adaptimmune Therapeutics Plc'),('Astellas Gene Therapies'),('Asklepios BioPharmaceutical Inc'),
  ('BioCardia Inc'),('GenSight Biologics SA'),('iTeos Therapeutics'),
  ('Marker Therapeutics Inc'),('TScan Therapeutics Inc'),('Castle Creek Biosciences Inc'),
  ('Kolon TissueGene Inc'),('Gradalis Inc'),('Helixmith Co Ltd'),
  ('University of California Los Angeles'),('UniQure NV'),('Spark Therapeutics Inc'),
  ('BriaCell Therapeutics Corp'),('Cook MyoSite Inc'),('AiVita Biomedical Inc'),
  ('Throne Biotechnologies Inc'),('BrainStorm Cell Therapeutics Inc'),('Gameto Inc'),
  ('Replimune Group Inc'),('RHEACELL GmbH & Co KG'),('Hope Biosciences LLC'),
  ('Corestemchemon Inc'),('CellTrans Inc'),('Bioniche Life Sciences Inc'),
  ('Elios Therapeutics LLC'),('Novadip Biosciences SA'),
  ('Herbert Irving Comprehensive Cancer Center'),('Hadasit Medical Research'),
  ('Xalud Therapeutics Inc'),('RegenETP Inc'),('Grace Science LLC'),('Rarity PBC'),
  ('Biostar Stem Cell Research Institute'),('Pfizer Inc'),('Sumitomo Pharma Co Ltd'),
  ('ProQR Therapeutics')
) AS v(company_name)
WHERE NOT EXISTS (
  SELECT 1 FROM cgt_companies c WHERE lower(c.company_name) = lower(v.company_name)
);

INSERT INTO cgt_assets (
  company_id, asset_name, modality, target_indication, lead_indication,
  segment, phase_regulatory_status, filing_status, pdufa_date,
  key_upcoming_catalyst, us_commercialization_window,
  likely_us_launch_within_24_months,
  clinical_hold, no_manufacturing_pathway, timeline_over_24_months, no_us_path,
  latest_material_update,
  final_commercial_score, strategic_opportunity_score,
  commercial_priority_tier, confidence_level
)
SELECT
  c.id, v.asset_name, v.modality, v.target_indication, v.lead_indication,
  'Late Stage', v.phase, v.filing_status,
  CASE WHEN v.pdufa_date = '' THEN NULL ELSE v.pdufa_date::date END,
  v.catalyst, v.launch_win,
  CASE WHEN v.filing_status = 'Approved' OR v.filing_status ILIKE 'PDUFA%' OR v.filing_status ILIKE 'Filed%' OR v.filing_status ILIKE '%2026%' OR v.filing_status ILIKE '%2027H1%' THEN 'Yes' ELSE 'No' END,
  v.clinical_hold, v.no_mfg, v.over_24mo, v.no_us,
  v.notes, v.crs, v.opp, v.tier, 'Medium'
FROM (VALUES
  ('Johnson & Johnson / Janssen','Multiple Myeloma / Prostate / XLRP Franchise','CAR-T / Gene Therapy','Oncology / Ophthalmology','Multiple Myeloma, Prostate Cancer, X-Linked Retinitis Pigmentosa','Approved','Approved','','Approved and launched','Approved',true,false,false,false,'CARVYKTI approved; expanded to early-line MM 2025; 10,000+ patients treated; FDA T-cell malignancy safety alert active; Janssen-Cilag HIV gene therapy Phase III. [Updated 2026-04-14]',95,76,'Tier 1'),
  ('Gilead Sciences Inc','Small Cell Lung Cancer / CAR-T Expansions','Cell/Gene Therapy','Oncology','Small Cell Lung Cancer, CAR-T expansions','Approved','Approved','','Manufacturing expansion','Approved',false,false,false,false,'Manufacturing capacity quadrupling to ~24,000 units/year; FDA-approved process reducing turnaround to 14 days; Arcellx acquisition ($7.8B) adds anito-cel to pipeline. [Updated 2026-04-14]',95,76,'Tier 1'),
  ('Legend Biotech Corp','CARVYKTI (Multiple Myeloma)','CAR-T Cell Therapy','Oncology','Multiple Myeloma, Other Hematologic Malignancies','Approved','Approved','','Raritan expansion / profitability 2026','Approved',false,false,false,false,'CARVYKTI 10,000+ patients treated; Raritan facility expanded to ~10K patients/year; operating profit expected 2026. Validates scaled CAR-T commercial model. [Updated 2026-04-14]',95,76,'Tier 1'),
  ('Bristol-Myers Squibb Co','Breyanzi / Abecma CAR-T Franchise','CAR-T / Cell Therapy','Oncology / Autoimmune','Multiple Myeloma, Lupus (via Juno/Celgene assets)','Approved','Approved','','Label expansions, REMS removal','Approved',false,false,false,false,'Breyanzi + Abecma REMS removal streamlines access; Breyanzi MZL indication added; Abecma 2L myeloma approved; CAR-T franchise growing but Abecma faces Carvykti competition. [Updated 2026-04-07]',91,69,'Tier 1'),
  ('Novartis AG','Kymriah / Zolgensma Franchise','CAR-T / Gene Therapy','Oncology / Neuromuscular / Hematology','Multiple Myeloma, SMA, Sickle Cell Disease, Melanoma','Approved','Approved','','Next-gen pipeline filings','Approved',false,false,false,false,'Kymriah approved; Zolgensma approved; next-gen pipeline filings',91,69,'Tier 1'),
  ('Arcellx Inc','Anito-cel (BCMA CAR-T)','CAR-T Cell Therapy','Oncology','Multiple Myeloma','Filed','PDUFA 2026-12-23','2026-12-23','PDUFA 2026-12-23','Filed',false,false,false,false,'Gilead acquired Arcellx for $7.8B; BLA for anito-cel accepted with PDUFA Dec 23, 2026; 96% ORR in iMMagine-1; Priority Review. Would be third BCMA CAR-T. [Updated 2026-04-14]',88,82,'Tier 1'),
  ('Ferring International Center SA','Adstiladrin (NMIBC)','Cell/Gene Therapy','Urology / Oncology','Non-Muscle Invasive Bladder Cancer','Approved','Approved','','Label update / NCCN upgrade','Approved',true,false,false,false,'FDA approved accelerated thaw label update March 2026; NCCN Category 2A upgrade for papillary BCG-unresponsive NMIBC; Theralase combination partnership. [Updated 2026-04-14]',86,79,'Tier 1'),
  ('Vericel Corp','MACI / Epicel','Cell Therapy','Orthopedics / Dermatology','Cartilage Repair (Knee), Severe Burns','Approved','Approved','','Burlington facility production Q2 2026','Approved',true,false,false,false,'FDA approved new Burlington, MA manufacturing facility March 4, 2026; commercial production begins Q2 2026. Expanded capacity. [Updated 2026-04-14]',86,70,'Tier 1'),
  ('Sarepta Therapeutics Inc','Elevidys (DMD)','Gene Therapy','Neuromuscular','Duchenne MD, Limb-Girdle MD','Approved','Approved','','ENDEAVOR Cohort 8 / SRP-9001','Approved',false,false,false,false,'Elevidys approved (ambulatory DMD 4+); BOXED WARNING added for liver toxicity; non-ambulatory indication removed; ENDEAVOR Cohort 8 enrolling H2 2026; 3yr EMBARK data positive (70% decline reduction); SRP-9001 (LGMD) in development. [Updated 2026-04-14]',84,68,'Tier 1'),
  ('Genetix Biotherapeutics Inc','LYFGENIA / ZYNTEGLO','Cell/Gene Therapy','Hematology','Beta-Thalassemia, Sickle Cell Disease','Approved','Approved','','Profitability / capacity expansion','Approved',true,false,false,false,'Formerly bluebird bio (rebranded Sept 2025); LYFGENIA + ZYNTEGLO commercializing; achieved PROFITABILITY Q4 2025; full-year 2026 profitability targeted; expanding manufacturing and cryopreservation capabilities. [Updated 2026-04-14]',84,82,'Tier 1'),
  ('Krystal Biotech Inc','Vyjuvek (RDEB)','Gene Therapy','Dermatology','Recessive Dystrophic Epidermolysis Bullosa','Approved','Approved','','Home-application label / pipeline KB408/KB707','Approved',false,false,false,false,'Vyjuvek label expansion Sept 2025 for home application; strong revenue growth; KB408 (cystic fibrosis) and KB707 (TGF-beta) pipeline advancing. [Updated 2026-04-07]',83,70,'Tier 1'),
  ('CSL Ltd','HEMGENIX (Hemophilia B)','Gene Therapy (AAV)','Hematology','Hemophilia B (via CSL Behring/Uniqure)','Approved','Approved','','Supply disruption mgmt','Approved',false,false,false,false,'HEMGENIX temporary global supply disruption March 17, 2026 (manufacturing complexity, not safety); 4-5yr data: 90%+ sustained off-prophylaxis; 94% Factor IX activity. [Updated 2026-04-14]',82,73,'Tier 1'),
  ('Novartis Gene Therapies','Itvisma / Zolgensma','Gene Therapy (AAV)','Neuromuscular','Spinal Muscular Atrophy (SMA)','Approved','Approved','','Itvisma launch SMA 2+','Approved',false,false,false,false,'Itvisma approved Nov 2025 for SMA ages 2+ (intrathecal, $2.59M); expands Zolgensma franchise to older patients; next-gen SMA programs advancing. [Updated 2026-04-07]',81,65,'Tier 1'),
  ('Abeona Therapeutics Inc','ZEVASKYN (RDEB)','Gene Therapy','Dermatology','Recessive Dystrophic Epidermolysis Bullosa','Approved','Approved','','QTC expansion / payer coverage','Approved',false,false,false,false,'ZEVASKYN approved; 5th QTC activated (Columbia/NYP April 2); patient funnel doubled to 100; 80% payer coverage achieved; CMS permanent J-code. Strong commercial ramp. [Updated 2026-04-14]',80,82,'Tier 1'),
  ('Autolus Therapeutics Plc','Aucatzyl (obe-cel)','CAR-T Cell Therapy','Oncology','B-ALL, Multiple Myeloma, T-cell Lymphoma','Approved','Approved','','Commercial launch','Approved',false,false,false,false,'Aucatzyl (obe-cel) approved for adult B-ALL; first autologous CAR-T for B-ALL; commercial launch underway. [Updated 2026-04-14]',78,79,'Tier 1'),
  ('Immunocore Ltd','Kimmtrak (Melanoma)','TCR Bispecific (ImmTAC)','Oncology','Advanced Melanoma','Approved','Approved','','TCR bispecific pipeline expansion','Approved',true,false,false,false,'Kimmtrak extended approval Jan 2026 for advanced cutaneous melanoma; revenue growing; TCR bispecific pipeline (brenetafusp, IMC-F106C) advancing in multiple solid tumors. [Updated 2026-04-07]',78,72,'Tier 1'),
  ('ImmunityBio Inc','Anktiva (NMIBC)','Cell/Gene Therapy','Oncology','Bladder Cancer, Pancreatic Cancer','Approved','Approved','','sBLA additional indication','Approved',false,false,false,false,'Anktiva approved April 2024 for BCG-unresponsive NMIBC; supplemental BLA resubmitted March 2026 for additional indication; commercial ramp ongoing. [Updated 2026-04-07]',76,69,'Tier 1'),
  ('Gamida Cell Ltd','Omisirge (sAA)','Cell Therapy','Hematology','AML, Myelodysplastic Syndrome','Approved','Approved','','sAA expansion','Approved',false,false,false,false,'Omisirge approved Dec 2025 for severe aplastic anemia (sAA); expands beyond initial allo-HCT indication; commercial launch for sAA underway. [Updated 2026-04-07]',76,69,'Tier 1'),
  ('Dendreon Pharmaceuticals LLC','Provenge (Prostate)','Cell Therapy','Oncology','Prostate Cancer','Approved','Approved','','Label / commercial expansion','Approved',false,false,false,false,'Provenge approved; label/commercial expansion efforts',75,62,'Tier 1'),
  ('Ultragenyx Pharmaceutical Inc','DTX401 / UX111','Gene Therapy (AAV)','Rare Disease','Sanfilippo Syndrome (MPS IIIA), OTC Deficiency','Filed','PDUFA 2026-08-23','2026-08-23','DTX401 PDUFA 2026-08-23 / UX111 PDUFA 2026-09-19','Filed',false,false,false,false,'DTX401 BLA accepted with PDUFA Aug 23, 2026 (Priority Review) for GSD Ia; UX111 BLA resubmission accepted with PDUFA Sep 19, 2026 for Sanfilippo. Two gene therapies in late-stage pipeline. [Updated 2026-04-14]',74,75,'Tier 1'),
  ('Kyverna Therapeutics Inc','KYV-101 (miv-cel)','CAR-T Cell Therapy','Autoimmune','Lupus Nephritis, Myasthenia Gravis','Phase 3','Launch 2026H2-2027H1','','SPS BLA H1 2026 / KYSA-6','2026H2-2027H1',false,false,false,false,'KYV-101 (miv-cel): SPS BLA filing targeted H1 2026 (remarkable efficacy); MG Phase 3 KYSA-6 initiated Dec 2025; Lupus Phase 1 planned; FDA SPA for SPS. First autoimmune CAR-T BLA expected. [Updated 2026-04-14]',72,89,'Tier 1'),
  ('Mesoblast Ltd','Ryoncil / CHF Program','Stem Cell Therapy','Cardiology / GvHD','Acute GvHD, Heart Failure','Approved','Approved','','Heart failure Phase III','Approved',true,false,false,false,'Ryoncil approved (pediatric GvHD); heart failure Phase III',68,68,'Tier 1'),
  ('Intellia Therapeutics Inc','Lonvo-z / Nex-z','Gene Editing','Rare Disease','Hereditary Angioedema','Phase 3','Launch 2027H1-2027H2','','HAELO Phase 3 topline H1 2026','2027H1-2027H2',false,false,false,false,'HAELO Phase 3 topline expected H1 2026; BLA submission H2 2026; nex-z ATTR clinical holds fully lifted March 2026; MAGNITUDE enrollment resuming. [Updated 2026-04-14]',66,76,'Tier 1'),
  ('Candel Therapeutics Inc','CAN-2409 (Prostate)','Oncolytic Virus','Oncology','Prostate Cancer, Pancreatic Cancer','Phase 3','Launch 2027H2','','BLA Q4 2026','2027H2',false,false,false,false,'Phase 3 primary endpoint achieved in prostate cancer (improved DFS); BLA submission planned Q4 2026; $100M RTW funding conditional on approval. [Updated 2026-04-14]',64,77,'Tier 1'),
  ('US WorldMeds LLC','Letetresgene Autoleucel','CAR-T Cell Therapy','Oncology','Acute Lymphoblastic Leukemia','Phase 3','Launch 2026','','2026 launch','2026',false,false,false,false,'GlobalData new add; letetresgene autoleucel launch 2026',64,65,'Tier 1'),
  ('PolarityBIO Inc','RDEB Cell Therapy','Cell Therapy','Dermatology / Wound Care','Dystrophic Epidermolysis Bullosa (RDEB)','Phase 3','Launch 2027H1','','BLA April 2026','2027H1',false,false,false,false,'Phase 3 COVER DFUS II completed Dec 2025; FDA Breakthrough Therapy designation; BLA planned April 2026. [Updated 2026-04-14]',64,77,'Tier 1'),
  ('Neurogene Inc','NGN-401 (Rett)','Gene Therapy (AAV)','CNS / Rare Disease','Neuronal Ceroid Lipofuscinosis CLN5, Rett Syndrome','Phase 3','Launch 2027H2-2028H1','','Embolden dosing Q2 2026','2027H2-2028H1',false,false,false,false,'Embolden registrational trial 100% enrolled, 50%+ dosed for Rett syndrome; FDA Breakthrough Therapy designation awarded; dosing completion expected Q2 2026; FDA alignment on 3-month safety data for broad label (ages 2+). [Updated 2026-04-14]',60,80,'Tier 1'),
  ('Taysha Gene Therapies Inc','TSHA-102 (Rett)','Gene Therapy (AAV)','CNS','Rett Syndrome','Phase 3','Launch 2028H1','','REVEAL/ASPIRE pivotal','2028H1',false,false,false,false,'REVEAL/ASPIRE pivotal trials advancing for Rett syndrome; dosing expected complete Q2 2026; FDA alignment on 3-month safety data for broad label (ages 2+). [Updated 2026-04-14]',60,80,'Tier 1'),
  ('enGene Holdings Inc','Detalimogene (NMIBC)','Gene Therapy','Oncology / Urology','Bladder Cancer (NMIBC)','Phase 3','Launch 2027H2','','BLA 2H 2026','2027H2',false,false,false,false,'Renamed to enGene Therapeutics (April 7-8, 2026); LEGEND pivotal enrollment complete (125 patients, 62% 6-month CR); FDA CMC Pilot selected; BLA planned 2H 2026. [Updated 2026-04-14]',60,73,'Tier 1'),
  ('Capricor Therapeutics Inc','Deramiocel (DMD)','Cell Therapy','Neuromuscular','Duchenne Muscular Dystrophy','Filed','PDUFA 2026-08-22','2026-08-22','PDUFA 2026-08-22','Filed',true,false,false,false,'BLA resubmission under FDA review; PDUFA August 22, 2026; addressing prior CRL concerns. [Updated 2026-04-14]',57,70,'Tier 1'),
  ('Nanoscope Therapeutics Inc','MCO-010 (RP)','Gene Therapy (Optogenetics)','Ophthalmology','Retinitis Pigmentosa, Age-Related Macular Degeneration','Filed','Filed','','Rolling BLA completion early 2026','Filed',false,false,false,false,'Rolling BLA completion targeted early 2026 for retinitis pigmentosa. [Updated 2026-04-14]',54,70,'Tier 1'),
  ('RegenxBio Inc','RGX-121 / RGX-202 / ABBV-RGX-314','Gene Therapy (AAV)','Rare Disease / Ophthalmology','Mucopolysaccharidosis I & II, Duchenne MD','Phase 3','CRL / Pending','','RGX-202 BLA mid-2026','Mixed',true,false,false,false,'RGX-121 (MPS II): CRL issued Feb 2026; Type A meeting planned. RGX-202 (DMD): positive 18mo data, BLA filing targeted mid-2026. RGX-111 (MPS I): clinical hold (CNS tumor). ABBV-RGX-314 (AMD): Phase 3 data expected 2026. [Updated 2026-04-14]',52,59,'Tier 1'),
  ('Ocugen Inc','OCU400 (RP)','Gene Therapy','Ophthalmology','Retinitis Pigmentosa, Leber Congenital Amaurosis','Phase 3','Launch 2027H2','','Rolling BLA Q3 2026','2027H2',false,false,false,false,'Phase 3 enrolled; rolling BLA Q3 2026; RMAT designation. [Updated 2026-04-14]',50,66,'Tier 1'),
  ('Laboratoires Pierre Fabre SA','Melanoma sBLA Program','Cell/Gene Therapy','Oncology','Melanoma, Solid Tumors','Filed','Filed','','Type A meeting','Filed',false,false,false,false,'sBLA resubmitted March 2, 2026 following January CRL; Type A meeting requested. [Updated 2026-04-14]',46,53,'Tier 1'),
  ('BioMarin Pharmaceutical Inc','Roctavian (Hemophilia A)','Gene Therapy (AAV)','Rare Disease / Hematology','Phenylketonuria, Hemophilia A','Approved','Approved','','Withdrawal by May 2026','Approved',false,false,false,true,'Roctavian withdrawal by May 2026 continues. Commercial viability concerns for high-cost gene therapy validated. [Updated 2026-04-14]',0,42,'Tier 1'),
  ('CSL Behring','Hemgenix (Hemophilia B)','Gene Therapy (AAV)','Hematology','Hemophilia B','Approved','Approved','','Phase III extension','Approved',false,false,false,false,'Hemgenix (etranacogene dezaparvovec) Phase III extension',86,73,'Tier 2'),
  ('Amgen Inc','KRAS G12C / CGT Investments','Cell/Gene Therapy','Oncology','NSCLC, Prostate Cancer (KRAS G12C)','Phase 3','','','KRAS programs','',false,false,false,false,'KRAS programs + emerging CGT investments',81,62,'Tier 2'),
  ('F. Hoffmann-La Roche Ltd','Spark Therapeutics CGT Pipeline','Gene Therapy (AAV)','Ophthalmology / CNS','Retinal Diseases, Neurological Conditions','Phase 3','','','Spark subsidiary','',false,false,false,false,'Roche CGT investments; Spark Therapeutics subsidiary',77,58,'Tier 2'),
  ('Boehringer Ingelheim','BI 3720931 (discontinued)','Cell/Gene Therapy','Rare Disease / Oncology','Focal Segmental Glomerulosclerosis, NSCLC','Phase 3','','','Lenticlair 1 discontinued','',true,false,false,false,'Shelved inhaled lentiviral CF gene therapy (BI 3720931) after terminating Lenticlair 1 trial. [Updated 2026-04-14]',72,89,'Tier 2'),
  ('Janssen-Cilag Pty Ltd','HIV Gene Therapy','Gene Therapy','Infectious Disease','HIV-1','Phase 3','','','Phase III HIV','',true,false,false,false,'HIV gene therapy Phase III; J&J affiliate',66,57,'Tier 2'),
  ('Orchard Therapeutics Ltd','Libmeldy / Hurler Program','Gene Therapy (Lentiviral)','Rare Disease','MPS-IH (Hurler Syndrome)','Phase 3','','','Kyowa Kirin ownership','',false,false,false,false,'Acquired by Kyowa Kirin; late-stage rare disease portfolio',56,63,'Tier 2'),
  ('CG Oncology Inc','Cretostimogene (NMIBC)','Oncolytic Virus','Oncology','Non-Muscle Invasive Bladder Cancer','Phase 3','','','PIVOT-006 topline H1 2026','',true,false,false,false,'PIVOT-006 Phase 3 topline data expected H1 2026 (imminent); enrollment completed ahead of schedule with 360+ patients. [Updated 2026-04-14]',56,66,'Tier 2'),
  ('Immatics NV','IMA203 / SUPRAME','TCR-T Cell Therapy','Oncology','Advanced Solid Tumors','Phase 3','Early 2027','','SUPRAME interim 2026','Early 2027',false,false,true,false,'SUPRAME Phase 3 interim and final analyses expected 2026; $551.4M cash extending runway to 2028. [Updated 2026-04-14]',50,66,'Tier 2'),
  ('4D Molecular Therapeutics Inc','4D-150 (wAMD) / 4D-310','Gene Therapy (AAV)','Ophthalmology / Rare Disease','Diabetic Macular Edema, nAMD, Fabry Disease, Choroideremia','Phase 3','','','4FRONT-1 / 4FRONT-2','',false,false,true,false,'4FRONT-1 Phase 3 enrollment completed Feb 2026 (ahead of schedule, 500+ patients) in wet AMD; 4FRONT-2 on track for H2 2026 completion. [Updated 2026-04-14]',50,63,'Tier 2'),
  ('Cartesian Therapeutics Inc','Descartes-08 (MG/SLE)','CAR-T Cell Therapy','Autoimmune','Myasthenia Gravis, Systemic Lupus Erythematosus','Phase 3','','','RNA CAR-T Phase III','',true,false,false,false,'RNA-based CAR-T; Phase III autoimmune programs',50,63,'Tier 2'),
  ('AstraZeneca Plc','CGT Portfolio','Cell/Gene Therapy','Oncology / Rare Disease','NSCLC, APOL1-Mediated Kidney Disease, H&N SCC','Phase 3','','','Major oncology + rare','',false,false,true,false,'Major oncology programs + rare disease gene therapy',50,54,'Tier 2'),
  ('AbbVie Inc','Allergan Gene Therapy (Ocular)','Gene Therapy (AAV)','Ophthalmology','Neovascular AMD, Diabetic Retinopathy, DME','Phase 3','','','Ocular gene therapy','',false,false,true,false,'Phase III ocular gene therapy via Allergan/acquisition pipeline',50,54,'Tier 2'),
  ('Moderna Inc','mRNA-4157 (INTerpath)','mRNA/Gene Therapy','Oncology / Rare Disease','Personalized Cancer Vaccines, Rare Disease mRNA','Phase 3','','','INTerpath-001 / NSCLC combo','',false,false,true,false,'5-year Phase 2b follow-up shows 49% reduction in recurrence/death risk (HR 0.510); Phase 3 INTerpath-001 ongoing; parallel Phase 3 initiated for NSCLC combination. [Updated 2026-04-14]',50,63,'Tier 2'),
  ('BlueRock Therapeutics LP','DA01 (Parkinson''s)','Cell Therapy (iPSC)','CNS','Parkinson''s Disease','Phase 3','','','DA01 Phase II/III','',false,false,true,false,'Bayer subsidiary; DA01 Phase II/III for Parkinson''s',50,65,'Tier 2'),
  ('Bayer AG','AB-1009 / CGT Platform','Cell/Gene Therapy','Rare Disease / CGT Platform','Various (via BlueRock, AskBio investments)','Phase 3','','','AB-1009 Fast Track','',false,false,true,false,'Discontinued ACTUS-101 for Pompe disease; dropped Huntingtons program. Focusing on AB-1009 (Fast Track/Orphan Drug). [Updated 2026-04-14]',50,46,'Tier 2'),
  ('Gracell Biotechnologies Inc','FasTCAR Platform','CAR-T Cell Therapy','Oncology / Autoimmune','Multiple Myeloma, ALL, Autoimmune Diseases','Phase 3','','','AstraZeneca-owned','',false,false,true,false,'Acquired by AstraZeneca; fast-in-vivo CAR-T platform',50,63,'Tier 2'),
  ('Beam Therapeutics Inc','BEAM-101 / BEAM-302','Base Editing','Hematology / Rare Disease','Sickle Cell Disease, Beta-Thalassemia, Alpha-1 Antitrypsin Deficiency','Phase 3','','','Base editing pipeline','',false,false,true,false,'In-vivo base editing; multiple IND-stage programs advancing to Phase III',50,68,'Tier 2'),
  ('Immatics US Inc','WTX-124 / ACTengine','TCR-T Cell Therapy','Oncology','Advanced Solid Tumors','Phase 3','Early 2027','','Phase III solid tumors','Early 2027',false,false,true,false,'Phase III high-score; Immatics WTX-124 and ACTengine platforms',50,66,'Tier 2'),
  ('Denali Therapeutics Inc','DNL310 (Hunter)','Cell/Gene Therapy','Rare Disease / CNS','Mucopolysaccharidosis II','Phase 3','','','ETV platform','',false,false,true,false,'Phase III for Hunter Syndrome; ETV platform for CNS delivery',50,62,'Tier 2'),
  ('Biogen','NightstaRx Ophthalmology Pipeline','Cell/Gene Therapy','Ophthalmology / Oncology','X-Linked RP, Choroideremia, Colorectal','Phase 3','','','Ophthalmology focus','',false,false,true,false,'NightstaRx/Biogen gene therapy programs; ophthalmology focus',50,57,'Tier 2'),
  ('Lyell Immunopharma Inc','Ronde-cel (R/R LBCL)','CAR-T Cell Therapy','Oncology','Relapsed/Refractory Non-Hodgkin Lymphoma','Phase 3','Launch 2028H2','','PiNACLE Phase 3','2028H2',false,false,true,false,'PiNACLE Phase 3 initiated Feb 12, 2026 -- first head-to-head CAR-T vs CAR-T trial (ronde-cel vs liso-cel/axi-cel) in R/R LBCL; ~400 patients; 3L+ data: 93% ORR, 76% CR. [Updated 2026-04-14]',50,63,'Tier 2'),
  ('Aurion Biotech','AURN001 (Corneal Edema)','Cell/Gene Therapy','Ophthalmology','Corneal Edema, Fuchs Endothelial Dystrophy','Phase 3','','','ASTRA Phase 3 dosing','',false,false,true,false,'First patients dosed in pivotal ASTRA Phase 3 (April 13, 2026); Alcon acquisition completed; Japan commercialization underway. [Updated 2026-04-14]',50,63,'Tier 2'),
  ('Cabaletta Bio','Rese-cel (Myositis)','CAR-T Cell Therapy','Autoimmune','Inflammatory Myopathy, Dermatomyositis','Phase 3','Launch 2028','','RESET-Myositis','2028',false,false,true,false,'Pivotal RESET-Myositis registrational cohort initiated; all 4 eligible patients achieved moderate+ TIS improvement at week 16 off-drug; BLA submission targeted 2027. [Updated 2026-04-14]',50,75,'Tier 2'),
  ('Protara Therapeutics Inc','TARA-002 (NMIBC)','Gene Therapy','Rare Disease','Lymphatic Malformations','Phase 3','','','ADVANCED-2 interim','',false,false,true,false,'FDA Breakthrough Therapy + Fast Track designations; CMC Pilot Program selected; Phase 2 ADVANCED-2 interim: 68.2% complete response at 6 months in BCG-unresponsive NMIBC. [Updated 2026-04-14]',50,69,'Tier 2'),
  ('NS Pharma','Viltolarsen (Viltepso)','Gene Therapy','Neuromuscular','Duchenne Muscular Dystrophy','Approved','Approved','','Exon-skipping','Approved',false,false,true,false,'Viltolarsen (Viltepso) approved; exon-skipping franchise',49,56,'Tier 2'),
  ('Arcturus Therapeutics Holdings Inc','ARCT-810 (OTC)','mRNA/Gene Therapy','Rare Disease / mRNA','OTC Deficiency','Phase 3','Launch 2027','','2027 launch','2027',false,false,true,false,'GlobalData new add; ARCT-810 mRNA therapy for OTC deficiency; launch 2027',49,59,'Tier 2'),
  ('MeiraGTx Holdings Plc','LCA4 / Xerostomia','Gene Therapy (AAV)','Ophthalmology','Inherited Retinal Diseases','Phase 3','','','Eli Lilly LCA4 deal','',false,false,true,false,'FDA Breakthrough Therapy designation (March 26, 2026) for radiation-induced xerostomia; 3-year Phase 1 data presentation April 16; Eli Lilly deal ($75M upfront + $400M+ milestones) for LCA4. [Updated 2026-04-14]',49,59,'Tier 2'),
  ('iECURE Inc','ECUR-506 (OTC)','Gene Therapy (AAV)','Rare Disease / Gene Therapy','Metabolic Liver Diseases','Phase 3','','','OTC-HOPE trial','',false,false,true,false,'ECUR-506 (OTC deficiency): FDA RMAT designation Jan 2026; CMC Pilot Program March 2026; complete clinical response in first infant treated; OTC-HOPE trial data expected 1H 2026. [Updated 2026-04-14]',48,72,'Tier 2'),
  ('Tenaya Therapeutics Inc','TN-201 (Cardiomyopathy)','Gene Therapy (AAV)','Cardiology','Cardiomyopathy','Phase 3','Launch 2027','','2027 launch','2027',false,false,true,false,'GlobalData new add; TN-201 for genetic cardiomyopathy; launch 2027',48,65,'Tier 2'),
  ('Beacon Therapeutics Ltd','Laruparetigene Zovaparvovec (XLRP / AMD)','Gene Therapy (AAV)','Ophthalmology','X-Linked Retinitis Pigmentosa, Achromatopsia, Age-Related Macular Degeneration','Phase 3','Launch 2026','','XLRP Phase III / AMD 10/2026','2026',false,false,true,false,'Phase III for XLRP; strong unmet need. laruparetigene zovaparvovec for AMD; launch 10/2026',46,62,'Tier 2'),
  ('Imunon Inc','IMNN-001 (Ovarian)','Gene Therapy','Oncology','Ovarian Cancer','Phase 3','','','Platinum-sensitive ovarian','',false,false,true,false,'IMNN-001 Phase III for platinum-sensitive ovarian cancer',46,59,'Tier 2'),
  ('Prokidney Corp','REACT (CKD)','Cell Therapy','Nephrology','Chronic Kidney Disease','Phase 3','','','REACT Phase III','',false,false,true,false,'REACT Phase III; autologous renal cell therapy',46,62,'Tier 2'),
  ('Adaptimmune Therapeutics Plc','TECELRA / afami-cel / lete-cel (divested)','TCR-T Cell Therapy','Oncology','Solid Tumors (Soft Tissue Sarcoma, Synovial Sarcoma)','Approved','Approved','','Divested to US WorldMeds','Approved',false,false,false,false,'Sold TECELRA, lete-cel, afami-cel, uza-cel to US WorldMeds (closed Aug 2025); Nasdaq delisted Oct 2025; SEC deregistration underway. US WorldMeds now owns TECELRA franchise. [Updated 2026-04-14]',45,46,'Tier 2'),
  ('Astellas Gene Therapies','AT132 / Pompe Program','Gene Therapy (AAV)','Rare Disease / Neuromuscular','X-Linked Myotubular Myopathy, Pompe Disease','Phase 3','','','MTM1 holds / Pompe','',false,false,true,false,'Program risks: MTM1 trial holds; Pompe advancing',45,49,'Tier 2'),
  ('Asklepios BioPharmaceutical Inc','AAV9 Platform Programs','Gene Therapy (AAV)','Neuromuscular / CNS','XLMTM, GM1 Gangliosidosis','Phase 3','','','AAV9 rare disease','',false,false,true,false,'Broad AAV9 platform; multiple rare disease programs',45,55,'Tier 2'),
  ('BioCardia Inc','CardiAMP (HFrEF)','Cell Therapy','Cardiology','Heart Failure, AMI','Phase 3','','','CardiAMP Phase III','',false,false,true,false,'CardiAMP Phase III for heart failure with reduced EF',43,56,'Tier 2'),
  ('GenSight Biologics SA','Lumevoq (LHON)','Gene Therapy (AAV)','Ophthalmology','Leber Hereditary Optic Neuropathy','Phase 3','','','Lumevoq EU/US','',false,false,true,false,'Lumevoq Phase III; pending EU/US approval decisions',42,55,'Tier 2'),
  ('iTeos Therapeutics','NSCLC Program','Cell/Gene Therapy','Oncology','Metastatic / Locally Advanced NSCLC','Phase 3','','','NSCLC Phase III','',false,false,true,false,'strong trial data confidence',42,52,'Tier 2'),
  ('Marker Therapeutics Inc','Neldaleucel','Cell Therapy','Oncology','AML, DLBCL, Solid Tumors','Phase 3','Launch 2027','','2027 launch','2027',false,false,true,false,'GlobalData new add; neldaleucel T-cell therapy; launch 2027',42,55,'Tier 2'),
  ('TScan Therapeutics Inc','TSC-100','Cell Therapy (TCR-T)','Oncology','Solid Tumors (Soft Tissue Sarcoma)','Phase 3','Launch 2027','','2027 launch','2027',false,false,true,false,'GlobalData new add; TSC-100 T-cell therapy for solid tumors; launch 2027',42,55,'Tier 2'),
  ('Castle Creek Biosciences Inc','Dabocemagene Autoficel (RDEB/EB)','Gene Therapy','Dermatology','Dystrophic Epidermolysis Bullosa (RDEB), Epidermolysis Bullosa','Phase 3','Launch 2027','','2027 launch','2027',false,false,true,false,'Phase III for rare skin disorder; high unmet need. Launch 06/2027.',39,49,'Tier 2'),
  ('Kolon TissueGene Inc','Invossa (Knee OA)','Cell/Gene Therapy','Orthopedics','Osteoarthritis (Knee)','Phase 3','','','US Phase III','',false,false,true,false,'Invossa approved in Korea; US Phase III ongoing',39,49,'Tier 2'),
  ('Gradalis Inc','Vigil (Ovarian)','Gene Therapy','Oncology','Ovarian Cancer (FANG Immunotherapy)','Phase 3','','','Vigil Phase III','',false,false,true,false,'Vigil (gemogenovatucel-T) Phase III; BRCA-associated ovarian cancer',39,52,'Tier 2'),
  ('Helixmith Co Ltd','VM202 (PDN/CLI)','Gene Therapy','Neurology / Vascular','Painful Diabetic Neuropathy, Critical Limb Ischemia','Phase 3','','','VM202 Phase III','',false,false,true,false,'VM202 Phase III; Korean biotech; diabetic neuropathy',39,49,'Tier 2'),
  ('University of California Los Angeles','Academic CGT Programs','Gene Therapy','Rare Disease / HIV','Various Gene Therapy Indications','Phase 3','','','CIRM-funded trials','',false,false,true,false,'Academic spinout programs; CIRM-funded CGT trials',38,55,'Tier 2'),
  ('UniQure NV','AMT-130 (Huntington''s)','Gene Therapy (AAV)','CNS / Neurology','Huntington''s Disease','Phase 3','Launch 2029+','','Randomized trial required','2029+',false,false,true,false,'FDA indicated (March 2, 2026 Type A meeting) Phase 1/2 data insufficient; recommended new randomized double-blind trial with potential sham-surgery control. Significantly delays U.S. path. [Updated 2026-04-14]',38,56,'Tier 2'),
  ('Spark Therapeutics Inc','Pompe / LHON Programs','Gene Therapy (AAV)','Rare Disease','Pompe Disease (Late-onset), LHON','Phase 3','','','Dyno AI collaboration','',false,false,true,false,'SPK-8011 (hemophilia A) SHELVED by Roche; $2.4B impairment; major staff reduction (>50%); $575M Gene Therapy Innovation Center opening 2026; new $1B+ Dyno AI-vector collaboration for neuro. [Updated 2026-04-14]',37,44,'Tier 2'),
  ('BriaCell Therapeutics Corp','Bria-IMT (Breast)','Gene Therapy','Oncology','Metastatic Breast Cancer','Phase 3','','','Phase III','',false,false,true,false,'Phase III',36,49,'Tier 2'),
  ('Cook MyoSite Inc','Myoblast (SUI)','Cell Therapy','Urology','Stress Urinary Incontinence','Phase 3','','','Phase III','',false,false,true,false,'Phase III myoblast therapy; niche indication',36,46,'Tier 2'),
  ('AiVita Biomedical Inc','DC Vaccine Programs','Cell Therapy (DC)','Oncology','Glioblastoma, Ovarian Cancer','Phase 3','','','Dendritic cell vaccine','',false,false,true,false,'Dendritic cell vaccine Phase III programs',36,49,'Tier 2'),
  ('Throne Biotechnologies Inc','Stem Cell T1D','Stem Cell Therapy','Endocrinology','Type 1 Diabetes','Phase 3','','','T1D stem cell','',false,false,true,false,'Phase III stem cell therapy for T1D',32,48,'Tier 2'),
  ('BrainStorm Cell Therapeutics Inc','NurOwn (ALS)','Stem Cell Therapy','CNS / Neuromuscular','ALS','Phase 3','','','Complex FDA history','',false,false,true,false,'NurOwn Phase III ALS — mixed results; FDA review history complex',32,45,'Tier 2'),
  ('Gameto Inc','Fertilo (iPSC)','Cell Therapy','Women''s Health','Fertility / Ovarian Function','Phase 3','','','Fertility Phase III','',false,false,true,false,'iPSC-derived ovarian support cells; Phase III fertility application',32,48,'Tier 2'),
  ('Replimune Group Inc','RP1 (vusolimogene)','Oncolytic Virus','Oncology','Melanoma, Head & Neck Cancer, Liver Cancer','CRL','Launch Unknown','','Second CRL; workforce reductions','Unknown',false,true,true,false,'FDA issued second CRL for RP1 (vusolimogene oderparepvec) April 10, 2026. Replimune announced workforce reductions and manufacturing cutbacks April 11. No clear path to approval without significant new investment. [Updated 2026-04-14]',30,44,'Tier 2'),
  ('RHEACELL GmbH & Co KG','VLU Cell Therapy','Cell/Gene Therapy','Dermatology','Venous Leg Ulcer','Phase 3','','','Phase III EU','',false,false,true,false,'Phase III European cell therapy company',29,42,'Tier 2'),
  ('Hope Biosciences LLC','MSC Platform','Stem Cell Therapy','Various','COVID-19, ALS, Frailty','Phase 3','','','MSC Phase III','',false,false,true,false,'Mesenchymal stem cell platform; Phase III programs',29,42,'Tier 2'),
  ('Corestemchemon Inc','Neuronata-R (ALS)','Stem Cell Therapy','CNS / Neuromuscular','ALS','Phase 3','','','Global Phase III','',false,false,true,false,'Neuronata-R approved in Korea; global Phase III pursuing',29,39,'Tier 2'),
  ('CellTrans Inc','Lantidra (T1D Islet)','Cell Therapy','Endocrinology','Type 1 Diabetes (Islet Transplant)','Approved','Approved','','T1D islet allotx','Approved',false,false,true,false,'Lantidra approved (T1D islet allotransplantation)',29,42,'Tier 2'),
  ('Bioniche Life Sciences Inc','BCG-based Bladder Therapy','Cell/Gene Therapy','Oncology','Bladder Neoplasms','Phase 3','','','Phase III','',false,false,true,false,'BCG-based bladder cancer therapy',29,39,'Tier 2'),
  ('Elios Therapeutics LLC','TLPO Vaccine','Cell Therapy (Vaccine)','Oncology','Melanoma','Phase 3','Launch 2027','','02/2027 launch','2027',false,false,true,false,'GlobalData new add; TLPO vaccine for melanoma; launch 02/2027',29,42,'Tier 2'),
  ('Novadip Biosciences SA','NVD-003','Cell Therapy','Orthopedics / Regenerative','Bone Defects','Phase 3','Launch 2028','','03/2028 launch','2028',false,false,true,false,'GlobalData new add; NVD-003 cell therapy for bone regeneration; launch 03/2028',29,42,'Tier 2'),
  ('Herbert Irving Comprehensive Cancer Center','Columbia Academic Programs','Stem Cell Therapy','Oncology / Hematology','Leukemia, Brain Tumors, Head & Neck Cancer, Lymphoma','Phase 3','Launch 2025','','2025 target','2025',false,false,true,false,'Academic Tier 1; Columbia University; 2025 filing target',28,45,'Tier 2'),
  ('Hadasit Medical Research','Evarucabgene Autoleucel','CAR-T Cell Therapy','Oncology / Autoimmune','Hematologic Malignancies','Phase 3','Launch 2027','','06/2027 launch','2027',false,false,true,false,'GlobalData new add; Hadassah academic center; evarucabgene autoleucel launch 06/2027',28,48,'Tier 2'),
  ('Xalud Therapeutics Inc','IT-140 (OA Pain)','Gene Therapy','Inflammation / Orthopedics','Osteoarthritis','Phase 3','','','OA pain Phase III','',false,false,true,false,'IT-140 Phase III for osteoarthritis pain',24,44,'Tier 2'),
  ('RegenETP Inc','Regenerative Platform','Cell/Gene Therapy','Rare Disease','Various','Phase 3','','','Emerging platform','',false,true,true,false,'Emerging regenerative medicine platform',22,38,'Tier 2'),
  ('Grace Science LLC','NGLY1 Gene Therapy','Gene Therapy','Rare Disease / CNS','NGLY1 Deficiency','Phase 3','','','Compassionate use','',false,true,true,false,'Ultra-rare disease; compassionate use / early Phase III',22,41,'Tier 2'),
  ('Rarity PBC','Simolodagene Autotemcel','Gene Therapy','Rare Disease','Genetic Disorders','Phase 3','Launch 2028','','01/2028 launch','2028',false,true,true,false,'GlobalData new add; simolodagene autotemcel for rare disease; launch 01/2028',22,38,'Tier 2'),
  ('Biostar Stem Cell Research Institute','Stem Cell Programs','Stem Cell Therapy','Orthopedics / Rare Disease','Various Stem Cell Indications','Phase 3','','','Korean programs','',false,true,true,false,'Korean academic/commercial stem cell programs',19,32,'Tier 2'),
  ('Pfizer Inc','Beqvez (discontinued)','Gene Therapy (AAV)','Hematology / Oncology','Hemophilia A, Hemophilia B, Colorectal, Pancreatic, NSCLC','Discontinued','Discontinued','','CGT exit','Discontinued',false,true,true,true,'Beqvez discontinued; Sangamo gene therapy partnership terminated. Complete CGT exit signals continued pharma retreat from traditional AAV gene therapy. [Updated 2026-04-14]',0,18,'Tier 2'),
  ('Sumitomo Pharma Co Ltd','Amchepry (iPSC Parkinson''s)','Cell Therapy','CNS / Oncology','Parkinson''s Disease, Leukemia','Approved (Japan)','Approved Japan','','Japan conditional approval','Japan',false,false,true,true,'Amchepry (iPSC-derived dopaminergic cells) received conditional approval in Japan Feb 19, 2026 -- world''s first iPSC therapy. No U.S. path currently. [Updated 2026-04-14]',0,56,'Tier 2'),
  ('ProQR Therapeutics','Axiomer RNA Platform','RNA Therapy','Ophthalmology','Leber Congenital Amaurosis 10 (CEP290)','Discontinued','Discontinued','','Exit ophthalmology','Discontinued',false,true,true,true,'Exiting ophthalmology entirely; refocusing on Axiomer RNA-editing platform for liver/CNS via Eli Lilly partnership. [Updated 2026-04-14]',0,12,'Tier 2')
) AS v(
  company_name, asset_name, modality, target_indication, lead_indication,
  phase, filing_status, pdufa_date, catalyst, launch_win,
  clinical_hold, no_mfg, over_24mo, no_us,
  notes, crs, opp, tier
)
JOIN cgt_companies c ON lower(c.company_name) = lower(v.company_name)
WHERE NOT EXISTS (
  SELECT 1 FROM cgt_assets a
  WHERE a.company_id = c.id AND a.asset_name = v.asset_name
);

INSERT INTO cgt_score_history (
  asset_id, week_label, final_commercial_score, strategic_opportunity_score,
  commercial_priority_tier
)
SELECT
  a.id, to_char(now(), 'IYYY-"W"IW'),
  a.final_commercial_score, a.strategic_opportunity_score,
  a.commercial_priority_tier
FROM cgt_assets a
WHERE NOT EXISTS (
  SELECT 1 FROM cgt_score_history h WHERE h.asset_id = a.id
);
