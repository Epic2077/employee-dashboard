"use server";

import { revalidatePath } from "next/cache";

import type { AdminFormState } from "@/lib/admin/types";
import { getMyAccess } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { provisionConfig } from "@/lib/digital/provision";

/** Employee self-service: create the config allowed by their quota. */
export async function createMyConfig(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  // The employee form carries no fields; submitting it is the whole request.
  void formData;
  await requireUser();

  const access = await getMyAccess();
  const result = await provisionConfig({
    actor: access,
    targetUserId: access.userId,
    mode: "self",
  });

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath("/");
  revalidatePath("/admin/config");
  return { ok: `کانفیگ «${result.email}» ساخته شد.` };
}
