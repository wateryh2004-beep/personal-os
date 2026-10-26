"use server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import type { Json } from "@/types/database";
import { workspaceSceneSnapshotSchema, workspaceSceneSchema, type WorkspaceScene } from "./contracts";
const inputSchema = z.object({ id: z.uuid(), requestId: z.uuid(), expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 2), name: z.string().trim().min(1).max(80), snapshot: workspaceSceneSnapshotSchema, archive: z.boolean().default(false) }).strict();
export async function saveWorkspaceScene(input: unknown): Promise<{ status: "saved"; scene: WorkspaceScene } | { status: "invalid" | "conflict" | "missing" | "limit" | "unavailable" }> {
  const { supabase } = await requireOwner();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const value = parsed.data;
  try {
    const { data, error } = await supabase.rpc("save_workspace_scene", { p_id: value.id, p_request_id: value.requestId, p_expected_revision: value.expectedRevision, p_name: value.name, p_snapshot: value.snapshot as Json, p_archive: value.archive });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return { status: "unavailable" };
    if (data.status === "saved") {
      const result = z.object({ status: z.literal("saved"), scene: workspaceSceneSchema }).strict().safeParse(data);
      return result.success ? result.data : { status: "unavailable" };
    }
    if (data.status === "invalid" || data.status === "conflict" || data.status === "missing" || data.status === "limit") return { status: data.status };
    return { status: "unavailable" };
  } catch { return { status: "unavailable" }; }
}
