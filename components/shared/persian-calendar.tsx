export interface DailyMeal {
  mainDish: string;
  sideOrDrink: string;
  tag?: string;
}

export type LockReason =
  | "past"
  | "today"
  | "not-open"
  | "too-far"
  | "friday"
  | "closed"
  | "no-menu";

export const LOCK_REASON_LABELS: Record<LockReason, string> = {
  past: "این روز گذشته است",
  today: "رزرو برای امروز بسته شده است",
  "not-open": "رزرو این روز هنوز باز نشده است",
  "too-far": "رزرو بیش از دو هفته آینده ممکن نیست",
  friday: "جمعه تعطیل است",
  closed: "سرویس غذا در این روز تعطیل است",
  "no-menu": "منویی برای این روز ثبت نشده است",
};

export interface DayCellData {
  id: string;
  /** ISO calendar date (Asia/Tehran) used as the database key. */
  isoDate: string;
  dayOfMonth: number;
  weekdayIndex: number; // 0 = شنبه ... 6 = جمعه
  weekdayName: string;
  fullPersianDate: string;
  isFriday: boolean;
  meal: DailyMeal | null;
  lockReason: LockReason | null;
}

export const PERSIAN_WEEKDAYS = [
  { index: 0, short: "ش", full: "شنبه", isFriday: false },
  { index: 1, short: "ی", full: "یکشنبه", isFriday: false },
  { index: 2, short: "د", full: "دوشنبه", isFriday: false },
  { index: 3, short: "س", full: "سه‌شنبه", isFriday: false },
  { index: 4, short: "چ", full: "چهارشنبه", isFriday: false },
  { index: 5, short: "پ", full: "پنجشنبه", isFriday: false },
  { index: 6, short: "ج", full: "جمعه", isFriday: true },
] as const;

export function formatToman(amount: number): string {
  return `${amount.toLocaleString("en-US")} تومان`;
}

export function getNumericPersianParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1405");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  return { year, month, day };
}

export function getTodayPersianParts() {
  return getNumericPersianParts(new Date());
}

function formatIsoDateInTehran(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Converts a Persian calendar date to the ISO date stored in Postgres. */
export function toIsoServiceDate(
  year: number,
  month: number,
  day: number,
): string {
  return formatIsoDateInTehran(findGregorianDateForPersian(year, month, day));
}

export function getTodayIsoDate(): string {
  return formatIsoDateInTehran(new Date());
}

/** Inverse of toIsoServiceDate: ISO date -> Persian calendar parts. */
export function getPersianPartsFromIso(isoDate: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = isoDate.split("-").map(Number);
  return getNumericPersianParts(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** Persian weekday index (0 = شنبه ... 6 = جمعه) for an ISO date. */
export function getWeekdayIndexFromIso(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 6));
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    weekday: "short",
  }).format(date);

  const map: Record<string, number> = {
    Sat: 0,
    Sun: 1,
    Mon: 2,
    Tue: 3,
    Wed: 4,
    Thu: 5,
    Fri: 6,
  };
  return map[weekdayShort] ?? 0;
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getPersianMonthName(year: number, month: number): string {
  // Anchor on the 15th of the Persian month by stepping from a known date in Asia/Tehran
  const anchor = findGregorianDateForPersian(year, month, 15);
  return new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
    calendar: "persian",
    timeZone: "Asia/Tehran",
    month: "long",
  }).format(anchor);
}

export function getPersianMonthYearTitle(year: number, month: number): string {
  return `${getPersianMonthName(year, month)} ${year}`;
}

export function formatLongPersianDate(
  year: number,
  month: number,
  day: number,
  weekdayIndex: number,
): string {
  const weekdayName = PERSIAN_WEEKDAYS[weekdayIndex]?.full ?? "";
  const monthName = getPersianMonthName(year, month);
  return `${weekdayName}، ${day} ${monthName} ${year}`;
}

const DAY_MS = 86_400_000;

/**
 * Finds the Gregorian Date for a Persian calendar date.
 *
 * The search runs over whole days anchored at midnight UTC (03:30 in Tehran),
 * so every probe lands on the same side of the Persian day boundary. Probing
 * at arbitrary times of day could skip the narrow pre-midnight window and made
 * some days fall back to the same date, producing duplicate keys and wrong
 * reservation dates.
 */
export function findGregorianDateForPersian(
  targetYear: number,
  targetMonth: number,
  targetDay: number,
): Date {
  const targetKey = targetYear * 10000 + targetMonth * 100 + targetDay;
  const start = Date.UTC(targetYear + 620, 0, 1);
  const end = Date.UTC(targetYear + 623, 0, 1);

  let low = 0;
  let high = Math.floor((end - start) / DAY_MS);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const date = new Date(start + mid * DAY_MS);
    const p = getNumericPersianParts(date);
    const midKey = p.year * 10000 + p.month * 100 + p.day;

    if (midKey === targetKey) {
      return date;
    }
    if (midKey < targetKey) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Should be unreachable: the range always covers a full Persian year.
  return new Date(Date.UTC(targetYear + 621, 2, 21));
}

/**
 * Returns the number of days in a Persian month (31 for 1..6, 30 for 7..11,
 * and 29 or 30 for Esfand depending on leap year).
 */
export function getPersianDaysInMonth(year: number, month: number): number {
  if (month >= 1 && month <= 6) return 31;
  if (month >= 7 && month <= 11) return 30;

  // Check if day 30 of month 12 exists in this Persian year
  const d30 = findGregorianDateForPersian(year, 12, 30);
  const p30 = getNumericPersianParts(d30);
  return p30.year === year && p30.month === 12 && p30.day === 30 ? 30 : 29;
}

/**
 * Returns weekday index (0 = شنبه ... 6 = جمعه) for day 1 of the given Persian month.
 */
export function getPersianStartWeekdayIndex(
  year: number,
  month: number,
): number {
  const firstDayDate = findGregorianDateForPersian(year, month, 1);
  // Get weekday in Asia/Tehran
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    weekday: "short",
  }).format(firstDayDate);

  const map: Record<string, number> = {
    Sat: 0,
    Sun: 1,
    Mon: 2,
    Tue: 3,
    Wed: 4,
    Thu: 5,
    Fri: 6,
  };
  return map[weekdayShort] ?? 0;
}

export function shiftPersianMonth(
  year: number,
  month: number,
  deltaMonths: number,
): { year: number; month: number } {
  const totalMonths = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (((totalMonths % 12) + 12) % 12) + 1;
  return { year: nextYear, month: nextMonth };
}
