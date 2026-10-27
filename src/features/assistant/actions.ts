"use server";

import { revalidatePath } from "@/lib/workspace-revalidation";
import { z } from "zod";
import { safeWorkbenchHref } from "@/features/workbench/contracts";
import { requireOwner } from "@/lib/auth/require-owner";
import { AgentActionConflict, executeFrozenAgentAction } from "./executor";
import { parseAgentActionPayload } from "./tools/schemas";

const idSchema = z.string().uuid();
const actionIdsSchema = z.array(idSchema).min(1).max(20).transform((ids) => [...new Set(ids)]);
export type AgentActionResult = {
  status: "success" | "error" | "conflict" | "rejected";
  message: string;
  actionId: string;
  href?: string;
};

async function audit(input: {
  supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"];
  userId: string;
  action: string;
  actionId: string;
  data: Record<string, unknown>;
}) {
  await input.supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: input.action,
    entity_type: "agent_action",
    entity_id: input.actionId,
    actor_type: "user",
    after_data: input.data,
  });
}

export async function approveAgentAction(actionId: string): Promise<AgentActionResult> {
  const parsedId = idSchema.safeParse(actionId);
  if (!parsedId.success)
    return { status: "error", message: "无效的操作提案。", actionId };
  const { supabase, userId } = await requireOwner();
  const { data: action, error } = await supabase
    .from("agent_actions")
    .select("id,run_id,domain,action_type,status,payload_json,expires_at")
    .eq("id", parsedId.data)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !action || action.status !== "proposed")
    return { status: "error", message: "这项提案已处理或不存在。", actionId };
  if (action.expires_at && Date.parse(action.expires_at) <= Date.now()) {
    await supabase.from("agent_actions").update({ status: "failed", error_code: "proposal_expired", executed_at: new Date().toISOString() }).eq("id", action.id).eq("status", "proposed");
    return { status: "error", message: "这项提案已过期，请重新生成。", actionId };
  }
  if (!parseAgentActionPayload(action.action_type, action.payload_json).success)
    return { status: "error", message: "提案数据已失效，未执行任何修改。", actionId };
  const { data: approved } = await supabase
    .from("agent_actions")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", action.id)
    .eq("status", "proposed")
    .select("id")
    .maybeSingle();
  if (!approved)
    return { status: "error", message: "这项提案已被其他操作处理。", actionId };
  await audit({ supabase, userId, action: "agent_action_approved", actionId, data: { run_id: action.run_id, domain: action.domain, action_type: action.action_type } });
  await supabase.from("agent_actions").update({ status: "executing" }).eq("id", action.id).eq("status", "approved");
  try {
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const result = await executeFrozenAgentAction({
      supabase,
      userId,
      actionType: action.action_type,
      payload: action.payload_json as Record<string, unknown>,
      timezone: profile?.timezone || "Asia/Shanghai",
    });
    const saved = await supabase.from("agent_actions").update({ status: "succeeded", result_json: result, executed_at: new Date().toISOString(), error_code: null }).eq("id", action.id).eq("user_id", userId).eq("status", "executing").select("id").maybeSingle();
    if (saved.error || !saved.data) return { status: "error", actionId, message: "执行已返回，保存结果尚未核对。请核对原提案，不要重复执行。" };
    await audit({ supabase, userId, action: "agent_action_succeeded", actionId, data: { run_id: action.run_id, domain: action.domain, action_type: action.action_type } });
    const { count } = await supabase.from("agent_actions").select("id", { count: "exact", head: true }).eq("run_id", action.run_id).eq("status", "proposed");
    if ((count ?? 0) === 0) await supabase.rpc("complete_agent_run_if_resolved", { p_run_id: action.run_id });
    await revalidatePath("/calendar"); await revalidatePath("/tasks"); await revalidatePath("/notes"); await revalidatePath("/today"); await revalidatePath("/career"); await revalidatePath("/memory");
    const href = typeof result === "object" && result && "href" in result ? String(result.href) : undefined;
    return { status: "success", message: "已确认并完成。", actionId, href };
  } catch (executionError) {
    const conflict = executionError instanceof AgentActionConflict;
    const code = executionError instanceof Error ? executionError.message.slice(0, 120) : "execution_failed";
    await supabase.from("agent_actions").update({ status: conflict ? "conflict" : "failed", error_code: code, executed_at: new Date().toISOString() }).eq("id", action.id);
    await audit({ supabase, userId, action: conflict ? "agent_action_conflict" : "agent_action_failed", actionId, data: { run_id: action.run_id, domain: action.domain, action_type: action.action_type, error_code: code } });
    return { status: conflict ? "conflict" : "error", message: conflict ? "原始内容在提案后已经变化。为保护你的新修改，本次没有覆盖，请重新生成。" : code === "microsoft_disconnected" ? "Outlook / Microsoft To Do 当前未连接，未执行修改。" : "执行失败，未将提案标记为成功。请检查连接后重试。", actionId };
  }
}

export async function rejectAgentAction(actionId: string): Promise<AgentActionResult> {
  const parsedId = idSchema.safeParse(actionId);
  if (!parsedId.success) return { status: "error", message: "无效的操作提案。", actionId };
  const { supabase, userId } = await requireOwner();
  const { data } = await supabase.from("agent_actions").update({ status: "rejected", executed_at: new Date().toISOString() }).eq("id", parsedId.data).eq("user_id", userId).eq("status", "proposed").select("id,run_id,domain,action_type").maybeSingle();
  if (!data) return { status: "error", message: "这项提案已处理或不存在。", actionId };
  await audit({ supabase, userId, action: "agent_action_rejected", actionId, data: { run_id: data.run_id, domain: data.domain, action_type: data.action_type } });
  return { status: "rejected", message: "已取消这项提案。", actionId };
}

export async function approveAgentActions(actionIds: string[]) {
  const parsed = actionIdsSchema.safeParse(actionIds);
  if (!parsed.success)
    return [{ status: "error", message: "操作列表无效。", actionId: "" }] satisfies AgentActionResult[];
  const results: AgentActionResult[] = [];
  for (const actionId of parsed.data) {
    results.push(await approveAgentAction(actionId));
  }
  return results;
}

/** Exact proposal IDs only: reconciliation never executes, claims, or generates. */
export async function readAgentActionsState(actionIds: string[]) {
  const ids = actionIdsSchema.parse(actionIds);
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("agent_actions").select("id,status,result_json,expires_at").eq("user_id", userId).in("id", ids);
  if (error) throw new Error("提案状态尚未核对。");
  return (data ?? []).map(row => {
    const result = row.result_json && typeof row.result_json === "object" && !Array.isArray(row.result_json) ? row.result_json : null;
    const href = safeWorkbenchHref(result && "href" in result ? result.href : null);
    return { actionId: row.id, status: row.status === "proposed" && row.expires_at && Date.parse(row.expires_at) <= Date.now() ? "expired" : row.status, ...(href ? { href } : {}) };
  });
}
