import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { searchInputSchema, type GlobalSearchResult } from "./types";

const row = z.object({ domain: z.enum(["notes", "career", "files", "tasks", "calendar", "reviews"]), entity_type: z.string(), entity_id: z.string().uuid(), title: z.string(), subtitle: z.string(), snippet: z.string(), metadata: z.record(z.string(), z.unknown()), source_updated_at: z.string().nullable(), score: z.number() });

function entityHref(entityType: string, entityId: string, domain: string, metadata: Record<string, unknown>) {
  if (entityType === "note") return `/notes/${entityId}`;
  if (entityType === "experience") return `/career/experiences/${entityId}`;
  if (["experience_fact", "experience_output", "experience_bullet"].includes(entityType) && typeof metadata.experience_id === "string") return `/career/experiences/${metadata.experience_id}`;
  if (entityType === "career_opportunity") return "/career/opportunities";
  if (entityType === "career_application") return "/career/applications";
  if (entityType === "resume_version") return "/career/resumes";
  if (["career_track", "career_milestone"].includes(entityType)) return "/career/roadmap";
  if (entityType === "career_direction") return "/career/directions";
  if (entityType === "skill") return "/career/skills";
  if (entityType === "certification") return "/career/certifications";
  if (domain === "files") return "/files";
  if (domain === "tasks") return "/tasks";
  if (domain === "calendar") return "/calendar";
  if (domain === "reviews") return "/reviews";
  return "/career";
}

export async function searchPersonalOs(input: z.input<typeof searchInputSchema>): Promise<GlobalSearchResult[]> {
  const parsed = searchInputSchema.parse(input);
  if (!parsed.query) return [];
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("search_personal_os", { p_query: parsed.query, p_limit: parsed.limit, p_domains: parsed.domains ?? null });
  if (error) throw new Error("search_unavailable");
  return z.array(row).parse(data ?? []).map((item) => ({ id: `${item.entity_type}:${item.entity_id}`, domain: item.domain, entityType: item.entity_type, entityId: item.entity_id, title: item.title || "未命名", subtitle: item.subtitle || null, snippet: item.snippet || null, href: entityHref(item.entity_type, item.entity_id, item.domain, item.metadata), score: item.score, sourceUpdatedAt: item.source_updated_at, metadata: item.metadata }));
}
