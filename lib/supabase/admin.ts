import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Service-role client. Never import this from a Client Component: it bypasses
 * RLS. Only used for account provisioning and the username -> email lookup.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Provisioning and username login require it server-side.",
    );
  }

  return createClient<Database>(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
