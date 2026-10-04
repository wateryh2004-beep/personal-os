import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isOwnerEmail } from "@/lib/auth/owner";
import { safeRedirectPath } from "@/lib/supabase/proxy";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type LoginSearchParams = Promise<{
  error?: string;
  reset?: string;
  next?: string | string[];
}>;

export default async function Login({ searchParams }: { searchParams: LoginSearchParams }) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null);
  let signedIn = false;
  if (isSupabaseConfigured) {
    try {
      const client = await createClient();
      const { data } = await client.auth.getClaims();
      signedIn = Boolean(data?.claims.sub) && isOwnerEmail(data?.claims.email as string | undefined);
    } catch {
      // Keep the login page usable even when the auth backend is temporarily unavailable.
    }
  }
  if (signedIn) redirect(next);

  const proxyNotice = (await headers()).get("x-personal-os-auth-notice") === "not-authorized"
    ? "该账户无权访问此私人系统。"
    : undefined;
  const queryError = params.error === "configuration"
    ? "认证服务当前不可用或配置不完整。"
    : params.error === "recovery"
      ? "密码重置链接无效或已过期，请重新申请。"
      : params.error === "not-authorized"
        ? "该账户无权访问此私人系统。"
        : undefined;
  const message = params.reset === "success"
    ? "密码已更新，请使用新密码登录。"
    : undefined;

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <LoginForm initialError={proxyNotice ?? queryError} initialMessage={message} next={next} />
    </main>
  );
}
