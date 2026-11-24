import type { Database } from "./types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AppSettings = Database["public"]["Tables"]["app_settings"]["Row"];
export type WeeklyMenuRow = Database["public"]["Tables"]["weekly_menu"]["Row"];
export type MenuOverrideRow =
  Database["public"]["Tables"]["menu_overrides"]["Row"];
export type ReservationRow =
  Database["public"]["Tables"]["lunch_reservations"]["Row"];

export type ProfileRole = Profile["role"];
