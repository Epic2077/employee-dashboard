import { Suspense } from "react";
import { connection } from "next/server";

import { AdminForm } from "@/components/admin/admin-form";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { CopyLink } from "@/components/digital/copy-link";
import { Input } from "@/components/ui/input";
import { adminFieldClass } from "@/lib/admin/styles";
import { ROLE_LABELS, toAppRole } from "@/lib/auth/roles";
import { getDigitalAdminData } from "@/lib/data/digital";
import type { DigitalConfigView } from "@/lib/digital/types";
import { cn } from "@/lib/utils";

import {
  createConfigForUser,
  revokeConfig,
  saveDigitalSettings,
  setQuota,
} from "./actions";

const STATUS_LABELS: Record<DigitalConfigView["status"], string> = {
  active: "فعال",
  error: "خطا",
  revoked: "لغو شده",
};

export default function AdminConfigPage() {
  return (
    <Suspense fallback={<ConfigSkeleton />}>
      <ConfigView />
    </Suspense>
  );
}

async function ConfigView() {
  await connection();

  const data = await getDigitalAdminData();
  const activeConfigs = data.configs.filter(
    (config) => config.status !== "revoked",
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">مدیریت کانفیگ‌ها</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            ساخت و لغو اشتراک V2Ray، تعیین نودها و سهمیه هر کارمند.
            {data.canManageNodes ? "" : " (فقط اعضای تیم شما)"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            data.configured
              ? "bg-emerald-600/10 text-emerald-700"
              : "bg-amber-500/10 text-amber-700",
          )}
        >
          {data.configured ? "اتصال به پنل تنظیم شده" : "پنل تنظیم نشده"}
        </span>
      </div>

      {!data.available ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          جدول‌های کانفیگ روی دیتابیس وجود ندارند. مایگریشن
          <span className="mx-1 font-mono text-[11px]" dir="ltr">
            20261124091825_digital_configs.sql
          </span>
          را اجرا کنید.
        </div>
      ) : null}

      {data.available && !data.configured ? (
        <div className="rounded-xl border border-dashed bg-amber-500/10 p-4 text-xs leading-6 text-amber-700">
          برای ساخت کانفیگ، این متغیرها را در{" "}
          <span className="font-mono">.env</span> تنظیم کنید:{" "}
          <span className="font-mono" dir="ltr">
            XUI_BASE_URL, XUI_USERNAME, XUI_PASSWORD
          </span>{" "}
          و در صورت نیاز{" "}
          <span className="font-mono" dir="ltr">
            XUI_SUB_BASE_URL
          </span>
          .
        </div>
      ) : null}

      {data.inboundsError ? (
        <div className="rounded-xl border border-dashed bg-destructive/10 p-4 text-xs text-destructive">
          خطا در خواندن نودها از پنل: {data.inboundsError}
        </div>
      ) : null}

      {data.canManageNodes ? (
        <section className="rounded-xl border bg-card p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">تنظیمات کانفیگ</h2>
            <p className="text-[11px] text-muted-foreground">
              نودهای پیش‌فرض برای کارکنان و مدیران، سقف سهمیه مدیران و وضعیت
              ساخت کانفیگ توسط خود کارمند.
            </p>
          </div>

          <AdminForm
            action={saveDigitalSettings}
            submitLabel="ذخیره تنظیمات"
            size="sm"
            className="space-y-4"
          >
            {data.inbounds.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-xs text-muted-foreground">
                  نودهای پیش‌فرض (اگر خالی بماند، همه نودهای فعال استفاده
                  می‌شوند)
                </legend>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {data.inbounds.map((inbound) => (
                    <label
                      key={inbound.id}
                      className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        name="default_inbound_ids"
                        value={inbound.id}
                        defaultChecked={data.settings.defaultInboundIds.includes(
                          inbound.id,
                        )}
                        className="size-4 accent-primary"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {inbound.remark}
                      </span>
                      <span
                        className="shrink-0 text-[10px] text-muted-foreground"
                        dir="ltr"
                      >
                        {inbound.protocol}:{inbound.port}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                لیست نودها در دسترس نیست؛ پس از تنظیم اتصال پنل دوباره تلاش
                کنید.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">
                  سقف سهمیه مدیران (کانفیگ برای هر نفر)
                </span>
                <Input
                  name="manager_quota_cap"
                  type="number"
                  min={1}
                  max={99}
                  dir="ltr"
                  defaultValue={data.settings.managerQuotaCap}
                  className="text-left tabular-nums"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">
                  آدرس پایه لینک اشتراک (اختیاری)
                </span>
                <Input
                  name="sub_base_url"
                  dir="ltr"
                  defaultValue={data.settings.subBaseUrl ?? ""}
                  placeholder="https://sub.example.com:2096/abcd1234"
                  className="text-left"
                />
              </label>
              <label className="flex items-end gap-2 pb-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  name="self_service_enabled"
                  defaultChecked={data.settings.selfServiceEnabled}
                  className="size-4 accent-primary"
                />
                کارکنان خودشان کانفیگ بسازند
              </label>
            </div>
          </AdminForm>
        </section>
      ) : null}

      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">ساخت کانفیگ برای کارمند</h2>
          <p className="text-[11px] text-muted-foreground">
            نام کانفیگ در پنل، نام همان کارمند است.
          </p>
        </div>

        <AdminForm
          action={createConfigForUser}
          submitLabel="ساخت کانفیگ"
          size="sm"
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">کارمند *</span>
              <select name="user_id" required className={adminFieldClass}>
                <option value="">انتخاب کنید…</option>
                {data.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                    {user.department ? ` — ${user.department}` : ""} (
                    {user.used}/{user.quota ?? "∞"})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {data.canManageNodes && data.inbounds.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-xs text-muted-foreground">
                نودها (خالی = نودهای پیش‌فرض)
              </legend>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {data.inbounds.map((inbound) => (
                  <label
                    key={inbound.id}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="inbound_ids"
                      value={inbound.id}
                      className="size-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {inbound.remark}
                    </span>
                    <span
                      className="shrink-0 text-[10px] text-muted-foreground"
                      dir="ltr"
                    >
                      {inbound.protocol}:{inbound.port}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </AdminForm>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">کانفیگ‌های فعال</h2>
          <p className="text-[11px] text-muted-foreground">
            {activeConfigs.length} کانفیگ برای {data.users.length} کارمند در
            دسترس شما.
          </p>
        </div>

        {activeConfigs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            هنوز کانفیگی ساخته نشده است.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">کارمند</th>
                  <th className="px-3 py-2 text-start font-medium">
                    نام کانفیگ
                  </th>
                  <th className="px-3 py-2 text-start font-medium">نودها</th>
                  <th className="px-3 py-2 text-start font-medium">وضعیت</th>
                  <th className="px-3 py-2 text-start font-medium">
                    لینک اشتراک
                  </th>
                  <th className="px-3 py-2 text-start font-medium">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {activeConfigs.map((config) => (
                  <tr
                    key={config.id}
                    className="border-t last:border-b-0 odd:bg-background even:bg-muted/20"
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{config.ownerName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {config.ownerDepartment ?? "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs">{config.label}</p>
                      <p
                        className="truncate text-[10px] text-muted-foreground"
                        dir="ltr"
                      >
                        {config.email}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                      {config.inboundIds.length}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          config.status === "active"
                            ? "bg-emerald-600/10 text-emerald-700"
                            : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {STATUS_LABELS[config.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <CopyLink url={config.subscriptionUrl} />
                    </td>
                    <td className="px-3 py-2">
                      <AdminForm
                        action={revokeConfig}
                        submitSlot={
                          <ConfirmSubmit
                            message={`کانفیگ «${config.email}» لغو و از پنل حذف شود؟`}
                          >
                            لغو کانفیگ
                          </ConfirmSubmit>
                        }
                      >
                        <input
                          type="hidden"
                          name="config_id"
                          value={config.id}
                        />
                        <input
                          type="hidden"
                          name="user_id"
                          value={config.ownerId}
                        />
                      </AdminForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">سهمیه کارمندان</h2>
          <p className="text-[11px] text-muted-foreground">
            پیش‌فرض هر کارمند یک کانفیگ است؛ مدیر تیم می‌تواند تا سقف تعیین‌شده
            آن را بالا ببرد.
          </p>
        </div>

        <div className="divide-y">
          {data.users.map((user) => (
            <div
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{user.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {user.department ?? "—"} · {ROLE_LABELS[toAppRole(user.role)]}{" "}
                  · {user.used} کانفیگ فعال
                </p>
              </div>

              <AdminForm
                action={setQuota}
                submitLabel="ذخیره"
                size="sm"
                className="flex items-end gap-2"
              >
                <input type="hidden" name="user_id" value={user.id} />
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  سهمیه
                  <Input
                    name="max_configs"
                    type="number"
                    min={1}
                    max={99}
                    dir="ltr"
                    defaultValue={user.quota ?? 99}
                    className="h-8 w-20 text-left tabular-nums"
                  />
                </label>
              </AdminForm>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConfigSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
