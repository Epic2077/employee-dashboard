import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Request-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers. Create a new one per request; it is intentionally cheap.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session and writes the cookies on the
          // response instead, so this can be safely ignored.
        }
      },
    },
  });
}
