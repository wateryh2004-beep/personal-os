"use server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
export async function saveBriefingEventSource(input: unknown) {
  const value = z
      .object({
        eventId: z.string().uuid(),
        revision: z.number().int().min(0),
        title: z.string().trim().min(1).max(240),
        itemId: z.string().uuid(),
        linked: z.boolean(),
      })
      .strict()
      .parse(input),
    { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("save_briefing_event_source", {
    p_event_id: value.eventId,
    p_expected_revision: value.revision,
    p_title: value.title,
    p_item_id: value.itemId,
    p_linked: value.linked,
  });
  if (error || !data)
    throw new Error(
      "事件归组未能保存，可能已有新版本或来源不可用。输入保留，请重新核对。",
    );
  const source = await supabase
    .from("briefing_event_sources")
    .select("*")
    .eq("event_id", value.eventId)
    .eq("feed_item_id", value.itemId)
    .maybeSingle();
  if (source.error || !source.data)
    throw new Error(
      "归组已提交，但最新关联尚待核对，请读取变化线，勿重复创建。",
    );
  return { event: data, source: source.data };
}

export async function readBriefingEvent(input: unknown) {
  const value = z
      .object({ id: z.string().uuid(), expectedExists: z.boolean() })
      .strict()
      .parse(input),
    { supabase, userId } = await requireOwner();
  const { data: event, error } = await supabase
    .from("briefing_events")
    .select("*")
    .eq("id", value.id)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (error || (!event && value.expectedExists))
    throw new Error("事件最新内容暂时不可用，当前归组输入保留。");
  if (!event) return { event: null, sources: [], truncated: false };
  const sources = await supabase
    .from("briefing_event_sources")
    .select("*")
    .eq("event_id", event.id)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(501);
  if (sources.error)
    throw new Error("事件关联暂时无法完整读取，当前输入保留。");
  return {
    event,
    sources: sources.data?.slice(0, 500) ?? [],
    truncated: (sources.data?.length ?? 0) > 500,
  };
}
