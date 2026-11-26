import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChevronLeftIcon } from "lucide-react";

import { AccessMatrix } from "@/components/admin/access-matrix";
import { AdminForm } from "@/components/admin/admin-form";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Input } from "@/components/ui/input";
import { adminFieldClass } from "@/lib/admin/styles";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getTeamAccessData } from "@/lib/data/admin-permissions";

import { deleteTeam, saveTeamGrants, updateTeam } from "../../actions";

type Params = Promise<{ id: string }>;

export default function TeamAccessPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <TeamAccessView params={params} />
    </Suspense>
  );
}

async function TeamAccessView({ params }: { params: Params }) {
  await connection();

  const { id } = await params;
  const data = await getTeamAccessData(id);

  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <Link
          href="/admin/permissions/teams"
          className="mb-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3 rotate-180" />
          بازگشت به تیم‌ها
        </Link>
        <h1 className="text-lg font-bold tracking-tight">{data.team.name}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data.team.memberCount} عضو · مدیر: {data.team.managerName ?? "تعیین نشده"}
        </p>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">تنظیمات تیم</h2>
        <AdminForm
          action={updateTeam}
          submitLabel="ذخیره تیم"
          size="sm"
          className="space-y-3"
        >
          <input type="hidden" name="team_id" value={data.team.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">نام تیم</span>
              <Input name="name" defaultValue={data.team.name} required />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">مدیر تیم</span>
              <select
                name="manager_id"
                defaultValue={data.team.managerId ?? ""}
                className={adminFieldClass}
              >
                <option value="">بدون مدیر</option>
                {data.managers.map((manager) => (
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
                message={`تیم «${data.team.name}» حذف شود؟ اعضا بدون تیم می‌شوند و دسترسی‌های تیمی آن پاک می‌شود.`}
              >
                حذف تیم
              </ConfirmSubmit>
            }
          >
            <input type="hidden" name="team_id" value={data.team.id} />
          </AdminForm>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">دسترسی اعضای تیم</h2>
          <p className="text-[11px] text-muted-foreground">
            این دسترسی‌ها روی همه اعضای تیم اعمال می‌شود و با دسترسی نقش آن‌ها
            جمع می‌شود. «مسدود» می‌تواند دسترسی نقش را محدود کند.
          </p>
        </div>
        <AdminForm
          action={saveTeamGrants}
          submitLabel="ذخیره دسترسی اعضا"
          className="space-y-4"
        >
          <input type="hidden" name="team_id" value={data.team.id} />
          <input type="hidden" name="target" value="member" />
          <AccessMatrix
            prefix="member"
            access={data.memberAccess}
            categories={data.categories}
          />
        </AdminForm>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">دسترسی مدیر تیم</h2>
          <p className="text-[11px] text-muted-foreground">
            این دسترسی‌ها فقط برای کسی است که به‌عنوان مدیر این تیم انتخاب شده
            است، حتی اگر نقش حساب او «کارمند» باشد.
          </p>
        </div>
        <AdminForm
          action={saveTeamGrants}
          submitLabel="ذخیره دسترسی مدیر"
          className="space-y-4"
        >
          <input type="hidden" name="team_id" value={data.team.id} />
          <input type="hidden" name="target" value="manager" />
          <AccessMatrix
            prefix="manager"
            access={data.managerAccess}
            categories={data.categories}
          />
        </AdminForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">اعضای تیم</h2>
        {data.members.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            عضوی برای این تیم ثبت نشده است. واحد سازمانی کاربران را از صفحه
            کاربران تنظیم کنید.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">نام</th>
                  <th className="px-4 py-2 text-start font-medium">کد پرسنلی</th>
                  <th className="px-4 py-2 text-start font-medium">نقش</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{member.fullName}</td>
                    <td className="px-4 py-2 text-muted-foreground" dir="ltr">
                      {member.employeeCode ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {ROLE_LABELS[member.role]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
