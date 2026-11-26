import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeftIcon, SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getPeopleAccessData } from "@/lib/data/admin-permissions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PeoplePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PeopleSkeleton />}>
      <PeopleView searchParams={searchParams} />
    </Suspense>
  );
}

async function PeopleView({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const { people, available } = await getPeopleAccessData({ q });

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
        <h1 className="text-lg font-bold tracking-tight">استثناهای افراد</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          برای هر نفر می‌توانید دسترسی‌ای مستقل از نقش و تیم تعریف کنید؛ این
          استثنا حرف آخر را می‌زند و می‌تواند دسترسی بدهد یا بگیرد.
        </p>
      </div>

      {!available ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          جدول دسترسی‌ها هنوز روی دیتابیس ساخته نشده است.
        </div>
      ) : null}

      <form method="get" className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="جستجوی نام یا واحد سازمانی"
            className="h-9 pe-9 text-xs"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md border px-3 text-xs hover:bg-muted"
        >
          جستجو
        </button>
        {q ? (
          <Link
            href="/admin/permissions/people"
            className="h-9 rounded-md px-3 text-xs leading-9 text-muted-foreground hover:bg-muted"
          >
            پاک کردن
          </Link>
        ) : null}
      </form>

      {people.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          کاربری با این مشخصات پیدا نشد.
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {people.map((person) => (
            <Link
              key={person.id}
              href={`/admin/permissions/people/${person.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {person.fullName}
                  {!person.isActive ? (
                    <span className="ms-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      غیرفعال
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {[person.department, ROLE_LABELS[person.role]]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    person.exceptionCount > 0
                      ? "rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                      : "rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                  }
                >
                  {person.exceptionCount} استثنا
                </span>
                <ChevronLeftIcon className="size-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 w-80 animate-pulse rounded-lg bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
