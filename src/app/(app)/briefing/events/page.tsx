import { requireOwner } from "@/lib/auth/require-owner";
import { BriefingEvents } from "@/components/briefing/briefing-events";
export default async function EventsPage() {
  const { supabase, userId } = await requireOwner();
  const [events, sources, items, versions, entries, judgments] =
    await Promise.all([
      supabase
        .from("briefing_events")
        .select("*")
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(101),
      supabase
        .from("briefing_event_sources")
        .select("*")
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(501),
      supabase
        .from("feed_items")
        .select("id,title,url,published_at,fetched_at")
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("fetched_at", { ascending: false })
        .limit(501),
      supabase
        .from("feed_item_versions")
        .select("*")
        .eq("user_id", userId)
        .order("observed_at", { ascending: false })
        .limit(1001),
      supabase
        .from("briefing_entries")
        .select("id,briefing_id,representative_item_id,created_at,summary")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(501),
      supabase
        .from("decision_sources")
        .select(
          "source_id,decisions(id,decision_text,decided_at,updated_at,status)",
        )
        .eq("user_id", userId)
        .eq("source_type", "briefing_entry")
        .order("created_at", { ascending: false })
        .limit(501),
    ]);
  if (
    [events, sources, items, versions, entries, judgments].some(
      (result) => result.error,
    )
  )
    return <p role="alert">事件资料暂时无法完整读取，请稍后重试。</p>;
  return (
    <BriefingEvents
      events={events.data?.slice(0, 100) ?? []}
      entries={entries.data?.slice(0, 500) ?? []}
      judgments={(judgments.data ?? []).slice(0, 500).flatMap((row) => {
        const d = Array.isArray(row.decisions)
          ? row.decisions[0]
          : row.decisions;
        return d
          ? [
              {
                entryId: row.source_id,
                id: d.id,
                text: d.decision_text,
                occurredAt: d.updated_at || d.decided_at,
                status: d.status,
              },
            ]
          : [];
      })}
      sources={sources.data?.slice(0, 500) ?? []}
      items={items.data?.slice(0, 500) ?? []}
      versions={versions.data?.slice(0, 1000) ?? []}
      truncated={
        (events.data?.length ?? 0) > 100 ||
        (sources.data?.length ?? 0) > 500 ||
        (items.data?.length ?? 0) > 500 ||
        (versions.data?.length ?? 0) > 1000 ||
        (entries.data?.length ?? 0) > 500 ||
        (judgments.data?.length ?? 0) > 500
      }
    />
  );
}
