"use server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { graphEntityRefSchema } from "@/features/graph/types";
import { refreshOperationWorkspaces } from "./operation-actions";
import type { OperationResult } from "./operation-contracts";
const schema = z.object({ requestId: z.string().uuid(), source: graphEntityRefSchema, target: graphEntityRefSchema }).strict();
export async function linkWorkbenchRecords(input: unknown): Promise<OperationResult> {
  const value = schema.parse(input);
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("apply_workbench_link", { p_request_id: value.requestId, p_source_type: value.source.type, p_source_id: value.source.id, p_target_type: value.target.type, p_target_id: value.target.id });
  if (error) return { status: /conflict/.test(error.message) ? "conflict" : "error", message: "关联未保存。请确认双方仍可访问后重试。" };
  await refreshOperationWorkspaces();
  return { status: "success", receiptId: data.receiptId, message: "已建立关联；原件保持原位。" };
}
export async function readWorkbenchLinkTargets() {
  const { supabase } = await requireOwner();
  const [projects, experiences, opportunities] = await Promise.all([
    supabase.from("projects").select("id,name").is("archived_at", null).order("updated_at", { ascending: false }).limit(40),
    supabase.from("experiences").select("id,organization,role").is("archived_at", null).order("updated_at", { ascending: false }).limit(40),
    supabase.from("career_opportunities").select("id,organization,role_title").is("archived_at", null).order("updated_at", { ascending: false }).limit(40),
  ]);
  if (projects.error || experiences.error || opportunities.error) throw new Error("link_targets_unavailable");
  return [
    ...(projects.data ?? []).map(row => ({ type: "project" as const, id: row.id as string, title: `项目 · ${row.name}` })),
    ...(experiences.data ?? []).map(row => ({ type: "experience" as const, id: row.id as string, title: `经历 · ${row.organization} · ${row.role}` })),
    ...(opportunities.data ?? []).map(row => ({ type: "career_opportunity" as const, id: row.id as string, title: `机会 · ${row.organization} · ${row.role_title}` })),
  ];
}
