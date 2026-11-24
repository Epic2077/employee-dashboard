import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Clears the local session and returns to /login.
 *
 * Used when a valid-looking JWT has no matching profile row (deleted or
 * deactivated user). Without it the proxy would bounce /login -> / and the
 * page would bounce / -> /login forever.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Cookies are cleared by the client even if the auth call fails.
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
