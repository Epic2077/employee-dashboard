import { redirect } from "next/navigation";

import { getMyAccess, hasAnyAdminAccess } from "@/lib/auth/permissions";

/**
 * Reading the session/matrix blocks rendering, so the area opts out of
 * instant prerendering instead of streaming a half-authorized shell.
 */
export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every page and server action re-checks its own capability; this only
  // keeps people with no admin capability out of the area entirely.
  const access = await getMyAccess();
  if (!hasAnyAdminAccess(access)) {
    redirect("/");
  }

  return <div className="w-full min-w-0 space-y-6 pt-4">{children}</div>;
}
