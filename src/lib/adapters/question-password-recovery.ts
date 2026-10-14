import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isRecoveryAnswerHash } from "@/lib/auth/recovery-answer";
import { isOwnerEmail } from "@/lib/auth/owner";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export function isQuestionRecoveryConfigured(): boolean {
  // Public previews must never expose recovery for the production account.
  return process.env.VERCEL_ENV !== "preview" && Boolean(
    env.supabaseUrl && env.supabasePublishableKey && env.supabaseSecretKey &&
    env.ownerEmail && z.string().uuid().safeParse(env.ownerUserId).success &&
    isRecoveryAnswerHash(process.env.PASSWORD_RECOVERY_ANSWER_HASH),
  );
}

export async function consumeQuestionRecoveryAttempt(): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("consume_question_recovery_attempt");
  if (error || typeof data !== "boolean") throw new Error("Recovery attempt check unavailable");
  return data;
}

export async function resetOwnerPasswordFromQuestion(password: string): Promise<{ sessionsRevoked: boolean }> {
  const admin = createAdminClient();
  const { data: owner, error: ownerError } = await admin.auth.admin.getUserById(env.ownerUserId!);
  if (ownerError || !isOwnerEmail(owner.user?.email) || owner.user?.id !== env.ownerUserId) {
    throw new Error("Recovery owner configuration mismatch");
  }

  // Generate (not email) a one-time token, confined to this server invocation.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery", email: owner.user.email!,
  });
  if (linkError || link.user?.id !== env.ownerUserId || !link.properties?.hashed_token) {
    throw new Error("Recovery token unavailable");
  }
  const recovery = createClient(env.supabaseUrl!, env.supabasePublishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error: verifyError } = await recovery.auth.verifyOtp({
    type: "recovery", token_hash: link.properties.hashed_token,
  });
  if (verifyError || !data.session || data.user?.id !== env.ownerUserId || !isOwnerEmail(data.user?.email)) {
    if (data.session) await recovery.auth.signOut({ scope: "local" });
    throw new Error("Recovery session unavailable");
  }

  let updated = false;
  let sessionsRevoked = false;
  try {
    const { error } = await recovery.auth.updateUser({ password });
    if (error) throw new Error("Recovery password update rejected");
    updated = true;
  } finally {
    // Never return tokens or install a login cookie for someone answering a question.
    try {
      const { error } = await recovery.auth.signOut({ scope: updated ? "global" : "local" });
      sessionsRevoked = !error;
    } catch {
      // A failed revocation must not report an already changed password as unchanged.
    }
  }
  return { sessionsRevoked };
}
