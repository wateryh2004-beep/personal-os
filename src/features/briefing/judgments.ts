import type { SupabaseClient } from "@supabase/supabase-js";

/** 用户「写下判断」的回看日期选项。判断是 user-authored cognition，AI 不得代写。 */
export const judgmentReviewPeriods = [
  { value: "1_month", label: "1 个月", months: 1 },
  { value: "3_months", label: "3 个月", months: 3 },
  { value: "6_months", label: "6 个月", months: 6 },
  { value: "1_year", label: "1 年", months: 12 },
] as const;
export type JudgmentReviewPeriod = (typeof judgmentReviewPeriods)[number]["value"];

export type BriefingJudgment = {
  id: string;
  decisionText: string;
  confidence: number | null;
  falsificationCondition: string | null;
  reviewAt: string | null;
};

export function reviewAtForPeriod(now: Date, period: JudgmentReviewPeriod) {
  const months = judgmentReviewPeriods.find((item) => item.value === period)?.months ?? 3;
  const date = new Date(now);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

/**
 * 通过 decision_sources（source_type='briefing_entry'）找到每条 briefing entry 关联的用户判断。
 * 返回 entryId -> BriefingJudgment 的 Map；无判断的 entry 不出现。
 */
export async function getJudgmentsByEntryId(
  supabase: SupabaseClient,
  userId: string,
  entryIds: string[],
) {
  const map = new Map<string, BriefingJudgment>();
  if (!entryIds.length) return map;
  const { data } = await supabase
    .from("decision_sources")
    .select("source_id, decisions(id,decision_text,confidence,falsification_condition,review_at)")
    .eq("user_id", userId)
    .eq("source_type", "briefing_entry")
    .in("source_id", entryIds);
  for (const row of data ?? []) {
    const decision = Array.isArray(row.decisions) ? row.decisions[0] : row.decisions;
    if (!decision) continue;
    map.set(String(row.source_id), {
      id: decision.id,
      decisionText: decision.decision_text,
      confidence: decision.confidence == null ? null : Number(decision.confidence),
      falsificationCondition: decision.falsification_condition ?? null,
      reviewAt: decision.review_at ?? null,
    });
  }
  return map;
}
