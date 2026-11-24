"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error?: string } | undefined;

const SignInSchema = z.object({
  username: z.string().trim().min(2),
  password: z.string().min(1),
  next: z.string().optional(),
});

const INVALID_CREDENTIALS = "نام کاربری یا رمز عبور نادرست است.";

export async function signIn(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = SignInSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return { error: "نام کاربری و رمز عبور را کامل وارد کنید." };
  }

  const admin = createAdminClient();
  const { data: email, error: lookupError } = await admin.rpc(
    "resolve_login_email",
    { p_username: parsed.data.username },
  );

  if (lookupError) {
    console.error("resolve_login_email failed", lookupError);
    return { error: "خطا در برقراری ارتباط با سرور. دوباره تلاش کنید." };
  }

  if (!email) {
    return { error: INVALID_CREDENTIALS };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: INVALID_CREDENTIALS };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "حساب شما غیرفعال است. با مدیر سیستم تماس بگیرید." };
  }

  if (profile?.must_change_password) {
    redirect("/change-password");
  }

  const next = parsed.data.next;
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
