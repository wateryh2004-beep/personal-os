import "server-only";
import type { UIMessage } from "ai";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import type {
  AgentAction,
  AgentRiskLevel,
  AssistantSurface,
} from "./types";
import type { AgentSessionState, ContextMode, PersonalOsModuleId, RequestComplexity } from "./kernel/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const runIdSchema = z.string().uuid();
const persistedMessageMaxChars = 384_000;
const safeText = (value: unknown, max: number) =>
  String(value ?? "").trim().slice(0, max);

function textFromMessage(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> =>
      part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .slice(0, persistedMessageMaxChars);
}

export async function createAgentRun(input: {
  supabase: Supabase;
  userId: string;
  surface: AssistantSurface;
  userRequest?: string | null;
  currentPath?: string | null;
  currentEntity?: { type: string; id: string } | null;
}) {
  const { data, error } = await input.supabase
    .from("agent_runs")
    .insert({
      user_id: input.userId,
      surface: input.surface,
      status: "pending",
      user_request: safeText(input.userRequest, 10_000),
      current_path: safeText(input.currentPath, 1000) || null,
      current_entity_type: safeText(input.currentEntity?.type, 100) || null,
      current_entity_id: input.currentEntity?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("agent_persistence_unavailable");
  await input.supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: "agent_run_created",
    entity_type: "agent_run",
    entity_id: data.id,
    actor_type: "user",
    after_data: { surface: input.surface },
  });
  return data.id as string;
}

export async function assertOwnedRun(
  supabase: Supabase,
  userId: string,
  runId: string,
) {
  const parsed = runIdSchema.safeParse(runId);
  if (!parsed.success) throw new Error("agent_run_invalid");
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id,status,surface")
    .eq("id", parsed.data)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("agent_run_unavailable");
  return data as { id: string; status: string; surface: AssistantSurface };
}

export async function persistAgentMessage(input: {
  supabase: Supabase;
  userId: string;
  runId: string;
  message: UIMessage;
}) {
  const text = textFromMessage(input.message);
  if (!text) return;
  const { error } = await input.supabase.from("agent_messages").upsert(
    {
      run_id: input.runId,
      user_id: input.userId,
      external_id: safeText(input.message.id, 200),
      role: input.message.role,
      content_json: { text },
    },
    { onConflict: "run_id,external_id", ignoreDuplicates: true },
  );
  if (error) throw new Error("agent_message_persistence_failed");
  if (input.message.role === "user") {
    await input.supabase
      .from("agent_runs")
      .update({ user_request: text.slice(0, 10_000) })
      .eq("id", input.runId)
      .eq("user_id", input.userId)
      .eq("user_request", "");
  }
}

export async function recordAgentStep(input: {
  supabase: Supabase;
  userId: string;
  runId?: string | null;
  stepType: "context" | "reasoning_summary" | "tool" | "proposal" | "result" | "error";
  toolName?: string | null;
  title: string;
  summary?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status?: "running" | "succeeded" | "failed";
}) {
  if (!input.runId) return;
  const { count } = await input.supabase
    .from("agent_steps")
    .select("id", { count: "exact", head: true })
    .eq("run_id", input.runId);
  const { error } = await input.supabase.from("agent_steps").insert({
    run_id: input.runId,
    user_id: input.userId,
    step_index: count ?? 0,
    step_type: input.stepType,
    tool_name: safeText(input.toolName, 120) || null,
    title: safeText(input.title, 240) || "Agent step",
    summary: safeText(input.summary, 2000),
    input_json: input.input ?? {},
    output_json: input.output ?? {},
    status: input.status ?? "succeeded",
  });
  if (!error && input.stepType === "tool") {
    await input.supabase.from("audit_logs").insert({
      user_id: input.userId,
      action: "agent_tool_used",
      entity_type: "agent_run",
      entity_id: input.runId,
      actor_type: "assistant",
      after_data: {
        tool_name: safeText(input.toolName, 120),
        status: input.status ?? "succeeded",
      },
    });
  }
}

