import { getDailyList } from "@/lib/data/admin-daily";
import { ROLE_LABELS } from "@/lib/auth/roles";

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Excel-friendly export of one day's lunch list.
 * UTF-8 BOM + quoted cells so Excel shows Persian text correctly.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("d");
  const list = await getDailyList({ date });

  const lines: string[] = [];

  lines.push([csvCell("تاریخ"), csvCell(list.label)].join(","));
  lines.push([csvCell("غذای روز"), csvCell(list.dish ?? "—")].join(","));
  lines.push(
    [
      csvCell("تعداد رزرو"),
      csvCell(list.reserved),
      csvCell("نفر از"),
      csvCell(list.employees.length),
    ].join(","),
  );
  lines.push("");
  lines.push(
    [
      csvCell("ردیف"),
      csvCell("نام و نام خانوادگی"),
      csvCell("کد پرسنلی"),
      csvCell("واحد سازمانی"),
      csvCell("نقش"),
      csvCell("وضعیت"),
      csvCell("مبلغ (تومان)"),
    ].join(","),
  );

  list.employees.forEach((employee, index) => {
    lines.push(
      [
        csvCell(index + 1),
        csvCell(employee.name),
        csvCell(employee.employeeCode ?? ""),
        csvCell(employee.department ?? ""),
        csvCell(ROLE_LABELS[employee.role]),
        csvCell(employee.reservationId ? "رزرو شده" : "بدون رزرو"),
        csvCell(
          employee.reservationId ? (employee.priceIrt ?? list.priceIrt) : 0,
        ),
      ].join(","),
    );
  });

  lines.push("");
  lines.push(
    [
      csvCell("جمع"),
      csvCell(list.reserved),
      csvCell("وعده"),
      csvCell(list.totalCost),
    ].join(","),
  );

  const body = `\uFEFF${lines.join("\r\n")}`;

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lunch-${list.isoDate}.csv"`,
      "cache-control": "no-store",
    },
  });
}
