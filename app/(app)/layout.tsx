import { cookies } from "next/headers";

import { AppSidebar } from "@/components/app-sidebar";
import Header from "@/components/layout/Header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getMyAccess } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";

/**
 * The shell reads the session, so it blocks on the server instead of streaming
 * a sidebar skeleton. Wrapping it in <Suspense> inside SidebarProvider (a
 * client component) produced a hydration mismatch in production.
 */
export const instant = false;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  const access = await getMyAccess();
  const cookieStore = await cookies();
  // SidebarProvider writes this cookie on toggle; read it so the collapsed
  // state survives reloads and matches between server and client.
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  const user = {
    name: profile.full_name,
    email: profile.email ?? "",
    avatar: profile.avatar_url ?? "",
  };

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        side="right"
        variant="inset"
        user={user}
        role={profile.role}
        scopes={access.scopes}
      />
      <SidebarInset className="min-w-0 px-10 py-4">
        <Header user={{ name: profile.full_name, avatar: user.avatar }} />
        <main className="min-w-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
