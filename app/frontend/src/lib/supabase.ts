import { createClient } from '@supabase/supabase-js';

// Read from Vite env at build time. .env.local is the source of truth locally;
// Cloudflare Pages injects VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY as
// build-time env vars — see README for setup.
//
// Fails loudly at boot rather than silently, so a missing env var never ships
// as "requests just don't work" in production. (An anon key + URL is safe to
// bundle: they are the client-facing keys, guarded server-side by RLS.)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missing = [
    !SUPABASE_URL && 'VITE_SUPABASE_URL',
    !SUPABASE_ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean).join(', ');
  throw new Error(
    `[supabase] Missing env: ${missing}. ` +
    'Create a Supabase project (see README), then copy .env.local.example to ' +
    '.env.local and fill both values from Supabase → Project Settings → API.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export { SUPABASE_URL, SUPABASE_ANON_KEY };
