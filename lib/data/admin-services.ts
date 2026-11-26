import "server-only";

import {
  PERSIAN_WEEKDAYS,
  getPersianDaysInMonth,
  getPersianMonthYearTitle,
  getPersianStartWeekdayIndex,
  getTodayIsoDate,
  toIsoServiceDate,
} from "@/components/shared/persian-calendar";
import { requireCapability } from "@/lib/auth/permissions";
import type { Scope } from "@/lib/auth/scopes";
import { isMissingRelation } from "@/lib/data/errors";
import { fetchScopedProfiles } from "@/lib/data/profiles";
import {
  departmentOptions,
  filterVisibleProfiles,
  matchesDepartment,
} from "@/lib/data/scope";
import type { ProfileRole } from "@/lib/supabase/models";
import { createClient } from "@/lib/supabase/server";

export type ServiceSummaryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  unitLabel: string;
  categoryId: string | null;
  priceIrt: number;
  maxPerDay: number;
  isActive: boolean;
  sortOrder: number;
  quantity: number;
  cost: number;
  todayQuantity: number;
};

export type ServiceDayRow = {
  isoDate: string;
  dayOfMonth: number;
  weekdayName: string;
  isFriday: boolean;
  quantity: number;
  cost: number;
};

export type ServiceEmployeeRow = {
  userId: string;
  name: string;
  department: string | null;
  role: ProfileRole;
  quantity: number;
  cost: number;
  byService: { name: string; unitLabel: string; quantity: number }[];
};

export type ServicesReport = {
  /** False until the services migration is applied. */
  available: boolean;
  year: number;
  month: number;
  monthTitle: string;
  scope: Scope;
  departments: string[];
  department: string | null;
  totalQuantity: number;
  totalCost: number;
  distinctEmployees: number;
  todayQuantity: number;
  services: ServiceSummaryRow[];
  perDay: ServiceDayRow[];
  perEmployee: ServiceEmployeeRow[];
};

