import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIG } from "@/config";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  _supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  return _supabase;
}

/**
 * Server-side Supabase client with service role key for admin operations.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.serviceRoleKey);
}
