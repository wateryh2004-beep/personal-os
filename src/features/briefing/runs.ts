import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BriefingRun = {
  id: string;
  briefing_date: string;
  status: "generating" | "completed" | "failed";
  generated_at: string | null;
  updated_at: string;
};

export function isRecentGeneratingRun(
  run: Pick<BriefingRun, "updated_at"> | null | undefined,
  now = new Date(),
) {
  return Boolean(
    run && now.getTime() - new Date(run.updated_at).getTime() < 10 * 60_000,
  );
}

export function selectDisplayedBriefing<T extends { briefing_date: string }>(
  todayCompleted: T | null,
  latestCompleted: T | null,
) {
  return todayCompleted ?? latestCompleted;
}

export async function findRecentGeneratingRun(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
) {
  const { data, error } = await supabase
    .from("briefings")
    .select("id,briefing_date,status,generated_at,updated_at")
    .eq("user_id", userId)
    .eq("status", "generating")
    .gte("updated_at", new Date(now.getTime() - 10 * 60_000).toISOString())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("无法检查 Briefing 生成状态。");
  return data as BriefingRun | null;
}

export async function getLatestCompletedBriefing(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("briefings")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("generated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("无法读取最近 Briefing。");
  return data;
}

export async function getLatestCompletedBriefingForDate(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
) {
  const { data, error } = await supabase
    .from("briefings")
    .select("*")
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .eq("status", "completed")
    .order("generated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("无法读取今日 Briefing。");
  return data;
}

export async function createBriefingRun(
  supabase: SupabaseClient,
  values: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("briefings")
    .insert(values)
    .select("id")
    .single();
  if (error || !data) throw new Error("无法建立今日 Briefing。");
  return data;
}

export async function markBriefingRunCompleted(
  supabase: SupabaseClient,
  userId: string,
  briefingId: string,
  selectedCount: number,
  generatedAt: string,
) {
  const { error } = await supabase
    .from("briefings")
    .update({ status: "completed", selected_count: selectedCount, generated_at: generatedAt })
    .eq("user_id", userId)
    .eq("id", briefingId);
  if (error) throw new Error("无法完成今日 Briefing。");
}

export async function markBriefingRunFailed(
  supabase: SupabaseClient,
  userId: string,
  briefingId: string,
) {
  await supabase
    .from("briefings")
    .update({ status: "failed", error_code: "generation_failed" })
    .eq("user_id", userId)
    .eq("id", briefingId);
}
