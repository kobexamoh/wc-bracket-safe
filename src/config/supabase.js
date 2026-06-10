/**
 * Supabase Configuration
 * 
 * This file reads from environment variables.
 * In development, use .env.local (never committed to git)
 * In production, set via your deployment platform (Vercel, DigitalOcean, etc)
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GA_ID = import.meta.env.VITE_GA_ID;

// Validate required env vars
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials. Did you create .env.local?');
  throw new Error('Supabase configuration missing');
}

export const config = {
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  gaId: GA_ID,
};

export default config;
