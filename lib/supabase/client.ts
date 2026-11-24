import "client-only";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Browser Supabase client. `createBrowserClient` already memoizes internally,
 * but keeping one module-level instance avoids re-parsing env on every call.
 */
export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
    );
  }
  return browserClient;
}
