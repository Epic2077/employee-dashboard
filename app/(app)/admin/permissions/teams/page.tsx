import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeftIcon } from "lucide-react";

import { AdminForm } from "@/components/admin/admin-form";
import { Input } from "@/components/ui/input";
import { adminFieldClass } from "@/lib/admin/styles";
import { getPermissionsPageData } from "@/lib/data/admin-permissions";

import { createTeam } from "../actions";

export default function TeamsPage() {
  return (
    <Suspense fallback={<TeamsSkeleton />}>
      <TeamsView />
    </Suspense>
  );
}

async function TeamsView() {
  await connection();

  const { teams, managers } = await getPermissionsPageData();

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <Link
          href="/admin/permissions"
          className="mb-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3 rotate-180" />
          بازگشت به دسترسی‌ها
        </Link>
        <h1 className="text-lg font-bold tracking-tight">تیم‌ها</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          اعضای هر تیم از روی «واحد سازمانی» کاربر تعیین می‌شوند. دسترسی اعضا و
          مدیر هر تیم را جداگانه تنظیم کنید.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <AdminForm
          action={createTeam}
          submitLabel="افزودن تیم"
          size="sm"
          className="flex flex-wrap items-end gap-3"
        >
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">نام تیم *</span>
            <Input name="name" required placeholder="مالی" className="h-8 w-48" />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">مدیر تیم</span>
            <select name="manager_id" defaultValue="" className={adminFieldClass}>
              <option value="">بدون مدیر</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          </label>
        </AdminForm>
      </div>

      {teams.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          هنوز تیمی ساخته نشده است.
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/admin/permissions/teams/${team.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <div>
                <p className="text-sm font-semibold">{team.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {team.memberCount} عضو · مدیر: {team.managerName ?? "تعیین نشده"}
                </p>
              </div>
              <ChevronLeftIcon className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-20 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
