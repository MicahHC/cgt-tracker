/*
  # Add missing CGT companies

  1. Problem
    - Multiple well-known cell and gene therapy companies were not captured
      by the ClinicalTrials.gov sync due to sponsor name mismatches
      or different search term coverage

  2. New Companies Added
    - Mesoblast Limited - Phase III, mesenchymal stem cell therapy (remestemcel-L for aGvHD)
    - CG Oncology - Phase III, oncolytic virus immunotherapy (cretostimogene for bladder cancer)
    - Orca Biosystems (Orca Bio) - Phase III, high-precision cell therapy (orca-t for hematologic malignancies)
    - Vericel Corporation - Approved/Phase III, autologous cell therapies (MACI, Epicel)
    - Gamida Cell - Approved, stem cell therapy (omidubicel for hematologic malignancies)
    - Imunon (formerly NantKwest) - Phase II/III, immunotherapy (IMMUNOFECT for ovarian cancer)
    - Gracell Biotechnologies - Phase II, CAR-T (FasTCAR for B-cell malignancies)
    - BrainStorm Cell Therapeutics - Phase III, stem cell therapy (NurOwn for ALS)
    - AiVita Biomedical - Phase III, dendritic cell therapy (AV-GBM-1 for glioblastoma)
    - NS Pharma - Phase III, gene therapy (viltolarsen/NS-065 for Duchenne muscular dystrophy)
    - Gameto - Phase II, iPSC-derived cell therapy (reproductive medicine)

  3. Security
    - No security changes
*/

INSERT INTO companies (name, indication, phase, trial_id, therapeutic_area, headquarters, country, commercialization_status, notes)
VALUES
  (
    'Mesoblast Limited',
    'Acute Graft-versus-Host Disease, Chronic Heart Failure, Chronic Low Back Pain',
    'Phase III',
    'NCT04629833',
    'Stem Cell Therapy',
    'New York, NY',
    'United States',
    'phase_3',
    'Phase III remestemcel-L (Ryoncil) for pediatric SR-aGvHD. FDA approved in Japan. Multiple Phase III programs.'
  ),
  (
    'CG Oncology',
    'Non-Muscle Invasive Bladder Cancer',
    'Phase III',
    'NCT04387461',
    'Cell/Gene Therapy',
    'Irvine, CA',
    'United States',
    'phase_3',
    'Phase III BOND-003 trial for cretostimogene grenadenorepvec (oncolytic adenovirus) in BCG-unresponsive NMIBC.'
  ),
  (
    'Orca Bio',
    'Hematologic Malignancies, Leukemia, Lymphoma',
    'Phase III',
    'NCT05907746',
    'Cell Therapy',
    'Sacramento, CA',
    'United States',
    'phase_3',
    'Phase III orca-t high-precision allogeneic cell therapy for hematologic malignancies post-transplant.'
  ),
  (
    'Vericel Corporation',
    'Cartilage Defects, Burns, Knee Injuries',
    'Phase III',
    'NCT01931007',
    'Cell Therapy',
    'Cambridge, MA',
    'United States',
    'phase_3',
    'Commercialized MACI (autologous cultured chondrocytes) and Epicel (skin grafts). Ongoing Phase III expansion programs.'
  ),
  (
    'Gamida Cell',
    'Hematologic Malignancies, Bone Marrow Transplant',
    'Phase III',
    'NCT02730299',
    'Stem Cell Therapy',
    'Boston, MA',
    'United States',
    'phase_3',
    'FDA-approved omidubicel (Omisirge) for hematologic malignancies requiring stem cell transplant.'
  ),
  (
    'Imunon',
    'Ovarian Cancer, Pancreatic Cancer',
    'Phase II/III',
    'NCT05537038',
    'Cell/Gene Therapy',
    'Lawrenceville, NJ',
    'United States',
    'phase_3',
    'Phase II/III IMMUNOFECT for advanced ovarian cancer. Non-viral immunogene therapy platform.'
  ),
  (
    'Gracell Biotechnologies',
    'B-Cell Malignancies, Multiple Myeloma, Non-Hodgkin Lymphoma',
    'Phase II',
    'NCT04008251',
    'CAR-T Cell Therapy',
    'Shanghai / US Operations',
    'United States',
    'phase_2',
    'FasTCAR-T GC012F CD19/BCMA dual-targeting CAR-T. Pivotal Phase II trials ongoing.'
  ),
  (
    'BrainStorm Cell Therapeutics',
    'Amyotrophic Lateral Sclerosis (ALS)',
    'Phase III',
    'NCT03280056',
    'Stem Cell Therapy',
    'New York, NY',
    'United States',
    'phase_3',
    'Phase III NurOwn (autologous MSC-NTF cells) for ALS. Completed Phase III enrollment.'
  ),
  (
    'AiVita Biomedical',
    'Glioblastoma Multiforme',
    'Phase III',
    'NCT03400917',
    'Cell Therapy',
    'Irvine, CA',
    'United States',
    'phase_3',
    'Phase III AV-GBM-1 autologous dendritic cell vaccine for newly diagnosed glioblastoma.'
  ),
  (
    'NS Pharma',
    'Duchenne Muscular Dystrophy',
    'Phase III',
    'NCT04060199',
    'Gene Therapy',
    'Paramus, NJ',
    'United States',
    'phase_3',
    'Phase III viltolarsen (VILTEPSO) exon 53 skipping for DMD. FDA approved for ambulatory patients.'
  ),
  (
    'Gameto',
    'Reproductive Medicine, Ovarian Insufficiency',
    'Phase II',
    NULL,
    'Cell Therapy',
    'New York, NY',
    'United States',
    'phase_2',
    'iPSC-derived gamete and ovarian support cell therapies. Phase II reproductive medicine programs.'
  )
ON CONFLICT (name) DO UPDATE SET
  phase = EXCLUDED.phase,
  indication = EXCLUDED.indication,
  therapeutic_area = EXCLUDED.therapeutic_area,
  commercialization_status = EXCLUDED.commercialization_status,
  notes = EXCLUDED.notes,
  updated_at = now();