export async function storeAgentAction(input: {
  supabase: Supabase;
  userId: string;
  runId?: string | null;
  domain: AgentAction["domain"];
  actionType: string;
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
  riskLevel: Exclude<AgentRiskLevel, "read">;
}) {
  if (!input.runId) return null;
  const { data, error } = await input.supabase
    .from("agent_actions")
    .insert({
      run_id: input.runId,
      user_id: input.userId,
      domain: input.domain,
      action_type: input.actionType,
      payload_json: input.payload,
      preview_json: input.preview,
      risk_level: input.riskLevel,
      status: "proposed",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("agent_action_persistence_failed");
  await Promise.all([
    input.supabase
      .from("agent_runs")
      .update({ status: "awaiting_approval" })
      .eq("id", input.runId)
      .eq("user_id", input.userId),
    input.supabase.from("audit_logs").insert({
      user_id: input.userId,
      action: "agent_action_proposed",
      entity_type: "agent_action",
      entity_id: data.id,
      actor_type: "assistant",
      after_data: {
        run_id: input.runId,
        domain: input.domain,
        action_type: input.actionType,
        risk_level: input.riskLevel,
      },
    }),
  ]);
  await recordAgentStep({
    ...input,
    stepType: "proposal",
    toolName: input.actionType,
    title: "已生成待确认操作",
    summary: `${input.domain} · ${input.actionType}`,
    output: { actionId: data.id, expiresInHours: 24 },
  });
  return data.id as string;
}

export async function updateAgentRun(input: {
  supabase: Supabase;
  userId: string;
  runId: string;
  status: "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";
  model?: string | null;
  errorCode?: string | null;
  kernel?: {
    contextMode: ContextMode;
    complexity: RequestComplexity;
    initialModules: PersonalOsModuleId[];
    activeSkills: string[];
    initialToolNames: string[];
    discoveredToolNames?: string[];
    sessionState: AgentSessionState;
  };
}) {
  const now = new Date().toISOString();
  const { error } = await input.supabase
    .from("agent_runs")
    .update({
      status: input.status,
      model: input.model ?? undefined,
      error_code: input.errorCode ?? null,
      context_mode: input.kernel?.contextMode,
      request_complexity: input.kernel?.complexity,
      initial_modules: input.kernel?.initialModules,
      active_skills: input.kernel?.activeSkills,
      initial_tool_names: input.kernel?.initialToolNames,
      discovered_tool_names: input.kernel?.discoveredToolNames,
      kernel_state: input.kernel?.sessionState,
      completed_at: ["completed", "failed", "cancelled"].includes(input.status)
        ? now
        : null,
    })
    .eq("id", input.runId)
    .eq("user_id", input.userId);
  if (!error && input.status === "running") {
    await input.supabase
      .from("agent_runs")
      .update({ started_at: now })
      .eq("id", input.runId)
      .eq("user_id", input.userId)
      .is("started_at", null);
  }
  if (!error && input.status !== "running") {
    await input.supabase.from("audit_logs").insert({
      user_id: input.userId,
      action: `agent_run_${input.status}`,
      entity_type: "agent_run",
      entity_id: input.runId,
      actor_type: "assistant",
      after_data: {
        model: input.model ?? null,
        error_code: input.errorCode ?? null,
      },
    });
  }
}

export async function getAgentRun(
  supabase: Supabase,
  userId: string,
  runId: string,
) {
  await assertOwnedRun(supabase, userId, runId);
  const [run, messages, steps, actions] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id,surface,status,model,current_path,created_at,updated_at,error_code,context_mode,request_complexity,initial_modules,active_skills,initial_tool_names,kernel_state")
      .eq("id", runId)
      .single(),
    supabase
      .from("agent_messages")
      .select("id,external_id,role,content_json,created_at")
      .eq("run_id", runId)
      .order("created_at"),
    supabase
      .from("agent_steps")
      .select("id,step_index,step_type,tool_name,title,summary,output_json,status,created_at")
      .eq("run_id", runId)
      .order("step_index")
      .order("created_at"),
    supabase
      .from("agent_actions")
      .select("id,run_id,domain,action_type,status,preview_json,risk_level,error_code,result_json,created_at")
      .eq("run_id", runId)
      .order("created_at"),
  ]);
  if (run.error || messages.error || steps.error || actions.error)
    throw new Error("agent_run_load_failed");
  return {
    run: run.data,
    messages: (messages.data ?? []).map((message) => ({
      id: message.external_id || message.id,
      role: message.role,
      parts: [
        {
          type: "text" as const,
          text: safeText(
            (message.content_json as { text?: unknown } | null)?.text,
            persistedMessageMaxChars,
          ),
        },
      ],
    })),
    steps: steps.data ?? [],
    actions: (actions.data ?? []).map((action) => ({
      id: action.id,
      runId: action.run_id,
      domain: action.domain,
      actionType: action.action_type,
      status: action.status,
      preview: action.preview_json,
      riskLevel: action.risk_level,
      errorCode: action.error_code,
      result: action.result_json,
    })) as AgentAction[],
  };
}

/** The database is authoritative for restoring a document discussion on any device. */
export async function getLatestNoteAgentRun(
  supabase: Supabase,
  userId: string,
  noteId: string,
) {
  if (!runIdSchema.safeParse(noteId).success) throw new Error("agent_run_invalid");
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("user_id", userId)
    .eq("surface", "notes")
    .eq("current_entity_type", "note")
    .eq("current_entity_id", noteId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("agent_run_load_failed");
  return data ? getAgentRun(supabase, userId, data.id) : null;
}
