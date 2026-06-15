import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = 'https://dbnmnorholzehkppwvap.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibm1ub3Job2x6ZWhrcHB3dmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NzYyNzAsImV4cCI6MjA4NTM1MjI3MH0.R6i7hjo5AwklCSsxlIKT7o5tt7BVyV9i2qGG06LeBkw';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
