"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getReviewPeriod } from "./periods";

const createSchema = z.object({
  type: z.enum(["daily", "weekly"]),
  content: z.string().trim().min(1).max(10000),
});

async function ownerTimezone() {
  const owner = await requireOwner();
  const { data: profile } = await owner.supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", owner.userId)
    .maybeSingle();
  return { ...owner, timezone: profile?.timezone || "Asia/Shanghai" };
}

export async function createReview(input: unknown) {
  const value = createSchema.parse(input);
  const { supabase, userId, timezone } = await ownerTimezone();
  const period = getReviewPeriod(value.type, new Date(), timezone);
  const title = value.type === "daily" ? `每日复盘 · ${period.startDate}` : `每周复盘 · ${period.startDate} — ${period.endDate}`;
  const { data: review, error } = await supabase
    .from("reviews")
    .upsert(
      {
        user_id: userId,
        review_type: value.type,
        review_key: period.key,
        title,
        period_start: period.startDate,
        period_end: period.endDate,
        content_markdown: value.content,
        structured_data: { freeReflection: value.content },
        status: "completed",
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,review_key" },
    )
    .select("id,content_markdown,structured_data")
    .single();
  if (error || !review) throw new Error("无法保存复盘，请稍后再试。");

  const { count } = await supabase
    .from("review_versions")
    .select("id", { count: "exact", head: true })
    .eq("review_id", review.id);
  const { error: versionError } = await supabase.from("review_versions").insert({
    user_id: userId,
    review_id: review.id,
    version_number: (count ?? 0) + 1,
    content_markdown: review.content_markdown,
    structured_data: review.structured_data,
    reason: count ? "amended" : "completed",
  });
  if (versionError) throw new Error("复盘已保存，但版本快照未能建立，请重新提交一次。");
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: count ? "review_amend" : "review_complete",
    entity_type: "review",
    entity_id: review.id,
    actor_type: "user",
    after_data: { review_type: value.type, period: period.key, source_count: 0 },
  });
  revalidatePath("/reviews");
}
