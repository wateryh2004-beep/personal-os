import "server-only";

import { generateText, isStepCount, NoSuchToolError, ToolLoopAgent } from "ai";
import { buildPersonalContext } from "@/features/context/engine";
import { formatPersonalContextForModel, mapPersonalContextSources } from "@/features/context/formatter";
import type { ContextSurface } from "@/features/context/types";
import {
  assertAiBudget,
  auditAiRequest,
  completeAiRequestWithUsage,
  getAiGovernance,
  summarizeContextSources,
} from "@/features/ai/governance";
import { getDeepSeekModel } from "@/lib/ai/deepseek";
import { requireOwner } from "@/lib/auth/require-owner";
import { resolveAssistantPolicy } from "./policy";
import { buildAssistantTools } from "./tools";
import { definitionsForNames, unknownToolError } from "./tools/registry";
import { selectAssistantModel, selectReasoningProviderOptionsForRequest } from "./model-router";
import { recordAgentStep, updateAgentRun } from "./persistence";
import { decideContextGate } from "./kernel/context-gate";
import { buildRootAgentPrompt } from "./kernel/prompt-builder";
import { createPrepareStep, initialToolNames } from "./kernel/prepare-step";
import { buildAiExecutionContext, formatCurrentSurfaceForModel } from "./kernel/execution-context";
import { excludeAiGeneratedNotes } from "./retrieval/notes";
import { deriveSessionState } from "./kernel/session-state";
import type { AgentSessionState } from "./kernel/types";
import type { AssistantRequest, AssistantResult, AssistantSurface } from "./types";
import type { AssistantStreamSource } from "./stream-metadata";
import type { GraphEntityRef } from "@/features/graph/types";

type AssistantSupabase = Awaited<ReturnType<typeof requireOwner>>["supabase"];

function latestText(request: AssistantRequest) {
  const fromMessages = request.messages
    ?.slice()
    .reverse()
    .find((message) => message.role === "user")
    ?.parts.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  return request.instruction?.trim() || fromMessages || "请帮助我分析当前内容。";
}

function toContextSurface(surface: AssistantSurface): ContextSurface {
  if (surface === "inbox") return "tasks";
  if (surface === "reviews" || surface === "notes-library") return "notes";
  return surface as ContextSurface;
}

