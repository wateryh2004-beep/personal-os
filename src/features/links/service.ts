import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueEntityLinkTargets } from "./parser";
import { linkableEntityTable, type LinkableEntityType } from "./types";

const RELATIONSHIP = "reference";
const CREATED_VIA = "system";

/**
 * 把文本里的跨实体内链同步进 entity_links。
 *
 * - 只管理本函数写入的行(relationship_type=reference + created_via=system),
 *   不触碰手动图链接(created_via=manual/suggestion)。
 * - note→note 由 note_links 维护,这里跳过,避免双写。
 *
 * 返回 { ok: false } 时调用方只记日志,不影响保存主流程。
 */
export async function syncEntityReferenceLinks(
  supabase: SupabaseClient,
  userId: string,
  sourceType: string,
  sourceId: string,
  text: string,
) {
  const targets = uniqueEntityLinkTargets(text);
  const filtered = sourceType === "note" ? targets.filter((target) => target.type !== "note") : targets;

  // 校验目标实体存在且活跃,顺便去重同类型下的重复 id。
  const byType = new Map<LinkableEntityType, string[]>();
  for (const target of filtered) {
    const ids = byType.get(target.type) ?? [];
    ids.push(target.id);
    byType.set(target.type, ids);
  }
  const existingKeys = new Set<string>();
  for (const [type, ids] of byType) {
    const def = linkableEntityTable[type];
    const uniqueIds = [...new Set(ids)];
    const query =
      type === "note"
        ? supabase.from(def.table).select("id").in("id", uniqueIds).is("archived_at", null).eq("status", "active").is("deleted_at", null)
        : type === "document"
          ? supabase.from(def.table).select("id").in("id", uniqueIds).is("archived_at", null).eq("storage_state", "available")
          : supabase.from(def.table).select("id").in("id", uniqueIds).is("archived_at", null);
    const { data, error } = await query;
    if (error) return { ok: false as const, code: error.code ?? "target_lookup_failed" };
    for (const row of data ?? []) existingKeys.add(`${type}:${row.id}`);
  }
  const desired = filtered.filter((target) => existingKeys.has(`${target.type}:${target.id}`));

  const { data: current, error: currentError } = await supabase
    .from("entity_links")
    .select("id,target_type,target_id")
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("relationship_type", RELATIONSHIP)
    .eq("created_via", CREATED_VIA)
    .is("archived_at", null);
  if (currentError) return { ok: false as const, code: currentError.code ?? "current_lookup_failed" };

  const currentRows = current ?? [];
  const desiredKeys = new Set(desired.map((target) => `${target.type}:${target.id}`));
  const removedIds = currentRows
    .filter((row) => !desiredKeys.has(`${row.target_type}:${row.target_id}`))
    .map((row) => row.id);
  const currentKeys = new Set(currentRows.map((row) => `${row.target_type}:${row.target_id}`));
  const added = desired
    .filter((target) => !currentKeys.has(`${target.type}:${target.id}`))
    .map((target) => ({
      user_id: userId,
      source_type: sourceType,
      source_id: sourceId,
      target_type: target.type,
      target_id: target.id,
      relationship_type: RELATIONSHIP,
      created_via: CREATED_VIA,
      metadata: { via: "markdown" },
    }));

  if (removedIds.length) {
    const { error } = await supabase.from("entity_links").delete().in("id", removedIds);
    if (error) return { ok: false as const, code: error.code ?? "delete_failed" };
  }
  if (added.length) {
    // 唯一约束 (user_id, source_type, source_id, target_type, target_id, relationship_type);
    // 若同源同目标已有行(如手动 reference)则跳过,不覆盖。
    const { error } = await supabase.from("entity_links").upsert(added, {
      onConflict: "user_id,source_type,source_id,target_type,target_id,relationship_type",
      ignoreDuplicates: true,
    });
    if (error) return { ok: false as const, code: error.code ?? "insert_failed" };
  }
  return { ok: true as const };
}
