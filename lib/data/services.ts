import "server-only";

import {
  getPersianDaysInMonth,
  getTodayIsoDate,
  getTodayPersianParts,
  toIsoServiceDate,
} from "@/components/shared/persian-calendar";
import { requireUser } from "@/lib/auth/session";
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

/** Services the company offers today, plus the current user's own usage. */
export async function getServicesToday(): Promise<ServicesToday> {
  const claims = await requireUser();
  const supabase = await createClient();

  const todayIso = getTodayIsoDate();
  const today = getTodayPersianParts();
  const firstIso = toIsoServiceDate(today.year, today.month, 1);
  const lastIso = toIsoServiceDate(
    today.year,
    today.month,
    getPersianDaysInMonth(today.year, today.month),
  );

  const [servicesResult, ordersResult] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, slug, name, unit_label, description, price_irt, max_per_day, sort_order",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("service_orders")
      .select("service_id, service_date, quantity, unit_price_irt")
      .eq("user_id", claims.sub)
      .gte("service_date", firstIso)
      .lte("service_date", lastIso),
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

  const items: ServiceItem[] = (servicesResult.data ?? []).map((service) => {
    const own = orders.filter((order) => order.service_id === service.id);
    const todayOrder = own.find((order) => order.service_date === todayIso);

    return {
      id: service.id,
      slug: service.slug,
      name: service.name,
      unitLabel: service.unit_label,
      description: service.description,
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
