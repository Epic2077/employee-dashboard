import {
  CAPABILITY_DESCRIPTIONS,
  CAPABILITY_GROUPS,
  CAPABILITY_LABELS,
  CAPABILITY_SCOPES,
  CATEGORY_MODULES,
  CATEGORY_MODULE_LABELS,
  SCOPE_LABELS,
  type Capability,
} from "@/lib/auth/scopes";
import { adminFieldClass } from "@/lib/admin/styles";
import type { SubjectAccess } from "@/lib/data/admin-permissions";
import type { CategoryRow } from "@/lib/data/categories";

const GRANT_OPTIONS = [
  { value: "", label: "ارثی" },
  { value: "deny", label: "مسدود" },
];

function GrantSelect({
  name,
  capability,
  value,
}: {
  name: string;
  capability: Capability;
  value: string;
}) {
  return (
    <select
      name={name}
      defaultValue={value}
      className={`${adminFieldClass} h-7 text-[11px]`}
      aria-label={CAPABILITY_LABELS[capability]}
    >
      {GRANT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {CAPABILITY_SCOPES[capability]
        .filter((scope) => scope !== "none")
        .map((scope) => (
          <option key={scope} value={scope}>
            {SCOPE_LABELS[scope]}
          </option>
        ))}
    </select>
  );
}

function CategorySelect({
  name,
  capability,
  category,
  value,
}: {
  name: string;
  capability: Capability;
  category: CategoryRow;
  value: string;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-1 text-[10px]">
      <span className="text-muted-foreground">{category.name}</span>
      <select
        name={name}
        defaultValue={value}
        className="h-5 rounded border bg-background px-1 text-[10px]"
        aria-label={`${CAPABILITY_LABELS[capability]} — ${category.name}`}
      >
        <option value="">ارثی</option>
        <option value="grant">مجاز</option>
        <option value="deny">مسدود</option>
      </select>
    </label>
  );
}

/**
 * Capability matrix for a team, a team manager or a person. Field names are
 * `${prefix}:${capability}` and `${prefix}:cat:${capability}:${categoryId}`.
 */
export function AccessMatrix({
  prefix,
  access,
  categories,
}: {
  prefix: string;
  access: SubjectAccess;
  categories: CategoryRow[];
}) {
  return (
    <div className="space-y-4">
      {CAPABILITY_GROUPS.map((group) => (
        <section key={group.title} className="space-y-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground">
            {group.title}
          </h3>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[38rem] text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-start font-semibold">دسترسی</th>
                  <th className="px-2 py-2 font-semibold">سطح</th>
                  <th className="px-2 py-2 text-start font-semibold">
                    دسته‌ها
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.capabilities.map((capability) => {
                  const grant = access.capabilities[capability];
                  const categoryModule = CATEGORY_MODULES[capability];
                  const categoryOptions = categoryModule
                    ? categories.filter(
                        (category) =>
                          category.module === categoryModule &&
                          category.isActive,
                      )
                    : [];

                  return (
                    <tr key={capability} className="border-t align-top">
                      <td className="px-3 py-2">
                        <p className="font-medium">
                          {CAPABILITY_LABELS[capability]}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {CAPABILITY_DESCRIPTIONS[capability]}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <GrantSelect
                          name={`${prefix}:${capability}`}
                          capability={capability}
                          value={
                            grant
                              ? grant.mode === "deny"
                                ? "deny"
                                : grant.scope
                              : ""
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        {categoryOptions.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">
                            —
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {categoryOptions.map((category) => (
                              <CategorySelect
                                key={category.id}
                                name={`${prefix}:cat:${capability}:${category.id}`}
                                capability={capability}
                                category={category}
                                value={
                                  access.categories[capability]?.[category.id] ??
                                  ""
                                }
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export function CategoryModuleHeading({ module }: { module: string }) {
  return (
    <span className="text-[10px] text-muted-foreground">
      {CATEGORY_MODULE_LABELS[module] ?? module}
    </span>
  );
}
