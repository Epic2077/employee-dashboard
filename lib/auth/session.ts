import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import type { Profile } from "@/lib/supabase/models";
import { createClient } from "@/lib/supabase/server";
import { canManageMenu, canViewReports, isOwnerRole } from "@/lib/auth/roles";

export type SessionClaims = {
  sub: string;
  email?: string | null;
  role?: string | null;
};

export const getClaims = cache(async (): Promise<SessionClaims | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return null;
  }

  // `claims.role` is the Postgres role (always "authenticated"); the app role
  // lives in app_metadata and is only written by the service role.
  const appRole = claims.app_metadata?.role;

  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: typeof appRole === "string" ? appRole : null,
  };
});

export async function requireUser(): Promise<SessionClaims> {
  // Mark the render as request-time before touching the auth SDK, which reads
  // the current time to validate token expiry. Without this, Cache Components
  // flags `Date.now()` inside getClaims() as an unstable value during
  // prerendering.
  await connection();

  const claims = await getClaims();
  if (!claims) {
    redirect("/login");
  }
  return claims;
}

/**
 * Loads the signed-in employee profile. Redirects to /login when the session is
 * missing and to /change-password while the initial password is still in use.
 *
 * React `cache()` dedupes the read within a single request; nothing persists
 * between requests, so clearing `must_change_password` takes effect instantly.
 */
export const getCurrentProfile = cache(async (): Promise<Profile> => {
  const claims = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!data || !data.is_active) {
    // The JWT may still be valid for a deleted/deactivated user; clear it
    // instead of redirecting to /login (which would loop through the proxy).
    redirect("/auth/signout");
  }

  if (data.must_change_password) {
    redirect("/change-password");
  }

  return data;
});

export async function requireStaff(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!canViewReports(profile.role)) {
    redirect("/");
  }
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!canManageMenu(profile.role)) {
    redirect("/");
  }
  return profile;
}

export async function requireOwner(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!isOwnerRole(profile.role)) {
    redirect("/");
  }
  return profile;
}
