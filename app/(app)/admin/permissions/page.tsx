import { Fragment, Suspense } from "react";
import { connection } from "next/server";

import { AdminForm } from "@/components/admin/admin-form";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Input } from "@/components/ui/input";
import { adminFieldClass } from "@/lib/admin/styles";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import {
  CAPABILITY_DESCRIPTIONS,
  CAPABILITY_GROUPS,
  CAPABILITY_LABELS,
  FULL_ONLY_CAPABILITIES,
  SCOPE_LABELS,
  type Capability,
  type Scope,
} from "@/lib/auth/scopes";
import { getPermissionsPageData } from "@/lib/data/admin-permissions";

import {
  createTeam,
  deleteTeam,
  savePermissionsMatrix,
  updateTeam,
} from "./actions";

/** Roles shown as matrix columns (owner is always "everything"). */
const MATRIX_ROLES: AppRole[] = ["employee", "manager", "ceo", "admin"];

const ALL_SCOPES: Scope[] = ["none", "self", "team", "all"];
const FULL_SCOPES: Scope[] = ["none", "all"];

export default function PermissionsPage() {
  return (
    <Suspense fallback={<PermissionsSkeleton />}>
      <PermissionsView />
    </Suspense>
  );
}

async function PermissionsView() {
  await connection();

  const { available, source, matrix, teams, managers } =
    await getPermissionsPageData();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            دسترسی‌ها و تیم‌ها
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            تعیین کنید هر نقش به چه بخشی و تا چه حد دسترسی داشته باشد، و مدیر هر
            تیم را مشخص کنید.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          مخصوص مالک
        </span>
      </div>

      {!available ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          جدول دسترسی‌ها هنوز روی دیتابیس ساخته نشده است. مایگریشن
          <span className="mx-1 font-mono text-[11px]" dir="ltr">
            20261124083041_teams_and_permissions.sql
          </span>
          را اجرا کنید. تا آن زمان مقادیر پیش‌فرض نمایش داده می‌شود.
        </div>
      ) : null}

      {source === "defaults" && available ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          ماتریس دسترسی خالی است؛ مقادیر پیش‌فرض نمایش داده می‌شود. با ذخیره،
          همین مقادیر در دیتابیس نوشته می‌شوند.
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">ماتریس دسترسی نقش‌ها</h2>
          <p className="text-[11px] text-muted-foreground">
            «خودم» فقط رکوردهای شخصی، «تیم من» اعضای تیم‌های تحت مدیریت و «همه»
            کل مجموعه را شامل می‌شود. نقش مالک همیشه همه دسترسی‌ها را دارد.
          </p>
        </div>

        <AdminForm
          action={savePermissionsMatrix}
          submitLabel="ذخیره ماتریس دسترسی"
          className="space-y-4"
        >
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[46rem] border-collapse text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-start">
                  <th className="px-3 py-2 text-start font-semibold">دسترسی</th>
                  {MATRIX_ROLES.map((role) => (
                    <th key={role} className="px-2 py-2 font-semibold">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-semibold">
                    {ROLE_LABELS.owner}
                  </th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITY_GROUPS.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="bg-muted/20">
                      <td
                        colSpan={MATRIX_ROLES.length + 2}
                        className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
                      >
                        {group.title}
                      </td>
                    </tr>
                    {group.capabilities.map((capability) => (
                      <tr key={capability} className="border-t">
                        <td className="px-3 py-2">
                          <p className="font-medium">
                            {CAPABILITY_LABELS[capability]}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {CAPABILITY_DESCRIPTIONS[capability]}
                          </p>
                        </td>
                        {MATRIX_ROLES.map((role) => (
                          <td key={role} className="px-2 py-2 text-center">
                            <ScopeSelect
                              role={role}
                              capability={capability}
                              value={matrix[role][capability]}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center text-[11px] text-muted-foreground">
                          همه
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </AdminForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">تیم‌ها و مدیران</h2>

        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 text-[11px] text-muted-foreground">
            مدیر هر تیم، در گزارش‌ها و فهرست کاربران فقط اعضای همان تیم را
            می‌بیند. اعضای تیم از روی «واحد سازمانی» کاربر در صفحه کاربران مشخص
            می‌شوند.
          </p>

          <AdminForm
            action={createTeam}
            submitLabel="افزودن تیم"
            size="sm"
            className="flex flex-wrap items-end gap-3"
          >
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">نام تیم *</span>
              <Input
                name="name"
                required
                placeholder="مالی"
                className="h-8 w-48"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">مدیر تیم</span>
              <select
                name="manager_id"
                defaultValue=""
                className={adminFieldClass}
              >
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
              <div key={team.id} className="rounded-xl border bg-card p-4">
                <AdminForm
                  key={`${team.id}-${team.name}-${team.managerId ?? "none"}`}
                  action={updateTeam}
                  submitLabel="ذخیره تغییرات"
                  size="sm"
                  className="space-y-3"
                >
                  <input type="hidden" name="team_id" value={team.id} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {team.memberCount} عضو
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">نام تیم</span>
                      <Input name="name" defaultValue={team.name} required />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">مدیر تیم</span>
                      <select
                        name="manager_id"
                        defaultValue={team.managerId ?? ""}
                        className={adminFieldClass}
                      >
                        <option value="">بدون مدیر</option>
                        {managers.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </AdminForm>

                <div className="mt-3 border-t pt-3">
                  <AdminForm
                    action={deleteTeam}
                    submitSlot={
                      <ConfirmSubmit
                        message={`تیم «${team.name}» حذف شود؟ اعضا بدون تیم می‌شوند.`}
                      >
                        حذف تیم
                      </ConfirmSubmit>
                    }
                  >
                    <input type="hidden" name="team_id" value={team.id} />
                  </AdminForm>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ScopeSelect({
  role,
  capability,
  value,
}: {
  role: AppRole;
  capability: Capability;
  value: Scope;
}) {
  const options = FULL_ONLY_CAPABILITIES.includes(capability)
    ? FULL_SCOPES
    : ALL_SCOPES;

  return (
    <select
      name={`scope:${role}:${capability}`}
      defaultValue={value}
      className="h-7 rounded-md border bg-background px-1 text-[11px]"
      aria-label={`${CAPABILITY_LABELS[capability]} برای ${ROLE_LABELS[role]}`}
    >
      {options.map((scope) => (
        <option key={scope} value={scope}>
          {SCOPE_LABELS[scope]}
        </option>
      ))}
    </select>
  );
}

function PermissionsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
