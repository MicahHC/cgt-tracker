/*
  # Fix mis-tagged company phases

  1. Problem
    - Several CGT companies were imported with Phase I designation
      when they actually have Phase II/III or Phase III programs
    - Their commercialization_status was also set incorrectly

  2. Companies Updated
    - Arcellx, Inc. → Phase II (has active Phase II trials for myeloma)
    - Legend Biotech USA Inc → Phase III (CARVYKTI approved, Phase III ongoing)
    - BlueRock Therapeutics → Phase III (bemdaneprocel Phase III for Parkinson's)
    - Nanoscope Therapeutics Inc. → Phase II/III (MCO-010 Phase II/III for retinitis pigmentosa)
    - Prokidney → Phase III (REACT Phase III for CKD)

  3. Security
    - No security changes
*/

UPDATE companies
SET phase = 'Phase II',
    commercialization_status = 'phase_2',
    updated_at = now()
WHERE name = 'Arcellx, Inc.'
  AND phase = 'Phase I';

UPDATE companies
SET phase = 'Phase III',
    commercialization_status = 'phase_3',
    updated_at = now()
WHERE name = 'Legend Biotech USA Inc'
  AND phase = 'Phase I';

UPDATE companies
SET phase = 'Phase III',
    commercialization_status = 'phase_3',
    updated_at = now()
WHERE name = 'BlueRock Therapeutics'
  AND phase = 'Phase I';

UPDATE companies
SET phase = 'Phase II/III',
    commercialization_status = 'phase_3',
    updated_at = now()
WHERE name = 'Nanoscope Therapeutics Inc.'
  AND phase = 'Phase I';

UPDATE companies
SET phase = 'Phase III',
    commercialization_status = 'phase_3',
    updated_at = now()
WHERE name = 'Prokidney'
  AND phase = 'Phase I';
