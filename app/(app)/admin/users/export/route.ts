import { getAdminUsers } from "@/lib/data/admin-users";

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function tehranDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Excel-friendly export of the employee login list.
 * Password is the employee code (initial password set on provisioning).
 * UTF-8 BOM + quoted cells so Excel shows Persian text and keeps codes as text.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = url.searchParams.get("role");
  const department = url.searchParams.get("department");
  const q = url.searchParams.get("q") ?? "";

  const { users } = await getAdminUsers({ role, department, q });

  const lines: string[] = [];

  lines.push(
    [
      csvCell("ردیف"),
      csvCell("نام و نام خانوادگی"),
      csvCell("نام کاربری"),
      csvCell("رمز عبور (کد پرسنلی)"),
    ].join(","),
  );

  users.forEach((user, index) => {
    lines.push(
      [
        csvCell(index + 1),
        csvCell(user.fullName),
        csvCell(user.username),
        csvCell(user.employeeCode ?? ""),
      ].join(","),
    );
  });

  const body = `\uFEFF${lines.join("\r\n")}`;

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="users-credentials-${tehranDate()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
