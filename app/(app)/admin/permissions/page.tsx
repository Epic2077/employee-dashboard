import { Fragment, Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeftIcon, FolderTreeIcon, UsersIcon } from "lucide-react";

import { AdminForm } from "@/components/admin/admin-form";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Input } from "@/components/ui/input";
import { adminFieldClass } from "@/lib/admin/styles";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import {
  CAPABILITY_DESCRIPTIONS,
  CAPABILITY_GROUPS,
  CAPABILITY_LABELS,
  CAPABILITY_SCOPES,
  CATEGORY_MODULE_LABELS,
  SCOPE_LABELS,
  type Capability,
  type Scope,
} from "@/lib/auth/scopes";
import { getPermissionsPageData } from "@/lib/data/admin-permissions";

import {
  createCategory,
  deleteCategory,
  saveRoleGrants,
  updateCategory,
} from "./actions";

/** Roles shown as matrix columns (owner is always "everything"). */
const MATRIX_ROLES: AppRole[] = ["employee", "manager", "ceo", "admin"];

export default function PermissionsPage() {
  return (
    <Suspense fallback={<PermissionsSkeleton />}>
      <PermissionsView />
    </Suspense>
  );
}

async function PermissionsView() {
  await connection();

  const { available, source, matrix, teams, categories } =
    await getPermissionsPageData();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            دسترسی‌ها و تیم‌ها
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            دسترسی نقش‌ها، تیم‌ها، مدیران تیم و استثناهای فردی را از همین‌جا
            مدیریت کنید.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          مخصوص مالک
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/permissions/teams"
          className="flex items-center justify-between rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center gap-3">
            <UsersIcon className="size-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">تیم‌ها و دسترسی تیمی</p>
              <p className="text-[11px] text-muted-foreground">
                {teams.length} تیم ثبت شده است
              </p>
            </div>
          </div>
          <ChevronLeftIcon className="size-4 text-muted-foreground" />
        </Link>

        <Link
          href="/admin/permissions/people"
          className="flex items-center justify-between rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center gap-3">
            <FolderTreeIcon className="size-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">استثناهای افراد</p>
              <p className="text-[11px] text-muted-foreground">
                دسترسی یک نفر را مستقل از نقش و تیم تنظیم کنید
              </p>
            </div>
          </div>
          <ChevronLeftIcon className="size-4 text-muted-foreground" />
        </Link>
      </div>

      {!available ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          جدول دسترسی‌ها هنوز روی دیتابیس ساخته نشده است. مایگریشن
          <span className="mx-1 font-mono text-[11px]" dir="ltr">
            20261126100000_layered_access_and_categories.sql
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
            این جدول پایه دسترسی هر نقش است. تیم‌ها، مدیران تیم و استثناهای فردی
            می‌توانند آن را گسترده‌تر یا محدودتر کنند. نقش مالک همیشه همه
            دسترسی‌ها را دارد.
          </p>
        </div>

        <AdminForm
          action={saveRoleGrants}
          submitLabel="ذخیره ماتریس نقش‌ها"
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
                            <RoleScopeSelect
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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">دسته‌بندی محتوا</h2>
          <p className="text-[11px] text-muted-foreground">
            دسته‌ها برای محدودکردن محتوا (سرویس‌ها و منوی ناهار) به کار می‌روند و
            برای ماژول‌های آینده هم قابل استفاده‌اند.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <AdminForm
            action={createCategory}
            submitLabel="افزودن دسته"
            size="sm"
            className="flex flex-wrap items-end gap-3"
          >
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">ماژول *</span>
              <select name="module" className={adminFieldClass}>
                {Object.entries(CATEGORY_MODULE_LABELS).map(
                  ([module, label]) => (
                    <option key={module} value={module}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">شناسه *</span>
              <Input
                name="slug"
                required
                dir="ltr"
                placeholder="drinks"
                className="h-8 w-32"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">نام *</span>
              <Input name="name" required placeholder="نوشیدنی" className="h-8 w-40" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">ترتیب</span>
              <Input
                name="sort_order"
                type="number"
                defaultValue={0}
                className="h-8 w-20"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">توضیح</span>
              <Input name="description" className="h-8 w-52" />
            </label>
          </AdminForm>
        </div>

        {categories.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            هنوز دسته‌ای ساخته نشده است. بدون دسته، دسترسی هر بخش یکپارچه است.
          </p>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {categories.map((category) => (
              <div key={category.id} className="rounded-xl border bg-card p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {CATEGORY_MODULE_LABELS[category.module] ?? category.module}
                    {" · "}
                    <span dir="ltr">{category.slug}</span>
                  </span>
                  <span
                    className={
                      category.isActive
                        ? "text-[10px] text-emerald-600"
                        : "text-[10px] text-muted-foreground"
                    }
                  >
                    {category.isActive ? "فعال" : "غیرفعال"}
                  </span>
                </div>

                <AdminForm
                  action={updateCategory}
                  submitLabel="ذخیره"
                  size="sm"
                  className="space-y-2"
                >
                  <input type="hidden" name="category_id" value={category.id} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">نام</span>
                      <Input name="name" defaultValue={category.name} required />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">ترتیب</span>
                      <Input
                        name="sort_order"
                        type="number"
                        defaultValue={category.sortOrder}
                      />
                    </label>
                  </div>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">توضیح</span>
                    <Input
                      name="description"
                      defaultValue={category.description ?? ""}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="is_active"
                      defaultChecked={category.isActive}
                      className="size-3.5"
                    />
                    <span className="text-muted-foreground">فعال باشد</span>
                  </label>
                </AdminForm>

                <div className="mt-3 border-t pt-3">
                  <AdminForm
                    action={deleteCategory}
                    submitSlot={
                      <ConfirmSubmit
                        message={`دسته «${category.name}» حذف شود؟ دسترسی‌های مرتبط با آن هم پاک می‌شوند.`}
                      >
                        حذف دسته
                      </ConfirmSubmit>
                    }
                  >
                    <input
                      type="hidden"
                      name="category_id"
                      value={category.id}
                    />
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

function RoleScopeSelect({
  role,
  capability,
  value,
}: {
  role: AppRole;
  capability: Capability;
  value: Scope;
}) {
  return (
    <select
      name={`role:${role}:${capability}`}
      defaultValue={value}
      className="h-7 rounded-md border bg-background px-1 text-[11px]"
      aria-label={`${CAPABILITY_LABELS[capability]} برای ${ROLE_LABELS[role]}`}
    >
      {CAPABILITY_SCOPES[capability].map((scope) => (
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}