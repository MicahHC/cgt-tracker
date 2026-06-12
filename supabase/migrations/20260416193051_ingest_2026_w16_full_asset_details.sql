/*
  # Ingest 2026-W16 full asset detail fields

  1. Updates
    - Populates modality, target/lead indication, phase/regulatory status,
      filing status, FDA designations, US launch window, manufacturing status,
      manufacturing pathway, manufacturing notes, commercial buildout status,
      commercial readiness signals, treatment network status, and
      regulatory/clinical risk notes for every late-stage / on-market asset
      row in the CGT Phase 3 tracker CSV.
    - Values are lifted verbatim from the CSV; empty CSV cells leave
      existing values untouched.
  2. Notes
    - No destructive operations.
    - Keys off company_name (1 asset per tracked company in this schema).
*/

WITH d(company_name, modality, target_indication, lead_indication, phase_regulatory_status, filing_status, fda_designations, likely_us_launch, us_window, mfg_status, mfg_pathway, mfg_notes, comm_buildout, comm_signals, treatment_network, reg_risk_notes) AS (
  VALUES
    ('Johnson & Johnson / Janssen','CAR-T Cell Therapy','Multiple Myeloma, Prostate Cancer, X-Linked RP','Multiple Myeloma','Approved (MM); Phase III (other)','Approved','','Yes','','Established','Yes','','Established','','Established',''),
    ('Gilead Sciences Inc','CAR-T Cell Therapy','LBCL, Follicular Lymphoma','Large B-Cell Lymphoma','Approved; expanding indications','Approved','','Yes','','Established','Yes','','Established','','Established',''),
    ('Legend Biotech Corp','CAR-T Cell Therapy','Multiple Myeloma','Multiple Myeloma','Approved','Approved','','Yes','','Established','Yes','','Established','','Established',''),
    ('Arcellx Inc','CAR-T Cell Therapy','Relapsed/Refractory Multiple Myeloma','Multiple Myeloma','BLA accepted (Priority Review)','Accepted','Priority Review; Orphan Drug; BTD','Yes','2027H1','Scaling','Yes','Leveraging Gilead/Kite manufacturing infrastructure','Scaling','Gilead commercial infrastructure; Yescarta manufacturing scale','',''),
    ('Ferring International Center SA','Gene Therapy (Adenoviral)','BCG-Unresponsive NMIBC','Non-Muscle Invasive Bladder Cancer','Approved','Approved','','Yes','','Established','Yes','','Established','','',''),
    ('Vericel Corp','Cell Therapy (Autologous Chondrocytes)','Cartilage Repair','Knee Cartilage Defects','Approved','Approved','','Yes','','Established','Yes','','Established','','',''),
    ('Sarepta Therapeutics Inc','Gene Therapy (AAV)','Duchenne MD, Limb-Girdle MD','Duchenne MD','Approved (ambulatory DMD); Phase 3 Cohort 8 (non-amb)','Approved','RMAT; Priority Review','Yes','','Established','Yes','','Established','','','BOXED WARNING for acute liver injury/failure; non-ambulatory indication REMOVED after fatal cases; ENDEAVOR Cohort 8 with sirolimus immunosuppression'),
    ('Genetix Biotherapeutics Inc','Gene Therapy (Lentiviral)','Sickle Cell Disease, Beta-Thalassemia','Sickle Cell Disease','Approved; commercializing','Approved','','Yes','','Scaling','Yes','','Scaling','','',''),
    ('CSL Ltd','Gene Therapy (AAV)','Hemophilia B','Hemophilia B','Approved; supply disruption','Approved','','Yes','','Constrained','Yes','Temporary global supply disruption March 17, 2026 (mfg complexity)','Established','','',''),
    ('Abeona Therapeutics Inc','Gene Therapy (HSC)','Epidermolysis Bullosa (RDEB)','Recessive Dystrophic EB','Approved','Approved','','Yes','','Scaling','Yes','','Scaling','5th QTC activated (Columbia/NYP April 2); 100 eligible patients in funnel; 80% commercial payer coverage; CMS permanent J-code','Scaling',''),
    ('Autolus Therapeutics Plc','CAR-T Cell Therapy','Adult B-ALL','B-Cell Acute Lymphoblastic Leukemia','Approved (Nov 2024)','Approved','','Yes','','Scaling','Yes','','Scaling','','',''),
    ('Ultragenyx Pharmaceutical Inc','Gene Therapy (AAV)','GSD Ia, Sanfilippo Syndrome','Glycogen Storage Disease Type Ia','BLA accepted (DTX401 Priority Review); BLA resubmission accepted (UX111)','Accepted','Priority Review (DTX401); RMAT; BTD; Orphan Drug','Yes','2026H2','Scaling','Yes','','','','',''),
    ('Kyverna Therapeutics Inc','CAR-T Cell Therapy','Lupus Nephritis, Myasthenia Gravis, Stiff Person Syndrome','Stiff Person Syndrome','Registrational (SPS); Phase 3 (Lupus)','Not filed','RMAT; Orphan Drug; BTD; Fast Track','Yes','2026H2-2027H1','Scaling','Yes','','Early','FDA SPA for SPS; first autoimmune CAR-T BLA expected','',''),
    ('Intellia Therapeutics Inc','Gene Editing (CRISPR/Cas9)','Hereditary Angioedema, ATTR Amyloidosis','Hereditary Angioedema','Phase 3 enrolling (HAELO); IND active (nex-z ATTR)','Not filed','Orphan Drug; Fast Track','Watchlist','2027H1-2027H2','Scaling','Yes','','Early','','','nex-z clinical holds lifted March 2026; HAELO data make-or-break'),
    ('Candel Therapeutics Inc','Oncolytic Immunotherapy (Adenoviral)','Prostate Cancer, Pancreatic Cancer','Prostate Cancer','Phase 3 primary endpoint met','Not filed','','Watchlist','2027H2','','','','','','',''),
    ('PolarityBIO Inc','Cell Therapy (Autologous Skin)','Diabetic Foot Ulcers','Diabetic Foot Ulcers','Phase 3 complete; BLA planned April 2026','Not filed','BTD; RMAT','Yes','2027H1','','','','','','',''),
    ('Neurogene Inc','Gene Therapy (AAV)','Rett Syndrome','Rett Syndrome','Registrational (Embolden); >50% dosed','Not filed','BTD; RMAT; Orphan Drug','Watchlist','2027H2-2028H1','','','','','','',''),
    ('Taysha Gene Therapies Inc','Gene Therapy (AAV)','Rett Syndrome','Rett Syndrome','Pivotal (REVEAL/ASPIRE); dosing near-complete','Not filed','','Watchlist','2028H1','','','','','','',''),
    ('enGene Holdings Inc','Gene Therapy (Non-viral)','BCG-Unresponsive NMIBC','Non-Muscle Invasive Bladder Cancer','Pivotal (LEGEND); enrollment complete','Not filed','CMC Pilot Program selected','Watchlist','2027H2','','','','','','',''),
    ('Capricor Therapeutics Inc','Cell Therapy (Cardiosphere-Derived)','Duchenne Cardiomyopathy','DMD Cardiomyopathy','BLA resubmission under review','Accepted','','Yes','2026H2-2027H1','','','','','','',''),
    ('CG Oncology Inc','Oncolytic Immunotherapy (Adenoviral)','BCG-Unresponsive NMIBC','Non-Muscle Invasive Bladder Cancer','Phase 3 (PIVOT-006) topline expected H1 2026','Not filed','','','','','','','','','',''),
    ('Nanoscope Therapeutics Inc','Gene Therapy (AAV)','Retinitis Pigmentosa','Retinitis Pigmentosa','Rolling BLA','Filed','','Yes','2027H1','','','','','','',''),
    ('RegenxBio Inc','Gene Therapy (AAV)','MPS II, Duchenne MD, MPS I','MPS II (Hunter Syndrome)','CRL for RGX-121 (Feb 2026); Phase 3 others','CRL','','','','','','','','','','RGX-121 CRL Feb 2026 (population definition, surrogate endpoint); RGX-111 clinical hold (CNS tumor)'),
    ('Immatics NV','TCR-T Cell Therapy','Advanced Solid Tumors','Advanced Solid Tumors','Phase 3 (SUPRAME)','Not filed','','','','','','','','','',''),
    ('4D Molecular Therapeutics Inc','Gene Therapy (AAV)','Wet AMD','Wet AMD','Phase 3 enrolled (4FRONT-1)','Not filed','','','','','','','','','',''),
    ('Ocugen Inc','Gene Therapy (AAV)','Retinitis Pigmentosa','Retinitis Pigmentosa','Phase 3 enrolled; rolling BLA Q3 2026','Not filed','RMAT; Orphan Drug; Fast Track','Yes','2027H2','','','','','','',''),
    ('Bayer AG','Gene Therapy (AAV)','Congestive Heart Failure / Pompe','Congestive Heart Failure','Phase 2/3','Not filed','Fast Track; Orphan Drug (AB-1009)','','','','','','','','',''),
    ('Moderna Inc','mRNA Therapy','Melanoma, NSCLC','Melanoma','Phase 3 (INTerpath-001); Phase 3 initiated (NSCLC)','Not filed','','','','','','','','','',''),
    ('Lyell Immunopharma Inc','CAR-T Cell Therapy','Relapsed/Refractory LBCL','Large B-Cell Lymphoma','Phase 3 (PiNACLE) initiated Feb 2026','Not filed','','Watchlist','2028H2','','','','','','',''),
    ('Aurion Biotech','Cell Therapy (Allogeneic Corneal Endothelial)','Corneal Endothelial Dysfunction','Corneal Endothelial Dysfunction','Pivotal Phase 3 (ASTRA) first patients dosed April 13, 2026','Not filed','','','','','','','','','',''),
    ('Cabaletta Bio','CAR-T Cell Therapy','Myositis, Lupus, Systemic Sclerosis','Myositis','Pivotal (RESET-Myositis registrational cohort)','Not filed','','Watchlist','2028','','','','','','',''),
    ('Protara Therapeutics Inc','Cell Therapy (OK-432)','BCG-Unresponsive NMIBC, Lymphatic Malformations','Non-Muscle Invasive Bladder Cancer','Phase 2 (ADVANCED-2)','Not filed','BTD; Fast Track; CMC Pilot Program','','','','','','','','',''),
    ('MeiraGTx Holdings Plc','Gene Therapy (AAV)','Radiation-Induced Xerostomia, LCA4','Radiation-Induced Xerostomia','Phase 1 (xerostomia); partnered (LCA4)','Not filed','BTD (xerostomia, March 26 2026)','','','','','','','','',''),
    ('iECURE Inc','Gene Editing','OTC Deficiency','OTC Deficiency','Phase 1/2; first patient treated','Not filed','RMAT (Jan 2026); CMC Pilot Program (March 2026)','','','','','','','','',''),
    ('Laboratoires Pierre Fabre SA','Cell Therapy (Allogeneic T-cell)','EBV+ PTLD','EBV+ Post-Transplant Lymphoproliferative Disease','sBLA resubmitted March 2, 2026','Filed','','','','','','','','','',''),
    ('Adaptimmune Therapeutics Plc','TCR-T Cell Therapy','Solid Tumors (Soft Tissue Sarcoma)','Synovial Sarcoma','Sold to US WorldMeds; Nasdaq delisted Oct 2025','Approved (TECELRA under US WorldMeds)','','','','','','','','','',''),
    ('UniQure NV','Gene Therapy (AAV)','Huntington''s Disease','Huntington''s Disease','Phase 1/2; FDA demands new trial','Not filed','','No','2029+','','','','','','','FDA indicated Phase 1/2 data insufficient; recommended new randomized double-blind trial with potential sham-surgery control'),
    ('Spark Therapeutics Inc','Gene Therapy (AAV)','Hemophilia A, Neurology','Hemophilia A','SPK-8011 shelved; restructuring','Not filed','','','','Scaling','Yes','Major staff reduction (>50%); $575M Gene Therapy Innovation Center opening 2026','','','',''),
    ('Replimune Group Inc','Oncolytic Immunotherapy','Advanced Melanoma','Advanced Melanoma','CRL received (2nd); future uncertain','CRL','','No','Unknown','Constrained','Unclear','','Minimal','','','Second CRL April 10, 2026; workforce reductions announced April 11; program viability in question'),
    ('Pfizer Inc','Gene Therapy (AAV)','Hemophilia B','Hemophilia B','Discontinued','Approved (but discontinued)','','','','','','','','','',''),
    ('Sumitomo Pharma Co Ltd','Cell Therapy (iPSC)','Parkinson''s Disease','Parkinson''s Disease','Approved (Japan only, Feb 2026)','Not filed','','','','','','','','','',''),
    ('BioMarin Pharmaceutical Inc','Gene Therapy (AAV)','Hemophilia A','Hemophilia A','Approved but withdrawing by May 2026','Approved','','','','','','','','','',''),
    ('ProQR Therapeutics','RNA Editing','Ophthalmology (former)','N/A - exiting ophthalmology','Strategic pivot; exiting ophthalmology','Not filed','','','','','','','','','',''),
    ('Boehringer Ingelheim','Gene Therapy (Lentiviral)','Cystic Fibrosis','Cystic Fibrosis','TERMINATED','Not filed','','','','','','','','','','')
)
UPDATE cgt_assets a SET
  modality = CASE WHEN d.modality <> '' THEN d.modality ELSE a.modality END,
  target_indication = CASE WHEN d.target_indication <> '' THEN d.target_indication ELSE a.target_indication END,
  lead_indication = CASE WHEN d.lead_indication <> '' THEN d.lead_indication ELSE a.lead_indication END,
  phase_regulatory_status = CASE WHEN d.phase_regulatory_status <> '' THEN d.phase_regulatory_status ELSE a.phase_regulatory_status END,
  filing_status = CASE WHEN d.filing_status <> '' THEN d.filing_status ELSE a.filing_status END,
  fda_designations = CASE WHEN d.fda_designations <> '' THEN d.fda_designations ELSE a.fda_designations END,
  likely_us_launch_within_24_months = CASE WHEN d.likely_us_launch <> '' THEN d.likely_us_launch ELSE a.likely_us_launch_within_24_months END,
  us_commercialization_window = CASE WHEN d.us_window <> '' THEN d.us_window ELSE a.us_commercialization_window END,
  manufacturing_status = CASE WHEN d.mfg_status <> '' THEN d.mfg_status ELSE a.manufacturing_status END,
  manufacturing_pathway = CASE WHEN d.mfg_pathway <> '' THEN d.mfg_pathway ELSE a.manufacturing_pathway END,
  manufacturing_cmc_risk_notes = CASE WHEN d.mfg_notes <> '' THEN d.mfg_notes ELSE a.manufacturing_cmc_risk_notes END,
  commercial_buildout_status = CASE WHEN d.comm_buildout <> '' THEN d.comm_buildout ELSE a.commercial_buildout_status END,
  commercial_readiness_signals = CASE WHEN d.comm_signals <> '' THEN d.comm_signals ELSE a.commercial_readiness_signals END,
  treatment_network_status = CASE WHEN d.treatment_network <> '' THEN d.treatment_network ELSE a.treatment_network_status END,
  regulatory_clinical_risk_notes = CASE WHEN d.reg_risk_notes <> '' THEN d.reg_risk_notes ELSE a.regulatory_clinical_risk_notes END,
  updated_at = now()
FROM d
JOIN cgt_companies c ON c.company_name = d.company_name
WHERE a.company_id = c.id;
