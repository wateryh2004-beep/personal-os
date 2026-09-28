import { redirect } from "next/navigation";
import { isOwnerEmail } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./update-password-form";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const email = data?.claims.email as string | undefined;

  if (error || !data?.claims.sub) redirect("/login?error=recovery");
  if (!isOwnerEmail(email)) {
    await supabase.auth.signOut();
    redirect("/login?error=not-authorized");
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <UpdatePasswordForm email={email!} />
    </main>
  );
}