export async function getServicesReport({
  year,
  month,
  department = null,
}: {
  year: number;
  month: number;
  department?: string | null;
}): Promise<ServicesReport> {
  const access = await requireCapability("reports.services");
  const scope = access.scopes["reports.services"];

  const supabase = await createClient();
  const daysInMonth = getPersianDaysInMonth(year, month);
  const firstIso = toIsoServiceDate(year, month, 1);
  const lastIso = toIsoServiceDate(year, month, daysInMonth);
  const todayIso = getTodayIsoDate();

  const [servicesResult, profiles] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, slug, name, unit_label, description, price_irt, max_per_day, is_active, sort_order, category_id",
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    fetchScopedProfiles(supabase),
  ]);

  const scopedProfiles = filterVisibleProfiles(profiles, access, scope);
  const departments = departmentOptions(scopedProfiles);
  const selectedDepartment =
    department && department.trim() ? department.trim() : null;
  const visibleProfiles = selectedDepartment
    ? scopedProfiles.filter((profile) =>
        matchesDepartment(profile, selectedDepartment),
      )
    : scopedProfiles;

  const empty: ServicesReport = {
    available: false,
    year,
    month,
    monthTitle: getPersianMonthYearTitle(year, month),
    scope,
    departments,
    department: selectedDepartment,
    totalQuantity: 0,
    totalCost: 0,
    distinctEmployees: 0,
    todayQuantity: 0,
    services: [],
    perDay: [],
    perEmployee: [],
  };

  if (isMissingRelation(servicesResult.error)) {
    return empty;
  }
  if (servicesResult.error) {
    throw new Error(
      `Failed to load services report: ${servicesResult.error.message}`,
    );
  }

  const allServices = servicesResult.data ?? [];
  const visibleIds = visibleProfiles.map((profile) => profile.id);
  const isGlobal = scope === "all" && !selectedDepartment;

  let orders: {
    user_id: string;
    service_id: string;
    service_date: string;
    quantity: number;
    unit_price_irt: number;
  }[] = [];

  if (isGlobal || visibleIds.length > 0) {
    let ordersQuery = supabase
      .from("service_orders")
      .select("user_id, service_id, service_date, quantity, unit_price_irt")
      .gte("service_date", firstIso)
      .lte("service_date", lastIso);

    if (!isGlobal) {
      ordersQuery = ordersQuery.in("user_id", visibleIds);
    }

    const result = await ordersQuery;
    if (isMissingRelation(result.error)) {
      return empty;
    }
    if (result.error) {
      throw new Error(
        `Failed to load services report: ${result.error.message}`,
      );
    }
    orders = result.data ?? [];
  }

  const serviceById = new Map(
    allServices.map((service) => [service.id, service]),
  );
  const byDate = new Map<string, { quantity: number; cost: number }>();
  const byEmployee = new Map<
    string,
    { quantity: number; cost: number; byService: Map<string, number> }
  >();

  for (const order of orders) {
    const day = byDate.get(order.service_date) ?? { quantity: 0, cost: 0 };
    day.quantity += order.quantity;
    day.cost += order.quantity * order.unit_price_irt;
    byDate.set(order.service_date, day);

    const employee = byEmployee.get(order.user_id) ?? {
      quantity: 0,
      cost: 0,
      byService: new Map<string, number>(),
    };
    employee.quantity += order.quantity;
    employee.cost += order.quantity * order.unit_price_irt;
    employee.byService.set(
      order.service_id,
      (employee.byService.get(order.service_id) ?? 0) + order.quantity,
    );
    byEmployee.set(order.user_id, employee);
  }

  const services: ServiceSummaryRow[] = allServices.map((service) => {
    const own = orders.filter((order) => order.service_id === service.id);
    const todayOwn = own.filter((order) => order.service_date === todayIso);

    return {
      id: service.id,
      slug: service.slug,
      name: service.name,
      description: service.description,
      unitLabel: service.unit_label,
      categoryId: service.category_id,
      priceIrt: service.price_irt,
      maxPerDay: service.max_per_day,
      isActive: service.is_active,
      sortOrder: service.sort_order,
      quantity: own.reduce((sum, order) => sum + order.quantity, 0),
      cost: own.reduce(
        (sum, order) => sum + order.quantity * order.unit_price_irt,
        0,
      ),
      todayQuantity: todayOwn.reduce((sum, order) => sum + order.quantity, 0),
    };
  });

  const startWeekday = getPersianStartWeekdayIndex(year, month);
  const perDay: ServiceDayRow[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const weekdayIndex = (startWeekday + day - 1) % 7;
    const weekdayMeta = PERSIAN_WEEKDAYS[weekdayIndex];
    const isoDate = toIsoServiceDate(year, month, day);
    const stats = byDate.get(isoDate);

    perDay.push({
      isoDate,
      dayOfMonth: day,
      weekdayName: weekdayMeta.full,
      isFriday: weekdayMeta.isFriday,
      quantity: stats?.quantity ?? 0,
      cost: stats?.cost ?? 0,
    });
  }

  const profileById = new Map(
    visibleProfiles.map((profile) => [profile.id, profile]),
  );

  const perEmployee: ServiceEmployeeRow[] = [...byEmployee.entries()]
    .map(([userId, totals]) => {
      const profile = profileById.get(userId);
      return {
        userId,
        name: profile?.full_name ?? "کاربر حذف‌شده",
        department: profile?.department ?? null,
        role: profile?.role ?? "employee",
        quantity: totals.quantity,
        cost: totals.cost,
        byService: [...totals.byService.entries()]
          .map(([serviceId, quantity]) => {
            const service = serviceById.get(serviceId);
            return {
              name: service?.name ?? "سرویس حذف‌شده",
              unitLabel: service?.unit_label ?? "عدد",
              quantity,
            };
          })
          .sort((a, b) => b.quantity - a.quantity),
      };
    })
    .sort(
      (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "fa"),
    );

  return {
    available: true,
    year,
    month,
    monthTitle: getPersianMonthYearTitle(year, month),
    scope,
    departments,
    department: selectedDepartment,
    totalQuantity: orders.reduce((sum, order) => sum + order.quantity, 0),
    totalCost: orders.reduce(
      (sum, order) => sum + order.quantity * order.unit_price_irt,
      0,
    ),
    distinctEmployees: byEmployee.size,
    todayQuantity: orders
      .filter((order) => order.service_date === todayIso)
      .reduce((sum, order) => sum + order.quantity, 0),
    services,
    perDay,
    perEmployee,
  };
}
