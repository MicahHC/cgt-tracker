/*
  # Fix all commercialization_status mismatches

  1. Problem
    - Many companies have phase set to Phase II or Phase III
      but commercialization_status stuck at phase_1, making them
      invisible in the filtered company list

  2. Changes
    - Bulk update commercialization_status to match phase for all companies
    - Phase III and Phase II/III → phase_3
    - Phase II → phase_2
    - Phase I and Phase I/II → phase_1

  3. Security
    - No security changes
*/

UPDATE companies
SET commercialization_status = 'phase_3',
    updated_at = now()
WHERE phase IN ('Phase III', 'Phase II/III')
  AND commercialization_status != 'phase_3';

UPDATE companies
SET commercialization_status = 'phase_2',
    updated_at = now()
WHERE phase = 'Phase II'
  AND commercialization_status NOT IN ('phase_2', 'phase_3');

UPDATE companies
SET commercialization_status = 'phase_1',
    updated_at = now()
WHERE phase IN ('Phase I', 'Phase I/II')
  AND commercialization_status NOT IN ('phase_1', 'phase_2', 'phase_3');
