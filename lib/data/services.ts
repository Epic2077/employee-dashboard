import "server-only";

import {
  getPersianDaysInMonth,
  getTodayIsoDate,
  getTodayPersianParts,
  toIsoServiceDate,
} from "@/components/shared/persian-calendar";
import { requireCapability } from "@/lib/auth/permissions";
import { categoryName, getCategories } from "@/lib/data/categories";
import { isMissingRelation } from "@/lib/data/errors";
import type { ServiceItem, ServicesToday } from "@/lib/services/types";
import { createClient } from "@/lib/supabase/server";

const EMPTY: ServicesToday = {
  available: false,
  todayIso: "",
  items: [],
  monthQuantity: 0,
  monthCost: 0,
};

type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  unit_label: string;
  description: string | null;
  price_irt: number;
  max_per_day: number;
  sort_order: number;
  category_id: string | null;
};

const SERVICE_COLUMNS =
  "id, slug, name, unit_label, description, price_irt, max_per_day, sort_order, category_id";

/** Services the company offers today, plus the current user's own usage. */
export async function getServicesToday(): Promise<ServicesToday> {
  const access = await requireCapability("services.view");
  const supabase = await createClient();

  const todayIso = getTodayIsoDate();
  const today = getTodayPersianParts();
  const firstIso = toIsoServiceDate(today.year, today.month, 1);
  const lastIso = toIsoServiceDate(
    today.year,
    today.month,
    getPersianDaysInMonth(today.year, today.month),
  );

  const [servicesResult, ordersResult, categories] = await Promise.all([
    supabase
      .from("services")
      .select(SERVICE_COLUMNS)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("service_orders")
      .select("service_id, service_date, quantity, unit_price_irt")
      .eq("user_id", access.userId)
      .gte("service_date", firstIso)
      .lte("service_date", lastIso),
    getCategories(),
  ]);

  // Until the services migration is applied, keep the page usable.
  if (
    isMissingRelation(servicesResult.error) ||
    isMissingRelation(ordersResult.error)
  ) {
    return { ...EMPTY, todayIso };
  }

  const firstError = servicesResult.error ?? ordersResult.error;
  if (firstError) {
    throw new Error(`Failed to load services: ${firstError.message}`);
  }

  const orders = ordersResult.data ?? [];

  const serviceRows = (servicesResult.data ?? []) as ServiceRow[];

  const items: ServiceItem[] = serviceRows
    .filter(
      (service) =>
        access.categoryScope("services.view", service.category_id) !== "none",
    )
    .map((service) => {
      const own = orders.filter((order) => order.service_id === service.id);
      const todayOrder = own.find((order) => order.service_date === todayIso);

      return {
        id: service.id,
        slug: service.slug,
        name: service.name,
        unitLabel: service.unit_label,
        description: service.description,
        categoryId: service.category_id,
        categoryName: categoryName(categories, service.category_id),
        priceIrt: service.price_irt,
        maxPerDay: service.max_per_day,
        todayQuantity: todayOrder?.quantity ?? 0,
        monthQuantity: own.reduce((sum, order) => sum + order.quantity, 0),
        monthCost: own.reduce(
          (sum, order) => sum + order.quantity * order.unit_price_irt,
          0,
        ),
      };
    });

  return {
    available: true,
    todayIso,
    items,
    monthQuantity: items.reduce((sum, item) => sum + item.monthQuantity, 0),
    monthCost: items.reduce((sum, item) => sum + item.monthCost, 0),
  };
}