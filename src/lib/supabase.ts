import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const CGT_SUPABASE_REF = 'dbnmnorholzehkppwvap';
const CGT_SUPABASE_URL = 'https://dbnmnorholzehkppwvap.supabase.co';
const CGT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibm1ub3Job2x6ZWhrcHB3dmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NzYyNzAsImV4cCI6MjA4NTM1MjI3MH0.R6i7hjo5AwklCSsxlIKT7o5tt7BVyV9i2qGG06LeBkw';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isConfiguredForCgtProject = configuredUrl?.includes(CGT_SUPABASE_REF) && configuredAnonKey;

const supabaseUrl = isConfiguredForCgtProject ? configuredUrl : CGT_SUPABASE_URL;
const supabaseAnonKey = isConfiguredForCgtProject ? configuredAnonKey : CGT_SUPABASE_ANON_KEY;

if (import.meta.env.DEV && !isConfiguredForCgtProject) {
  console.info(`Using CGT Supabase project ${CGT_SUPABASE_REF}. Bolt env was missing or pointed at another project.`);
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
