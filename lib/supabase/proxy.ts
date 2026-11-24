import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

const SESSION_CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

function copySessionState(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  for (const header of SESSION_CACHE_HEADERS) {
    const value = from.headers.get(header);
    if (value) {
      to.headers.set(header, value);
    }
  }
  return to;
}

/**
 * Refreshes the Supabase session cookie and guards protected routes.
 *
 * `getClaims()` verifies the JWT signature; never trust `getSession()` here,
 * because it reads whatever the cookie says.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers ?? {}).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === "/login";

  if (!claims && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", pathname);
    }
    return copySessionState(response, NextResponse.redirect(url));
  }

  if (claims && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return copySessionState(response, NextResponse.redirect(url));
  }

  return response;
}
