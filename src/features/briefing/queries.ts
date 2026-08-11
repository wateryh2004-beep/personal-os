import { requireOwner } from "@/lib/auth/require-owner";
import { getDateKeyInTimeZone } from "@/features/today/utils";
import {
  getLatestCompletedBriefing,
  getLatestCompletedBriefingForDate,
  selectDisplayedBriefing,
} from "./runs";

export async function getBriefingWorkspace() {
  const { supabase, userId } = await requireOwner();
  const [profileResult, feedsResult, interestsResult] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
    supabase
      .from("feeds")
      .select("*")
      .eq("user_id", userId)
      .is("archived_at", null)
      .neq("status", "archived")
      .order("priority", { ascending: false }),
    supabase
      .from("briefing_interests")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .is("archived_at", null)
      .order("weight", { ascending: false }),
  ]);

  const timezone = profileResult.data?.timezone || "Asia/Shanghai";
  const date = getDateKeyInTimeZone(new Date(), timezone)!;
  const [todayBriefing, latestCompletedBriefing, generatingResult] = await Promise.all([
    getLatestCompletedBriefingForDate(supabase, userId, date),
    getLatestCompletedBriefing(supabase, userId),
    supabase
      .from("briefings")
      .select("id,briefing_date,status,updated_at")
      .eq("user_id", userId)
      .eq("briefing_date", date)
      .eq("status", "generating")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const briefing = selectDisplayedBriefing(todayBriefing, latestCompletedBriefing);
  const { data: settings } = await supabase.from("briefing_settings").select("generation_mode").eq("user_id", userId).maybeSingle();

  let entries: unknown[] = [];
  let entryError: unknown = null;
  if (briefing) {
    const result = await supabase
      .from("briefing_entries")
      .select(
        "*,feed_items(title,url,canonical_url,author,published_at,excerpt,feed_id,feeds(title)),feed_item_clusters(source_count)",
      )
      .eq("user_id", userId)
      .eq("briefing_id", briefing.id)
      .order("position");
    entries = result.data ?? [];
    entryError = result.error;
  }

  return {
    timezone,
    date,
    feeds: feedsResult.data ?? [],
    interests: interestsResult.data ?? [],
    briefing,
    todayBriefing,
    latestCompletedBriefing,
    todayGenerating: generatingResult.data,
    settings,
    entries,
    unavailable: Boolean(
      profileResult.error ||
        feedsResult.error ||
        interestsResult.error ||
        generatingResult.error ||
        entryError,
    ),
  };
}

export async function getBriefingSources() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("feeds").select("*").eq("user_id", userId).is("archived_at", null).order("priority", { ascending: false });
  if (error) throw new Error("无法读取信源。");
  const sourceIds = (data ?? []).map((feed) => feed.id);
  const { data: items } = sourceIds.length ? await supabase.from("feed_items").select("id,feed_id,title,published_at,url,canonical_url").in("feed_id", sourceIds).is("archived_at", null).order("published_at", { ascending: false }).limit(100) : { data: [] };
  return { sources: data ?? [], items: items ?? [] };
}

export async function getBriefingInterests() {
  const { supabase, userId } = await requireOwner();
  const [{ data: interests, error: interestsError }, { data: exclusions, error: exclusionsError }] = await Promise.all([
    supabase.from("briefing_interests").select("*").eq("user_id", userId).is("archived_at", null).order("weight", { ascending: false }),
    supabase.from("briefing_exclusions").select("*").eq("user_id", userId).is("archived_at", null).order("created_at"),
  ]);
  if (interestsError || exclusionsError) throw new Error("无法读取兴趣设置。");
  const { data: settings } = await supabase.from("briefing_settings").select("*").eq("user_id", userId).maybeSingle();
  return { interests: interests ?? [], exclusions: exclusions ?? [], settings };
}

export async function getBriefingHistory() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("briefings").select("*").eq("user_id", userId).order("generated_at", { ascending: false, nullsFirst: false }).limit(60);
  if (error) throw new Error("无法读取 Briefing 历史。");
  return data ?? [];
}

export async function getBriefingHistoryRun(briefingId: string) {
  const { supabase, userId } = await requireOwner();
  const { data: briefing, error } = await supabase.from("briefings").select("*").eq("id", briefingId).eq("user_id", userId).maybeSingle();
  if (error || !briefing) return null;
  const { data: entries } = await supabase.from("briefing_entries").select("*,feed_items(title,url,canonical_url,author,published_at,feeds(title,category)),feed_item_clusters(source_count)").eq("briefing_id", briefingId).eq("user_id", userId).order("position");
  return { briefing, entries: entries ?? [] };
}
