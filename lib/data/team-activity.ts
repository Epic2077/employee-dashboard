import "server-only";

import {
  getPersianDaysInMonth,
  getPersianMonthYearTitle,
  toIsoServiceDate,
} from "@/components/shared/persian-calendar";
import { requireCapability } from "@/lib/auth/permissions";
import type { Scope } from "@/lib/auth/scopes";
import { isMissingRelation } from "@/lib/data/errors";
import { fetchScopedProfiles } from "@/lib/data/profiles";
import { filterVisibleProfiles } from "@/lib/data/scope";
import type { ProfileRole } from "@/lib/supabase/models";
import { createClient } from "@/lib/supabase/server";

export type TeamActivityMember = {
  userId: string;
  name: string;
  department: string | null;
  role: ProfileRole;
  lunchDays: number;
  lunchCost: number;
  serviceQuantity: number;
  serviceCost: number;
  activeConfigs: number;
  lastActivity: string | null;
};

export type TeamActivityItem = {
  id: string;
  kind: "lunch" | "service" | "config";
  userId: string;
  userName: string;
  /** Service date for lunch/services, created date for a config. */
  date: string;
  title: string;
  detail: string;
  amount: number | null;
};

export type TeamActivityData = {
  year: number;
  month: number;
  monthTitle: string;
  scope: Scope;
  canLunch: boolean;
  canServices: boolean;
  canConfigs: boolean;
  members: TeamActivityMember[];
  visibleMembers: { userId: string; name: string }[];
  items: TeamActivityItem[];
  selectedMember: string | null;
};

const FEED_LIMIT = 200;

export async function getTeamActivity({
  year,
  month,
  memberId = null,
}: {
  year: number;
  month: number;
  memberId?: string | null;
}): Promise<TeamActivityData> {
  const access = await requireCapability("team.activity");
  const scope = access.scopes["team.activity"];
  const supabase = await createClient();

  const canLunch = access.scopes["reports.lunch"] !== "none";
  const canServices = access.scopes["reports.services"] !== "none";
  const canConfigs = access.scopes["digital.manage"] !== "none";

  const daysInMonth = getPersianDaysInMonth(year, month);
  const firstIso = toIsoServiceDate(year, month, 1);
  const lastIso = toIsoServiceDate(year, month, daysInMonth);

  const allProfiles = await fetchScopedProfiles(supabase);
  const profiles = filterVisibleProfiles(allProfiles, access, scope).filter(
    (profile) => profile.is_active,
  );

  const selectedMember =
    memberId && profiles.some((profile) => profile.id === memberId)
      ? memberId
      : null;
  const activeProfiles = selectedMember
    ? profiles.filter((profile) => profile.id === selectedMember)
    : profiles;
  const activeIds = activeProfiles.map((profile) => profile.id);

  const [reservationsResult, ordersResult, configsResult, servicesResult] =
    await Promise.all([
      canLunch && activeIds.length > 0
        ? supabase
            .from("lunch_reservations")
            .select("id, user_id, service_date, price_irt")
            .gte("service_date", firstIso)
            .lte("service_date", lastIso)
            .in("user_id", activeIds)
        : Promise.resolve({ data: [], error: null }),
      canServices && activeIds.length > 0
        ? supabase
            .from("service_orders")
            .select(
              "id, user_id, service_id, service_date, quantity, unit_price_irt",
            )
            .gte("service_date", firstIso)
            .lte("service_date", lastIso)
            .in("user_id", activeIds)
        : Promise.resolve({ data: [], error: null }),
      canConfigs && activeIds.length > 0
        ? supabase
            .from("v2ray_configs")
            .select("id, user_id, label, status, created_at")
            .in("user_id", activeIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("services").select("id, name, unit_label"),
    ]);

  const reservations = isMissingRelation(reservationsResult.error)
    ? []
    : (reservationsResult.data ?? []);
  const orders = isMissingRelation(ordersResult.error)
    ? []
    : (ordersResult.data ?? []);
  const configs = isMissingRelation(configsResult.error)
    ? []
    : (configsResult.data ?? []);
  const services = isMissingRelation(servicesResult.error)
    ? []
    : (servicesResult.data ?? []);

  const serviceById = new Map(services.map((service) => [service.id, service]));
  const profileById = new Map(
    activeProfiles.map((profile) => [profile.id, profile]),
  );

  const members: TeamActivityMember[] = activeProfiles.map((profile) => {
    const ownReservations = reservations.filter(
      (row) => row.user_id === profile.id,
    );
    const ownOrders = orders.filter((row) => row.user_id === profile.id);
    const ownConfigs = configs.filter((row) => row.user_id === profile.id);
    const dates = [
      ...ownReservations.map((row) => row.service_date),
      ...ownOrders.map((row) => row.service_date),
      ...ownConfigs.map((row) => row.created_at.slice(0, 10)),
    ].sort();

    return {
      userId: profile.id,
      name: profile.full_name,
      department: profile.department,
      role: profile.role,
      lunchDays: ownReservations.length,
      lunchCost: ownReservations.reduce(
        (sum, row) => sum + row.price_irt,
        0,
      ),
      serviceQuantity: ownOrders.reduce((sum, row) => sum + row.quantity, 0),
      serviceCost: ownOrders.reduce(
        (sum, row) => sum + row.quantity * row.unit_price_irt,
        0,
      ),
      activeConfigs: ownConfigs.filter((row) => row.status === "active").length,
      lastActivity: dates.length > 0 ? dates[dates.length - 1] : null,
    };
  });

  const items: TeamActivityItem[] = [];

  for (const row of reservations) {
    items.push({
      id: `lunch-${row.id}`,
      kind: "lunch",
      userId: row.user_id,
      userName: profileById.get(row.user_id)?.full_name ?? "—",
      date: row.service_date,
      title: "رزرو ناهار",
      detail: "یک وعده ناهار",
      amount: row.price_irt,
    });
  }

  for (const row of orders) {
    const service = serviceById.get(row.service_id);
    items.push({
      id: `service-${row.id}`,
      kind: "service",
      userId: row.user_id,
      userName: profileById.get(row.user_id)?.full_name ?? "—",
      date: row.service_date,
      title: `سفارش ${service?.name ?? "سرویس"}`,
      detail: `${row.quantity} ${service?.unit_label ?? "عدد"}`,
      amount: row.quantity * row.unit_price_irt,
    });
  }

  for (const row of configs) {
    if (row.created_at.slice(0, 10) < firstIso || row.created_at.slice(0, 10) > lastIso) {
      continue;
    }
    items.push({
      id: `config-${row.id}`,
      kind: "config",
      userId: row.user_id,
      userName: profileById.get(row.user_id)?.full_name ?? "—",
      date: row.created_at,
      title: "کانفیگ V2Ray",
      detail: `${row.label} · ${row.status === "active" ? "فعال" : row.status}`,
      amount: null,
    });
  }

  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    year,
    month,
    monthTitle: getPersianMonthYearTitle(year, month),
    scope,
    canLunch,
    canServices,
    canConfigs,
    members: members.sort(
      (a, b) =>
        b.lunchDays + b.serviceQuantity - (a.lunchDays + a.serviceQuantity) ||
        a.name.localeCompare(b.name, "fa"),
    ),
    visibleMembers: profiles
      .map((profile) => ({ userId: profile.id, name: profile.full_name }))
      .sort((a, b) => a.name.localeCompare(b.name, "fa")),
    items: items.slice(0, FEED_LIMIT),
    selectedMember,
  };
}
