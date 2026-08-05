"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isOwnerEmail } from "@/lib/auth/owner";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(6) });

export type LoginState = { error?: string };

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "请输入有效邮箱和至少 6 位密码。" };
  if (!isSupabaseConfigured) return { error: "系统尚未完成 Supabase 配置。" };
  if (!isOwnerEmail(parsed.data.email)) return { error: "该账户无权访问此私人系统。" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "登录失败，请检查邮箱和密码。" };
  redirect("/today");
}

export async function logoutAction() {
  if (isSupabaseConfigured) (await createClient()).auth.signOut();
  redirect("/login");
}
