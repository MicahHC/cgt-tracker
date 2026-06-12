/*
  # Fix RLS Policies and Remove Unused Indexes

  ## Security Fixes

  1. **Remove Anonymous Access**
     - Drop all policies that allow anonymous (unauthenticated) users to access data
     - This is a scoring platform that should require authentication

  2. **Keep Authenticated Access**
     - Maintain policies for authenticated users since this is an admin platform
     - All authenticated users can access all data (single-tenant admin system)

  3. **Remove Unused Indexes**
     - Drop indexes that are not being used by queries
     - Reduces maintenance overhead and storage

  ## Changes

  ### Dropped Policies (Anonymous Access)
  - All `anon` role policies for companies, company_scores, company_data_sources, 
    funding_rounds, strategic_partnerships, and sync_logs tables

  ### Dropped Indexes
  - idx_companies_name (unused)
  - idx_company_scores_total (unused)
  - idx_company_scores_tier (unused)
  - idx_sync_logs_started_at (unused)
  - idx_companies_source (unused)
  - idx_companies_last_synced (unused)

  ### Kept
  - All authenticated user policies (required for app functionality)

  ## Notes
  - Auth DB Connection Strategy: This is a Supabase project setting, not configurable via SQL
  - Leaked Password Protection: This is a Supabase Auth setting in the dashboard
*/

-- Drop all anonymous user policies for companies
DROP POLICY IF EXISTS "Allow anonymous users to view companies" ON companies;
DROP POLICY IF EXISTS "Allow anonymous users to insert companies" ON companies;
DROP POLICY IF EXISTS "Allow anonymous users to update companies" ON companies;
DROP POLICY IF EXISTS "Allow anonymous users to delete companies" ON companies;

-- Drop all anonymous user policies for company_scores
DROP POLICY IF EXISTS "Allow anonymous users to view scores" ON company_scores;
DROP POLICY IF EXISTS "Allow anonymous users to insert scores" ON company_scores;
DROP POLICY IF EXISTS "Allow anonymous users to update scores" ON company_scores;
DROP POLICY IF EXISTS "Allow anonymous users to delete scores" ON company_scores;

-- Drop all anonymous user policies for company_data_sources
DROP POLICY IF EXISTS "Allow anonymous users to view data sources" ON company_data_sources;
DROP POLICY IF EXISTS "Allow anonymous users to insert data sources" ON company_data_sources;
DROP POLICY IF EXISTS "Allow anonymous users to update data sources" ON company_data_sources;
DROP POLICY IF EXISTS "Allow anonymous users to delete data sources" ON company_data_sources;

-- Drop all anonymous user policies for funding_rounds
DROP POLICY IF EXISTS "Allow anonymous users to view funding rounds" ON funding_rounds;
DROP POLICY IF EXISTS "Allow anonymous users to insert funding rounds" ON funding_rounds;
DROP POLICY IF EXISTS "Allow anonymous users to update funding rounds" ON funding_rounds;
DROP POLICY IF EXISTS "Allow anonymous users to delete funding rounds" ON funding_rounds;

-- Drop all anonymous user policies for strategic_partnerships
DROP POLICY IF EXISTS "Allow anonymous users to view partnerships" ON strategic_partnerships;
DROP POLICY IF EXISTS "Allow anonymous users to insert partnerships" ON strategic_partnerships;
DROP POLICY IF EXISTS "Allow anonymous users to update partnerships" ON strategic_partnerships;
DROP POLICY IF EXISTS "Allow anonymous users to delete partnerships" ON strategic_partnerships;

-- Drop anonymous user policies for sync_logs if they exist
DROP POLICY IF EXISTS "Allow anonymous users to view sync_logs" ON sync_logs;
DROP POLICY IF EXISTS "Allow anonymous users to insert sync_logs" ON sync_logs;
DROP POLICY IF EXISTS "Allow anonymous users to update sync_logs" ON sync_logs;
DROP POLICY IF EXISTS "Allow anonymous users to delete sync_logs" ON sync_logs;

-- Drop unused indexes
DROP INDEX IF EXISTS idx_companies_name;
DROP INDEX IF EXISTS idx_company_scores_total;
DROP INDEX IF EXISTS idx_company_scores_tier;
DROP INDEX IF EXISTS idx_sync_logs_started_at;
DROP INDEX IF EXISTS idx_companies_source;
DROP INDEX IF EXISTS idx_companies_last_synced;
