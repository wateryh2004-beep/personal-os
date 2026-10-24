"use server";

import { revalidatePath } from "@/lib/workspace-revalidation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { AgentActionConflict, executeFrozenAgentAction } from "./executor";
import { parseAgentActionPayload } from "./tools/schemas";

const confirmationSchema = z.object({ id: z.string().uuid(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/) });
const claimedSchema = z.object({ id: z.string().uuid(), run_id: z.string().uuid(), action_type: z.string(), payload_json: z.record(z.string(), z.unknown()) });
export type AgentActionResult = {
  status: "success" | "error" | "conflict" | "rejected";
  message: string;
  actionId: string;
  href?: string;
};

export async function approveAgentAction(actionId: string, payloadHash?: string): Promise<AgentActionResult> {
  const parsed = confirmationSchema.safeParse({ id: actionId, payloadHash });
  if (!parsed.success) return { status: "error", message: "提案版本已失效，请刷新后重新确认。", actionId };
  const { supabase, userId } = await requireOwner();
  // Resolve visibility with the session client first. The privileged client below
  // only advances this owned technical operation, never arbitrary domain rows.
  const { data: action, error } = await supabase.from("agent_actions")
    .select("id,payload_hash,action_type,payload_json,status").eq("id", actionId).eq("user_id", userId).maybeSingle();
  if (error || !action || action.payload_hash !== parsed.data.payloadHash || action.status !== "proposed")
    return { status: "error", message: "这项提案已处理、已变化或不存在，请刷新查看。", actionId };
  if (!parseAgentActionPayload(action.action_type, action.payload_json).success)
    return { status: "error", message: "提案数据已失效，未执行任何修改。", actionId };
  const admin = createAdminClient();
  const args = { p_user_id: userId, p_action_id: actionId, p_hash: parsed.data.payloadHash };
  const claim = await admin.rpc("transition_agent_action", { ...args, p_status: "executing" });
  if (claim.error) return { status: "error", message: "提案已过期或已被处理，请刷新查看。", actionId };
  const claimed = claimedSchema.parse(claim.data);
  let result: Record<string, unknown>;
  try {
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    result = await executeFrozenAgentAction({ supabase, userId, actionId, actionType: claimed.action_type, payload: claimed.payload_json, timezone: profile?.timezone || "Asia/Shanghai" });
  } catch (executionError) {
    const conflict = executionError instanceof AgentActionConflict;
    const disconnected = executionError instanceof Error && executionError.message === "microsoft_disconnected";
    const completion = await admin.rpc("transition_agent_action", { ...args, p_status: conflict ? "conflict" : "failed", p_error: conflict ? "content_conflict" : disconnected ? "microsoft_disconnected" : "execution_failed" });
    return { status: conflict ? "conflict" : "error", message: completion.error ? "无法确认操作记录，请刷新核对结果，暂勿重复执行。" : conflict ? "内容已变化，本次未覆盖，请重新生成。" : disconnected ? "Microsoft 当前未连接，未执行修改。" : "操作未完成，请核对原记录后再处理。", actionId };
  }
  const completion = await admin.rpc("transition_agent_action", { ...args, p_status: "succeeded", p_result: result });
  if (completion.error) return { status: "error", message: "操作已执行，但确认记录尚未保存。请刷新核对，暂勿重复执行。", actionId };
  const { count, error: pendingError } = await supabase.from("agent_actions").select("id", { count: "exact", head: true }).eq("run_id", claimed.run_id).in("status", ["proposed", "approved", "executing"]);
  if (!pendingError && count === 0) await supabase.from("agent_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", claimed.run_id).eq("user_id", userId);
  for (const path of ["/calendar", "/tasks", "/notes", "/today", "/career", "/memory", "/shopping", "/travel"]) await revalidatePath(path);
  return { status: "success", message: "已确认并完成。", actionId, href: typeof result.href === "string" ? result.href : undefined };
}

export async function rejectAgentAction(actionId: string, payloadHash?: string): Promise<AgentActionResult> {
  const parsed = confirmationSchema.safeParse({ id: actionId, payloadHash });
  if (!parsed.success) return { status: "error", message: "提案版本已失效，请刷新查看。", actionId };
  const { supabase, userId } = await requireOwner();
  const { data } = await supabase.from("agent_actions").select("id").eq("id", actionId).eq("user_id", userId).maybeSingle();
  if (!data) return { status: "error", message: "这项提案不存在。", actionId };
  const { error } = await createAdminClient().rpc("transition_agent_action", { p_user_id: userId, p_action_id: actionId, p_hash: parsed.data.payloadHash, p_status: "rejected" });
  return error ? { status: "error", message: "这项提案已处理或已过期，请刷新查看。", actionId } : { status: "rejected", message: "已取消这项提案。", actionId };
}

export async function approveAgentActions(confirmations: Array<{ id: string; payloadHash?: string }>) {
  const parsed = z.array(confirmationSchema).min(1).max(20).safeParse(confirmations);
  if (!parsed.success) return [{ status: "error", message: "提案版本已失效，请刷新后重新确认。", actionId: "" }] satisfies AgentActionResult[];
  const results: AgentActionResult[] = [];
  for (const confirmation of new Map(parsed.data.map(item => [item.id, item])).values()) results.push(await approveAgentAction(confirmation.id, confirmation.payloadHash));
  return results;
}
