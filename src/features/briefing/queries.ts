import { requireOwner } from "@/lib/auth/require-owner";
import { getDateKeyInTimeZone } from "@/features/today/utils";

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
  const briefingResult = await supabase
    .from("briefings")
    .select("*")
    .eq("user_id", userId)
    .eq("briefing_date", date)
    .maybeSingle();

  let entries: unknown[] = [];
  let entryError: unknown = null;
  if (briefingResult.data) {
    const result = await supabase
      .from("briefing_entries")
      .select(
        "*,feed_items(title,url,canonical_url,author,published_at,excerpt,feed_id,feeds(title)),feed_item_clusters(source_count)",
      )
      .eq("user_id", userId)
      .eq("briefing_id", briefingResult.data.id)
      .order("position");
    entries = result.data ?? [];
    entryError = result.error;
  }

  return {
    timezone,
    date,
    feeds: feedsResult.data ?? [],
    interests: interestsResult.data ?? [],
    briefing: briefingResult.data,
    entries,
    unavailable: Boolean(
      profileResult.error ||
        feedsResult.error ||
        interestsResult.error ||
        briefingResult.error ||
        entryError,
    ),
  };
}
