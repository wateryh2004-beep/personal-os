import "server-only";

import { requireOwner } from "@/lib/auth/require-owner";
import { getReviewPeriod } from "./periods";

type CompletedReview = {
  id: string;
  review_type: "daily" | "weekly" | "decision";
  title: string;
  period_start: string;
  period_end: string;
  content_markdown: string;
  completed_at: string | null;
};

export async function getReviews() {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase
    .from("reviews")
    .select("id,review_type,review_key,title,period_start,period_end,status,content_markdown,completed_at,updated_at")
    .is("archived_at", null)
    .order("period_end", { ascending: false })
    .limit(10);
  if (error) return [];
  return data ?? [];
}

export async function getReviewsDashboard() {
  const { supabase, userId } = await requireOwner();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const timezone = profile?.timezone || "Asia/Shanghai";
  const [daily, weekly] = [
    getReviewPeriod("daily", new Date(), timezone),
    getReviewPeriod("weekly", new Date(), timezone),
  ];
  const [reviews, dueDecisions] = await Promise.all([
    getReviews(),
    supabase
      .from("decisions")
      .select("id,title,importance,review_at,decided_at")
      .eq("status", "active")
      .is("archived_at", null)
      .not("review_at", "is", null)
      .lte("review_at", new Date().toISOString())
      .order("importance", { ascending: false })
      .order("review_at", { ascending: true })
      .limit(8),
  ]);
  return {
    timezone,
    daily,
    weekly,
    reviews,
    dueDecisions: dueDecisions.data ?? [],
  };
}

export async function getReviewsForContext(input: {
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<CompletedReview[]> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase
    .from("reviews")
    .select("id,review_type,title,period_start,period_end,content_markdown,completed_at")
    .eq("status", "completed")
    .is("archived_at", null)
    .lte("period_start", input.endDate)
    .gte("period_end", input.startDate)
    .order("period_end", { ascending: false })
    .limit(input.limit ?? 6);
  if (error) return [];
  const rows = (data ?? []) as CompletedReview[];
  const longRange = daysBetween(input.startDate, input.endDate) > 7;
  return rows
    .sort((a, b) => rank(b, longRange) - rank(a, longRange))
    .slice(0, input.limit ?? 6);
}

function daysBetween(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

function rank(review: CompletedReview, longRange: boolean) {
  const typeScore = review.review_type === "decision" ? 30 : review.review_type === "weekly" ? 20 : 10;
  return typeScore + (longRange && review.review_type === "daily" ? -8 : 0);
}
