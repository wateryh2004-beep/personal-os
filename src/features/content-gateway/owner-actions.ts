"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";

export async function revokeCodexAuthorization(formData: FormData): Promise<void> {
  const { supabase } = await requireOwner();
  const grantId = z.string().uuid().safeParse(formData.get("grant_id"));
  if (!grantId.success) redirect("/settings/connections/codex?error=revoke");
  let failed = false;
  try {
    // The RPC derives ownership from auth.uid(); the form cannot select an owner.
    const { error } = await supabase.rpc("revoke_content_authorization", { p_grant_id: grantId.data });
    failed = Boolean(error);
  } catch { failed = true; }
  if (failed) redirect("/settings/connections/codex?error=revoke");
  revalidatePath("/settings/connections/codex");
  redirect("/settings/connections/codex");
}
