import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

export function createSupabaseServerClient() {
  const url = env.VITE_SUPABASE_URL as string | undefined;
  const anon = env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  }
  return createClient(url, anon, {
    auth: {
      persistSession: false
    }
  });
}
