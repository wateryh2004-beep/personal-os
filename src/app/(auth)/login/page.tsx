import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isOwnerEmail } from "@/lib/auth/owner";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (isSupabaseConfigured) {
    const client = await createClient();
    const { data } = await client.auth.getClaims();
    if (isOwnerEmail(data?.claims.email as string | undefined)) redirect("/today");
  }

  const notice = (await headers()).get("x-personal-os-auth-notice") === "not-authorized"
    ? "该账户无权访问此私人系统。"
    : undefined;

  return <main className="grid min-h-screen place-items-center p-6"><LoginForm initialError={notice} /></main>;
}
