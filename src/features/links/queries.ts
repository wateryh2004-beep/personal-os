import { requireOwner } from "@/lib/auth/require-owner";
import {
  entityHrefFor,
  isLinkableEntityType,
  linkableEntityTable,
  type LinkableEntityType,
} from "./types";

export type EntityBacklink = {
  sourceType: LinkableEntityType;
  sourceId: string;
  title: string;
  href: string;
  label: string;
};

/** 查询“谁引用了该实体”(entity_links 的 reference 入链)。 */
export async function getEntityBacklinks(
  type: LinkableEntityType,
  id: string,
): Promise<{ backlinks: EntityBacklink[]; unavailable: boolean }> {
  const { supabase } = await requireOwner();
  const { data: links, error } = await supabase
    .from("entity_links")
    .select("source_type,source_id")
    .eq("target_type", type)
    .eq("target_id", id)
    .eq("relationship_type", "reference")
    .is("archived_at", null);
  if (error) return { backlinks: [], unavailable: true };

  const rows = (links ?? []).filter((link) => isLinkableEntityType(link.source_type));
  if (!rows.length) return { backlinks: [], unavailable: false };

  const grouped = new Map<LinkableEntityType, string[]>();
  for (const link of rows) {
    const sourceType = link.source_type as LinkableEntityType;
    const ids = grouped.get(sourceType) ?? [];
    ids.push(link.source_id);
    grouped.set(sourceType, ids);
  }
  const titles = new Map<string, string>();
  await Promise.all(
    [...grouped].map(async ([sourceType, ids]) => {
      const def = linkableEntityTable[sourceType];
      const uniqueIds = [...new Set(ids)];
      const { data } = await supabase
        .from(def.table)
        .select(`id,${def.titleColumn}`)
        .in("id", uniqueIds)
        .is("archived_at", null);
      for (const row of (data as Array<Record<string, unknown>> | null) ?? []) {
        titles.set(`${sourceType}:${row.id}`, String(row[def.titleColumn] ?? "未命名"));
      }
    }),
  );

  return {
    backlinks: rows.map((link) => {
      const sourceType = link.source_type as LinkableEntityType;
      return {
        sourceType,
        sourceId: link.source_id,
        title: titles.get(`${sourceType}:${link.source_id}`) ?? "已失效",
        href: entityHrefFor(sourceType, link.source_id),
        label: linkableEntityTable[sourceType].label,
      };
    }),
    unavailable: false,
  };
}