async function resolveSelectedEntitySurface(
  supabase: AssistantSupabase,
  userId: string,
  entity: GraphEntityRef | null | undefined,
) {
  if (!entity) return null;
  if (entity.type === "calendar_event") {
    const { data } = await supabase
      .from("calendar_events")
      .select("id,subject,body_text,starts_at,ends_at,is_all_day,location_name,categories,importance,show_as")
      .eq("id", entity.id)
      .eq("user_id", userId)
      .is("archived_at", null)
      .maybeSingle();
    if (!data) return null;
    return {
      title: `当前选中日程：${data.subject}`,
      content: [
        `实体类型：calendar_event`,
        `实体 ID：${data.id}`,
        `标题：${data.subject}`,
        `开始：${data.starts_at}`,
        `结束：${data.ends_at}`,
        `全天：${data.is_all_day ? "是" : "否"}`,
        data.location_name ? `地点：${data.location_name}` : null,
        `重要性：${data.importance}`,
        `忙闲：${data.show_as}`,
        data.categories?.length ? `分类：${data.categories.join("、")}` : null,
        data.body_text ? `说明：${data.body_text.slice(0, 4_000)}` : null,
      ].filter(Boolean).join("\n"),
    };
  }
  if (entity.type === "todo_task") {
    const { data } = await supabase
      .from("microsoft_todo_tasks")
      .select("id,title,body_text,status,due_at,importance,completed_at,todo_list_id,provider_last_modified_at")
      .eq("id", entity.id)
      .is("archived_at", null)
      .maybeSingle();
    if (!data) return null;
    return {
      title: `当前选中任务：${data.title}`,
      content: [
        `实体类型：todo_task`,
        `实体 ID：${data.id}`,
        `标题：${data.title}`,
        `状态：${data.status}`,
        data.due_at ? `截止：${data.due_at}` : "截止：未设置",
        `重要性：${data.importance}`,
        `清单 ID：${data.todo_list_id}`,
        data.provider_last_modified_at ? `最后修改：${data.provider_last_modified_at}` : null,
        data.body_text ? `说明：${data.body_text.slice(0, 4_000)}` : null,
      ].filter(Boolean).join("\n"),
    };
  }
  if (entity.type === "note") {
    const { data: note } = await supabase
      .from("notes")
      .select("id,title,body_markdown,ai_visibility")
      .eq("id", entity.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .is("archived_at", null)
      .maybeSingle();
    const humanNote = (await excludeAiGeneratedNotes(supabase, note ? [note] : []))[0];
    return humanNote ? { title: humanNote.title, content: humanNote.body_markdown.slice(0, 20_000) } : null;
  }
  return null;
}

async function setup(request: AssistantRequest) {
  const { supabase, userId } = await requireOwner();
  const { data: profile } = await supabase.from("profiles").select("timezone, display_name").eq("user_id", userId).maybeSingle();
  const timezone = profile?.timezone || "Asia/Shanghai";
  const userName = profile?.display_name?.trim() || "Hang Yu";
  const message = latestText(request);
  const now = new Date();
  const policy = resolveAssistantPolicy(request);
  const governance = await getAiGovernance(userId);

  let currentSurface = request.currentSurface?.content
    ? { title: request.currentSurface.title, content: request.currentSurface.content }
    : null;
  if (!currentSurface && request.currentEntity) {
    currentSurface = await resolveSelectedEntitySurface(supabase, userId, request.currentEntity);
  }

  const executionContext = buildAiExecutionContext({ currentSurface, requiresCurrentSurface: request.requiresCurrentSurface, usePersonalContext: request.usePersonalContext });
  const gate = decideContextGate({
    message,
    surface: request.surface,
    currentPath: request.currentPath,
    hasCurrentSurface: Boolean(currentSurface),
    requiresCurrentSurface: request.requiresCurrentSurface,
    usePersonalContext: request.usePersonalContext ?? (request.operation === "askNote" || request.operation === "deepThinkNote"),
  });

  let previous: Partial<AgentSessionState> | null = null;
  if (request.runId) {
    const { data } = await supabase.from("agent_runs").select("kernel_state").eq("id", request.runId).eq("user_id", userId).maybeSingle();
    previous = (data?.kernel_state as Partial<AgentSessionState> | null) ?? null;
  }
  const sessionState = deriveSessionState(previous, request.messages, gate);
  const selectedModel = selectAssistantModel({ surface: request.surface, requestedModel: request.model, message, contextGate: gate });
  const resolved = await getDeepSeekModel(userId, selectedModel);

  let personalContextPack: Awaited<ReturnType<typeof buildPersonalContext>> | null = null;
  if (gate.needsPersonalData) {
    try {
      personalContextPack = await buildPersonalContext({
        message: request.contextQuery?.trim() || message,
        surface: toContextSurface(request.surface),
        currentEntity: request.currentEntity,
        currentSurface: currentSurface
          ? { type: request.currentEntity?.type === "note" ? "note_draft" : "text", title: currentSurface.title, content: currentSurface.content }
          : null,
      });
    } catch {
      // Context enrichment must never make the core assistant unavailable.
    }
  }

  const sourceSummary = summarizeContextSources(personalContextPack);
  const retrievalMode = gate.mode === "none" ? "none" : gate.mode === "local" ? "local" : personalContextPack?.plan.expansionReason ? "expanded" : "targeted";
  const budget = await assertAiBudget(userId, governance);
  if (!budget.allowed) {
    await auditAiRequest({
      userId, runId: request.runId, surface: request.surface, purpose: request.operation ?? request.mode,
      status: "blocked_budget", retrievalMode: gate.mode === "none" ? "none" : gate.mode === "local" ? "local" : "targeted",
      sourceSummary, retrievalReason: personalContextPack?.plan.expansionReason,
      contextChars: sourceSummary.sourceCount ? personalContextPack?.diagnostics.totalChars ?? 0 : 0,
      outputTokenLimit: governance.maxOutputTokensPerRequest, errorCode: budget.code,
    });
    throw new Error(budget.code);
  }

  const personalContextBlock = personalContextPack ? `\n\n${formatPersonalContextForModel(personalContextPack)}` : "";
  const surfaceRules = gate.mode === "none" ? "" : `\n\nSURFACE_RULES\n${policy.instruction}`;
  const includeSelectedSurface = Boolean(request.currentEntity && currentSurface);
  const system = `${buildRootAgentPrompt({
    timezone, now, userName, sessionState, gateDecision: gate,
    currentSurfaceSummary: gate.needsCurrentSurface || includeSelectedSurface ? formatCurrentSurfaceForModel(executionContext) : null,
  })}${surfaceRules}${personalContextBlock}`;
  const initial = gate.needsTools ? initialToolNames(gate) : [];

  const auditId = await auditAiRequest({
    userId, runId: request.runId, surface: request.surface, purpose: request.operation ?? request.mode,
    model: resolved.modelId, status: "allowed", retrievalMode, sourceSummary,
    retrievalReason: personalContextPack?.plan.expansionReason,
    contextChars: personalContextPack?.diagnostics.totalChars ?? 0,
    outputTokenLimit: governance.maxOutputTokensPerRequest,
  });

  if (request.runId) {
    await updateAgentRun({
      supabase, userId, runId: request.runId, status: "running", model: resolved.modelId,
      kernel: { contextMode: gate.mode, complexity: gate.complexity, initialModules: gate.likelyModules, activeSkills: sessionState.activeSkills, initialToolNames: initial, discoveredToolNames: [], sessionState: { ...sessionState, discoveredToolNames: [] } },
    });
    await recordAgentStep({
      supabase, userId, runId: request.runId, stepType: "context",
      title: gate.needsPersonalData ? "已准备必要上下文" : "直接回答",
      summary: gate.needsPersonalData ? `模式 ${gate.mode}；来源 ${sourceSummary.sourceCount} 条` : "本次无需读取 Personal OS",
      output: {
        contextMode: gate.mode, complexity: gate.complexity, initialModules: gate.likelyModules,
        activeSkills: sessionState.activeSkills, initialToolNames: initial,
        personalDataAccessed: Boolean(personalContextPack), promptChars: system.length,
        contextChars: personalContextPack?.diagnostics.totalChars ?? 0, sourceSummary,
        sources: (personalContextPack?.sources ?? []).map(({ id, title, domain, href }) => ({ id, title, domain, href })),
        retrievalReason: personalContextPack?.plan.expansionReason, auditId,
      },
    });
  }

  return {
    supabase, userId, timezone, policy, gate, sessionState, model: resolved.model, modelId: resolved.modelId,
    system, currentSurface, initial, personalContextPack, sourceSummary, retrievalMode, auditId,
    maxOutputTokens: governance.maxOutputTokensPerRequest, governance,
  };
}

export async function createAssistantAgent(request: AssistantRequest) {
  const runtime = await setup(request);
  const streamSources = new Map<string, AssistantStreamSource>();
  for (const source of runtime.personalContextPack?.sources ?? []) {
    streamSources.set(`${source.domain}:${source.href ?? ""}:${source.title}`, { title: source.title, domain: source.domain, href: source.href });
  }
  let duplicateReadCalls = 0;
  const selectedDefinitions = definitionsForNames(runtime.initial);
  const toolGroups = [...new Set(selectedDefinitions.map((definition) => definition.group))];
  const allTools = runtime.initial.length
    ? buildAssistantTools({
        supabase: runtime.supabase,
        userId: runtime.userId,
        policy: { ...runtime.policy, tools: toolGroups },
        timezone: runtime.timezone,
        runId: request.runId,
        toolNames: runtime.initial,
        onSources: (sources) => {
          for (const source of sources) streamSources.set(`${source.domain}:${source.href ?? ""}:${source.title}`, source);
        },
        onDuplicateRead: () => { duplicateReadCalls += 1; },
      })
    : {};
  const toolNames = Object.keys(allTools);

  return {
    ...runtime,
    getStreamSources: () => [...streamSources.values()].slice(0, 24),
    getDuplicateReadCalls: () => duplicateReadCalls,
    agent: new ToolLoopAgent({
      model: runtime.model,
      stopWhen: isStepCount(toolNames.length ? runtime.policy.maxSteps : 1),
      maxOutputTokens: runtime.maxOutputTokens,
      providerOptions: selectReasoningProviderOptionsForRequest({ surface: request.surface, mode: request.mode, operation: request.operation, contextGate: runtime.gate }),
      instructions: runtime.system,
      tools: allTools,
      prepareStep: toolNames.length ? createPrepareStep({ initialToolNames: toolNames }) : undefined,
      experimental_repairToolCall: async ({ error, toolCall }) => {
        if (!NoSuchToolError.isInstance(error)) return null;
        const detail = unknownToolError(toolCall.toolName, toolNames);
        if (request.runId) await recordAgentStep({ supabase: runtime.supabase, userId: runtime.userId, runId: request.runId, stepType: "error", title: "未注册工具调用被拒绝", summary: `${detail.requested} 不在本次请求的工具集中`, output: detail, status: "failed" });
        return null;
      },
    }),
  };
}

export async function runAssistant(request: AssistantRequest): Promise<AssistantResult> {
  const runtime = await setup(request);
  try {
    const { text, finishReason, usage } = await generateText({
      model: runtime.model,
      maxOutputTokens: runtime.maxOutputTokens,
      providerOptions: selectReasoningProviderOptionsForRequest({ surface: request.surface, mode: request.mode, operation: request.operation, contextGate: runtime.gate }),
      system: runtime.system,
      prompt: latestText(request),
    });
    await completeAiRequestWithUsage(runtime.auditId, "completed", { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }, null, runtime.governance);
    await runtime.supabase.from("audit_logs").insert({
      user_id: runtime.userId,
      action: "assist",
      entity_type: request.currentEntity?.type || "assistant",
      entity_id: request.currentEntity?.id ?? null,
      actor_type: "user",
      after_data: { surface: request.surface, mode: request.mode, model: runtime.modelId, context_mode: runtime.gate.mode, personal_data_accessed: Boolean(runtime.personalContextPack), context_sources: runtime.personalContextPack?.sources.length ?? 0, tool_names: [], finish_reason: finishReason },
    });
    return { status: "success", text: text.trim(), finishReason, modelId: runtime.modelId, contextSources: mapPersonalContextSources(runtime.personalContextPack) };
  } catch (error) {
    await completeAiRequestWithUsage(runtime.auditId, "failed", {}, error instanceof Error ? error.message : "ai_request_failed", runtime.governance);
    throw error;
  }
}
