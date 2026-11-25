import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { DownloadIcon } from "lucide-react";

import { AdminForm } from "@/components/admin/admin-form";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { CopyCredentials } from "@/components/admin/copy-credentials";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { adminFieldClass } from "@/lib/admin/styles";
import {
  APP_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AppRole,
} from "@/lib/auth/roles";
import type { AdminUserRow } from "@/lib/data/admin-users";
import { getAdminUsers } from "@/lib/data/admin-users";
import { cn, getInitials } from "@/lib/utils";

import { createAdminUser, deleteAdminUser, updateAdminUser } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(value));
}

export default function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<UsersSkeleton />}>
      <UsersView searchParams={searchParams} />
    </Suspense>
  );
}

async function UsersView({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const params = await searchParams;
  const {
    actorRole,
    actorId,
    assignableRoles,
    users,
    departments,
    filters,
    counts,
    canManageUsers,
    canManageOwners,
  } = await getAdminUsers({
    role: typeof params.role === "string" ? params.role : null,
    department:
      typeof params.department === "string" ? params.department : null,
    q: typeof params.q === "string" ? params.q : "",
  });
  const hasFilters = Boolean(filters.q || filters.role || filters.department);

  const exportParams = new URLSearchParams();
  if (filters.role) exportParams.set("role", filters.role);
  if (filters.department) exportParams.set("department", filters.department);
  if (filters.q) exportParams.set("q", filters.q);
  const exportQuery = exportParams.toString();
  const exportHref = `/admin/users/export${exportQuery ? `?${exportQuery}` : ""}`;

  const credentialsText = [
    "فهرست کاربران و رمز عبور اولیه (رمز = کد پرسنلی)",
    "",
    ...users.map(
      (user, index) =>
        `${index + 1}) ${user.fullName} — نام کاربری: ${user.username} — رمز عبور: ${user.employeeCode ?? "—"}`,
    ),
  ].join("\n");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">کاربران و نقش‌ها</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canManageUsers
              ? "ساخت، ویرایش و حذف حساب کارکنان؛ رمز عبور اولیه را مدیر تعیین می‌کند و کارمند در اولین ورود آن را تغییر می‌دهد."
              : "فهرست کارکنانی که به آن‌ها دسترسی دارید (فقط‌خواندنی)."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            نقش شما: {ROLE_LABELS[actorRole]}
          </span>
          {users.length > 0 ? (
            <>
              <CopyCredentials text={credentialsText} />
              <a
                href={exportHref}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
              >
                <DownloadIcon className="size-3.5" />
                خروجی اکسل
              </a>
            </>
          ) : null}
        </div>
      </div>

      <datalist id="department-options">
        {departments.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">جستجو</span>
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="نام، نام کاربری، کد پرسنلی یا تلفن"
            className="h-8 w-56 text-xs"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">نقش</span>
          <select
            name="role"
            defaultValue={filters.role ?? ""}
            className={adminFieldClass}
          >
            <option value="">همه نقش‌ها</option>
            {APP_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">واحد سازمانی</span>
          <select
            name="department"
            defaultValue={filters.department ?? ""}
            className={adminFieldClass}
          >
            <option value="">همه واحدها</option>
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-8 rounded-md border px-3 text-xs hover:bg-muted"
        >
          اعمال فیلتر
        </button>
        {hasFilters ? (
          <Link
            href="/admin/users"
            className="h-8 rounded-md px-3 text-xs leading-8 text-muted-foreground hover:bg-muted"
          >
            پاک کردن
          </Link>
        ) : null}
        <span className="ms-auto text-[11px] text-muted-foreground tabular-nums">
          {counts.visible} کاربر · {counts.active} فعال · {counts.managers} مدیر
        </span>
      </form>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {APP_ROLES.map((role) => (
          <div key={role} className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-semibold">{ROLE_LABELS[role]}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {ROLE_DESCRIPTIONS[role]}
            </p>
          </div>
        ))}
      </div>

      <details
        className="rounded-xl border bg-card"
        open={canManageUsers && users.length === 0}
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          {canManageUsers
            ? "افزودن کاربر جدید"
            : "افزودن کاربر جدید (بدون دسترسی)"}
        </summary>
        <div className="border-t p-4">
          {canManageUsers ? (
            <AdminForm
              action={createAdminUser}
              submitLabel="ایجاد حساب"
              className="space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">
                    نام و نام خانوادگی *
                  </span>
                  <Input
                    name="full_name"
                    required
                    placeholder="مثلاً سارا محمدی"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">
                    نام کاربری * (برای ورود)
                  </span>
                  <Input
                    name="username"
                    required
                    dir="auto"
                    placeholder="سارا محمدی"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">
                    کد پرسنلی * (انگلیسی)
                  </span>
                  <Input
                    name="employee_code"
                    required
                    dir="ltr"
                    placeholder="100102"
                    className="text-left"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">واحد سازمانی</span>
                  <Input
                    name="department"
                    list="department-options"
                    placeholder="مالی"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">شماره تماس</span>
                  <Input
                    name="phone"
                    dir="ltr"
                    inputMode="tel"
                    placeholder="09121234567"
                    className="text-left"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">نقش</span>
                  <select
                    name="role"
                    defaultValue="employee"
                    className={adminFieldClass}
                  >
                    {assignableRoles.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">
                    رمز عبور اولیه * (حداقل ۶ کاراکتر)
                  </span>
                  <Input
                    name="password"
                    type="password"
                    dir="ltr"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="••••••"
                    className="text-left"
                  />
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                ایمیل ورود به‌صورت خودکار از کد پرسنلی ساخته می‌شود
                (emp-&lt;code&gt;@staff.local).
              </p>
            </AdminForm>
          ) : (
            <p className="text-xs text-muted-foreground">
              فقط مالک می‌تواند حساب بسازد یا ویرایش کند. از صفحهٔ «دسترسی‌ها و
              تیم‌ها» می‌توانید این دسترسی را به نقش‌های دیگر بدهید.
            </p>
          )}
        </div>
      </details>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">فهرست کاربران</h2>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {users.length} کاربر
          </span>{" "}
        </div>

        {users.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            هنوز کاربری ثبت نشده است.
          </p>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                actorId={actorId}
                canManageUsers={canManageUsers}
                canManageOwners={canManageOwners}
                assignableRoles={assignableRoles}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function UserCard({
  user,
  actorId,
  canManageUsers,
  canManageOwners,
  assignableRoles,
}: {
  user: AdminUserRow;
  actorId: string;
  canManageUsers: boolean;
  canManageOwners: boolean;
  assignableRoles: AppRole[];
}) {
  const isSelf = user.id === actorId;
  const canEdit = canManageUsers && (canManageOwners || user.role !== "owner");
  const roleOptions = assignableRoles.includes(user.role as AppRole)
    ? assignableRoles
    : ([...assignableRoles, user.role] as AppRole[]);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.fullName}</p>
            <p
              className="truncate text-[11px] text-muted-foreground"
              dir="auto"
            >
              {user.username}
              {isSelf ? " · شما" : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {ROLE_LABELS[user.role]}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              user.isActive
                ? "bg-emerald-600/10 text-emerald-700"
                : "bg-muted text-muted-foreground",
            )}
          >
            {user.isActive ? "فعال" : "غیرفعال"}
          </span>
        </div>
      </div>

      <dl className="grid gap-x-4 gap-y-1.5 border-t pt-3 text-xs sm:grid-cols-2">
        <InfoRow label="کد پرسنلی" value={user.employeeCode ?? "—"} ltr />
        <InfoRow label="شماره تماس" value={user.phone ?? "—"} ltr />
        <InfoRow label="واحد سازمانی" value={user.department ?? "—"} />
        <InfoRow label="آخرین ورود" value={formatDateTime(user.lastSignInAt)} />
        <InfoRow label="تاریخ ایجاد" value={formatDateTime(user.createdAt)} />
        <InfoRow label="ایمیل ورود" value={user.email ?? "—"} ltr mono />
      </dl>

      {canEdit ? (
        <details className="border-t pt-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            ویرایش حساب
          </summary>

          <AdminForm
            key={`${user.id}-${user.role}-${user.isActive}`}
            action={updateAdminUser}
            submitLabel="ذخیره تغییرات"
            size="sm"
            className="mt-3 space-y-3"
          >
            <input type="hidden" name="user_id" value={user.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">
                  نام و نام خانوادگی
                </span>
                <Input name="full_name" defaultValue={user.fullName} required />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">واحد سازمانی</span>
                <Input
                  name="department"
                  list="department-options"
                  defaultValue={user.department ?? ""}
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">شماره تماس</span>
                <Input
                  name="phone"
                  dir="ltr"
                  inputMode="tel"
                  defaultValue={user.phone ?? ""}
                  className="text-left"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">نقش</span>
                <select
                  name="role"
                  defaultValue={user.role}
                  className={adminFieldClass}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={user.isActive}
                className="size-4 accent-primary"
              />
              حساب فعال است
            </label>
          </AdminForm>

          {isSelf ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              نمی‌توانید نقش خودتان را تغییر دهید یا حسابتان را حذف/غیرفعال
              کنید.
            </p>
          ) : (
            <div className="mt-3 border-t pt-3">
              <AdminForm
                action={deleteAdminUser}
                submitSlot={
                  <ConfirmSubmit
                    message={`حساب «${user.fullName}» حذف شود؟ این کار قابل بازگشت نیست.`}
                  >
                    حذف حساب
                  </ConfirmSubmit>
                }
              >
                <input type="hidden" name="user_id" value={user.id} />
              </AdminForm>
            </div>
          )}
        </details>
      ) : (
        <p className="border-t pt-2 text-[11px] text-muted-foreground">
          فقط مالک می‌تواند حساب مالک را تغییر دهد یا حذف کند.
        </p>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  ltr,
  mono,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "truncate text-end",
          ltr ? "tabular-nums" : "",
          mono ? "font-mono text-[10px]" : "",
        )}
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-12 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="h-56 animate-pulse rounded-xl bg-muted" />
        <div className="h-56 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
