import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { PhoneIcon, SearchIcon, UsersIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { DirectoryEntry } from "@/lib/data/directory";
import { getDirectory } from "@/lib/data/directory";
import { cn, getInitials } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DirectoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<DirectorySkeleton />}>
      <DirectoryView searchParams={searchParams} />
    </Suspense>
  );
}

async function DirectoryView({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const data = await getDirectory({ q });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">فهرست همکاران</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            شماره تماس، واحد و نقش همه کارکنان؛ بخش «تیم من» اعضای تیم شما را
            جدا نشان می‌دهد.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary tabular-nums">
          {data.total} نفر
        </span>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={data.q}
            placeholder="جستجو بر اساس نام، واحد یا شماره تماس"
            className="h-9 pe-9 text-xs"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md border px-3 text-xs hover:bg-muted"
        >
          جستجو
        </button>
        {data.q ? (
          <Link
            href="/directory"
            className="h-9 rounded-md px-3 text-xs leading-9 text-muted-foreground hover:bg-muted"
          >
            پاک کردن
          </Link>
        ) : null}
      </form>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <UsersIcon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">تیم من</h2>
          {data.teamNames.length > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {data.teamNames.join(" · ")}
            </span>
          ) : null}
        </div>

        {data.team.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            {data.teamNames.length === 0
              ? "واحد سازمانی برای شما ثبت نشده است، بنابراین تیمی نمایش داده نمی‌شود."
              : "در تیم شما کارمند دیگری پیدا نشد."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.team.map((entry) => (
              <PersonCard key={entry.id} entry={entry} highlight />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">همه کارکنان</h2>

        {data.everyone.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            کارمندی با این مشخصات پیدا نشد.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start font-medium">نام</th>
                    <th className="px-4 py-2 text-start font-medium">
                      واحد سازمانی
                    </th>
                    <th className="px-4 py-2 text-start font-medium">نقش</th>
                    <th className="px-4 py-2 text-start font-medium">
                      شماره تماس
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.everyone.map((entry) => (
                    <tr
                      key={entry.id}
                      className={cn(
                        "border-t last:border-b-0 odd:bg-background even:bg-muted/20",
                        entry.isTeamMember ? "bg-primary/5" : "",
                      )}
                    >
                      <td className="px-4 py-2">
                        <span className="font-medium">{entry.fullName}</span>
                        {entry.isTeamMember ? (
                          <span className="ms-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            تیم من
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {entry.department ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {ROLE_LABELS[entry.role]}
                      </td>
                      <td className="px-4 py-2">
                        <PhoneLink phone={entry.phone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {data.everyone.map((entry) => (
                <PersonCard key={entry.id} entry={entry} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <a
      href={`tel:${phone}`}
      dir="ltr"
      className="inline-flex items-center gap-1 text-xs tabular-nums text-primary hover:underline"
    >
      <PhoneIcon className="size-3" />
      {phone}
    </a>
  );
}

function PersonCard({
  entry,
  highlight,
}: {
  entry: DirectoryEntry;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border bg-card p-3",
        highlight ? "border-primary/30 bg-primary/5" : "",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar>
          <AvatarFallback>{getInitials(entry.fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{entry.fullName}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {[entry.department, ROLE_LABELS[entry.role]]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <PhoneLink phone={entry.phone} />
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 w-80 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
