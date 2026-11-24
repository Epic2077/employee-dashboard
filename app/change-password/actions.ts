"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ChangePasswordState = { error?: string } | undefined;

export async function changePassword(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const claims = await requireUser();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "رمز عبور باید حداقل ۸ کاراکتر باشد." };
  }
  if (password !== confirm) {
    return { error: "رمز عبور و تکرار آن یکسان نیست." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("updateUser(password) failed", error);
    return { error: "تغییر رمز عبور انجام نشد. دوباره تلاش کنید." };
  }

  const { error: profileError } = await createAdminClient()
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", claims.sub);

  if (profileError) {
    console.error("clearing must_change_password failed", profileError);
    return {
      error:
        "رمز عبور تغییر کرد اما وضعیت حساب به‌روزرسانی نشد. با مدیر سیستم تماس بگیرید.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
