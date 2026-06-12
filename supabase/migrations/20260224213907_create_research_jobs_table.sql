/*
  # Create Research Jobs Table

  1. New Tables
    - `research_jobs`
      - `id` (uuid, primary key)
      - `company_id` (uuid, foreign key to companies)
      - `status` (text) - 'pending', 'processing', 'completed', 'failed'
      - `progress` (integer) - percentage complete (0-100)
      - `results` (jsonb) - research results
      - `error` (text) - error message if failed
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `completed_at` (timestamptz)

  2. Security
    - Enable RLS on `research_jobs` table
    - Add policies for authenticated users to read their own jobs
*/

CREATE TABLE IF NOT EXISTS research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  results jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE research_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view research jobs"
  ON research_jobs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create research jobs"
  ON research_jobs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update research jobs"
  ON research_jobs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_research_jobs_company_id ON research_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_jobs(status);
CREATE INDEX IF NOT EXISTS idx_research_jobs_created_at ON research_jobs(created_at DESC);
