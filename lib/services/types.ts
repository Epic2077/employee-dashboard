export type ServiceItem = {
  id: string;
  slug: string;
  name: string;
  unitLabel: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  priceIrt: number;
  maxPerDay: number;
  /** Quantity ordered by the current user today. */
  todayQuantity: number;
  /** Quantity ordered by the current user this month. */
  monthQuantity: number;
  monthCost: number;
};

export type ServicesToday = {
  available: boolean;
  todayIso: string;
  items: ServiceItem[];
  monthQuantity: number;
  monthCost: number;
};

export type ServicesFormState = { ok?: string; error?: string } | undefined;
