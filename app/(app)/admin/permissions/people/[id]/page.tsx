import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChevronLeftIcon } from "lucide-react";

import { AccessMatrix } from "@/components/admin/access-matrix";
import { AdminForm } from "@/components/admin/admin-form";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import {
  CATEGORY_MODULE_LABELS,
  CAPABILITY_GROUPS,
  CAPABILITY_LABELS,
  SCOPE_TAGS,
  type Capability,
} from "@/lib/auth/scopes";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getPersonAccessData } from "@/lib/data/admin-permissions";

import { clearUserGrants, saveUserGrants } from "../../actions";

type Params = Promise<{ id: string }>;

export default function PersonAccessPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PersonSkeleton />}>
      <PersonAccessView params={params} />
    </Suspense>
  );
}

async function PersonAccessView({ params }: { params: Params }) {
  await connection();

  const { id } = await params;
  const data = await getPersonAccessData(id);

  if (!data) {
    notFound();
  }

  const hasEffectiveAccess = (capability: Capability) =>
    data.effective[capability] !== "none" ||
    Object.values(data.effectiveCategories[capability] ?? {}).some(
      (scope) => scope !== "none",
    );

  const allowedGroups = CAPABILITY_GROUPS.map((group) => ({
    ...group,
    capabilities: group.capabilities.filter(hasEffectiveAccess),
  })).filter((group) => group.capabilities.length > 0);

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <Link
          href="/admin/permissions/people"
          className="mb-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3 rotate-180" />
          بازگشت به فهرست افراد
        </Link>
        <h1 className="text-lg font-bold tracking-tight">{data.person.fullName}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {[data.person.department, ROLE_LABELS[data.person.role]]
            .filter(Boolean)
            .join(" · ")}
          {data.person.isActive ? "" : " · حساب غیرفعال"}
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">دسترسی مؤثر فعلی</h2>
          <p className="text-[11px] text-muted-foreground">
            حاصل جمع نقش، تیم، مدیر تیم و استثناهای این فرد.
          </p>
        </div>

        {allowedGroups.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            این کاربر در حال حاضر به هیچ بخشی دسترسی ندارد.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {allowedGroups.map((group) => (
              <div key={group.title} className="rounded-xl border bg-card p-4">
                <h3 className="text-[11px] font-semibold text-muted-foreground">
                  {group.title}
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {group.capabilities.map((capability) => (
                    <li
                      key={capability}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span>{CAPABILITY_LABELS[capability]}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        {data.effective[capability] === "none"
                          ? "دسته‌های انتخابی"
                          : SCOPE_TAGS[data.effective[capability]]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {Object.keys(data.effectiveCategories).length > 0 ? (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-[11px] font-semibold text-muted-foreground">
              دسترسی دسته‌ها
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(data.effectiveCategories).flatMap(
                ([capability, scopes]) =>
                  Object.entries(scopes ?? {}).map(([categoryId, scope]) => {
                    const category = data.categories.find(
                      (item) => item.id === categoryId,
                    );
                    if (!category) return null;
                    return (
                      <span
                        key={`${capability}-${categoryId}`}
                        className="rounded-full border px-2 py-0.5 text-[10px]"
                      >
                        {CAPABILITY_LABELS[capability as Capability]}
                        {" · "}
                        {CATEGORY_MODULE_LABELS[category.module] ?? category.module}
                        {" · "}
                        {category.name}: {SCOPE_TAGS[scope]}
                      </span>
                    );
                  }),
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">استثناهای این فرد</h2>
          <p className="text-[11px] text-muted-foreground">
            «ارثی» یعنی از نقش/تیم گرفته شود، «مجاز» دسترسی می‌دهد و «مسدود»
            دسترسی را می‌گیرد. برای هر دسته می‌توانید جداگانه تصمیم بگیرید.
          </p>
        </div>

        <AdminForm
          action={saveUserGrants}
          submitLabel="ذخیره استثناها"
          className="space-y-4"
        >
          <input type="hidden" name="user_id" value={data.person.id} />
          <AccessMatrix
            prefix="user"
            access={data.exceptions}
            categories={data.categories}
          />
        </AdminForm>

        <div className="rounded-xl border border-dashed bg-muted/20 p-4">
          <AdminForm
            action={clearUserGrants}
            submitSlot={
              <ConfirmSubmit message="همه استثناهای این کاربر حذف شود؟ دسترسی او به نقش و تیم برمی‌گردد.">
                حذف همه استثناها
              </ConfirmSubmit>
            }
          >
            <input type="hidden" name="user_id" value={data.person.id} />
          </AdminForm>
        </div>
      </section>
    </div>
  );
}

function PersonSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
