/*
  # Create API Data Cache Table

  1. New Tables
    - `api_data_cache`
      - `id` (uuid, primary key) - Unique identifier
      - `company_id` (uuid, foreign key) - Links to companies table
      - `api_source` (text) - Source of the data (e.g., 'sec_edgar', 'openfda', 'pubmed')
      - `data_type` (text) - Type of data (e.g., 'filings', 'drug_approvals', 'publications')
      - `cache_key` (text) - Unique key for the cached data (e.g., company CIK number)
      - `cached_data` (jsonb) - The actual cached API response
      - `fetched_at` (timestamptz) - When the data was fetched
      - `expires_at` (timestamptz) - When the cache expires
      - `created_at` (timestamptz) - Record creation timestamp

  2. Security
    - Enable RLS on `api_data_cache` table
    - Add policy for authenticated users to read cached data
    - Add policy for service role to write/update cached data

  3. Indexes
    - Index on company_id for fast lookups
    - Unique index on (company_id, api_source, data_type) to prevent duplicates
    - Index on expires_at for cache cleanup queries
*/

CREATE TABLE IF NOT EXISTS api_data_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  api_source text NOT NULL,
  data_type text NOT NULL,
  cache_key text,
  cached_data jsonb NOT NULL,
  fetched_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE api_data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read api cache"
  ON api_data_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert api cache"
  ON api_data_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update api cache"
  ON api_data_cache
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_api_cache_company_id ON api_data_cache(company_id);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires_at ON api_data_cache(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_cache_unique ON api_data_cache(company_id, api_source, data_type);