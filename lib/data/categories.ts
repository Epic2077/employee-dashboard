import "server-only";

import { cache } from "react";

import { isMissingRelation } from "@/lib/data/errors";
import { createClient } from "@/lib/supabase/server";

export type CategoryRow = {
  id: string;
  module: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

/** Every category, including inactive ones; admin screens need both. */
export const getCategories = cache(async (): Promise<CategoryRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("access_categories")
    .select("id, module, slug, name, description, sort_order, is_active")
    .order("module", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (isMissingRelation(error)) {
    return [];
  }
  if (error) {
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    module: row.module,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
});

export function categoriesForModule(
  categories: CategoryRow[],
  module: string,
  options?: { includeInactive?: boolean },
): CategoryRow[] {
  return categories.filter(
    (category) =>
      category.module === module &&
      (options?.includeInactive || category.isActive),
  );
}

export function categoryName(
  categories: CategoryRow[],
  categoryId: string | null,
): string | null {
  if (!categoryId) return null;
  return categories.find((category) => category.id === categoryId)?.name ?? null;
}
