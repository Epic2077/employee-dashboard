import type { DailyMeal } from "@/components/shared/persian-calendar";

export type LunchWindow = {
  today: string;
  from: string;
  to: string;
};

export type LunchMonthData = {
  year: number;
  month: number;
  monthTitle: string;
  pricePerDayIrt: number;
  weeklyMenu: Record<number, DailyMeal>;
  overrides: Record<string, DailyMeal>;
  closedDates: string[];
  reservedDates: string[];
  window: LunchWindow;
};
