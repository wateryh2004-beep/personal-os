"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isOwnerEmail } from "@/lib/auth/owner";
import { resolveRecoveryOrigin } from "@/lib/auth/recovery-origin";
import { env, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
const recoverySchema = z.object({
  email: z.string().email(),
});
const updatePasswordSchema = z.object({
  password: z.string().min(10),
  confirmPassword: z.string().min(10),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "两次输入的密码不一致。",
});

export type LoginState = { error?: string; message?: string };
export type PasswordRecoveryState = { error?: string; message?: string };
export type UpdatePasswordState = { error?: string };

async function resolveAppOrigin() {
  const requestHeaders = await headers();
  return resolveRecoveryOrigin({
    configuredAppUrl: env.appUrl,
    vercelEnv: process.env.VERCEL_ENV,
    vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL,
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    host: requestHeaders.get("host"),
  });
}

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

export async function requestPasswordResetAction(
  _: PasswordRecoveryState,
  formData: FormData,
): Promise<PasswordRecoveryState> {
  const parsed = recoverySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "请输入有效邮箱。" };
  if (!isSupabaseConfigured) return { error: "认证服务尚未配置完成。" };

  const genericMessage = "如果该邮箱与所有者账户匹配，密码重置邮件已发送。请检查收件箱和垃圾邮件。";
  if (!isOwnerEmail(parsed.data.email)) return { message: genericMessage };

  const origin = await resolveAppOrigin();
  if (!origin) return { error: "无法确定安全的生产应用地址，请检查 Vercel 域名配置。" };

  const supabase = await createClient();
  const redirectTo = `${origin}/api/auth/callback?next=${encodeURIComponent("/update-password")}`;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });

  if (error) {
    console.error("password reset request failed", {
      status: error.status,
      code: error.code,
      message: error.message,
      redirectOrigin: origin,
    });
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: "重置邮件发送过于频繁。Supabase 默认邮件服务存在发送限额，请稍后再试；不要连续点击发送。" };
    }
    return { error: "暂时无法发送重置邮件。请确认 Supabase 项目和重定向地址配置后重试。" };
  }

  return { message: genericMessage };
}

export async function updatePasswordAction(
  _: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "请输入至少 10 位的新密码，并确保两次输入一致。" };
  }
  if (!isSupabaseConfigured) return { error: "认证服务尚未配置完成。" };

  const supabase = await createClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const email = data?.claims.email as string | undefined;
  if (claimsError || !data?.claims.sub) {
    return { error: "密码重置会话已失效，请重新申请重置邮件。" };
  }
  if (!isOwnerEmail(email)) {
    await supabase.auth.signOut();
    return { error: "该账户无权修改此系统密码。" };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("password update failed", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return { error: "密码更新失败，请重新打开最新的重置邮件后再试。" };
  }

  await supabase.auth.signOut();
  redirect("/login?reset=success");
}

export async function logoutAction() {
  if (isSupabaseConfigured) await (await createClient()).auth.signOut();
  redirect("/login");
}
