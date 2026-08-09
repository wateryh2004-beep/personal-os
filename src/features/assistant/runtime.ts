import "server-only";
import { generateText, isStepCount, ToolLoopAgent } from "ai";
import { getDeepSeekModel } from "@/lib/ai/deepseek";
import { buildPersonalContext } from "@/features/context/engine";
import { formatPersonalContextForModel } from "@/features/context/formatter";
import { requireOwner } from "@/lib/auth/require-owner";
import { BASE_ASSISTANT_SYSTEM_POLICY, resolveAssistantPolicy } from "./policy";
import { buildAssistantTools } from "./tools";
import { selectAssistantToolGroups } from "./tool-router";
import { selectAssistantModel, selectReasoningProviderOptions } from "./model-router";
import { recordAgentStep, updateAgentRun } from "./persistence";
import { routeCognitiveTask } from "./cognitive-router";
import { formatCognitiveRecipeForModel, getCognitiveRecipe } from "./recipes/registry";
import { formatAssistantPreferences, loadAssistantPreferences } from "./preferences";
import { buildPersonalOperatingModel, formatPersonalOperatingModel } from "./personal-operating-model";
import type { AssistantRequest, AssistantResult } from "./types";

function latestText(request: AssistantRequest) {
  const fromMessages = request.messages
    ?.slice()
    .reverse()
    .find((message) => message.role === "user")
    ?.parts.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  return (
    request.instruction?.trim() || fromMessages || "请帮助我分析当前内容。"
  );
}
function nowInZone(timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}
async function setup(request: AssistantRequest) {
  const { supabase, userId } = await requireOwner();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const timezone = profile?.timezone || "Asia/Shanghai";
  const policy = resolveAssistantPolicy(request);
  const message = latestText(request);
  const preferences = await loadAssistantPreferences(supabase, userId);
  let currentSurface = request.currentSurface?.content
    ? {
        type:
          request.currentSurface.type === "note_draft"
            ? ("note_draft" as const)
            : ("text" as const),
        title: request.currentSurface.title,
        content: request.currentSurface.content,
      }
    : null;
  if (!currentSurface && request.currentEntity?.type === "note") {
    const { data: note } = await supabase
      .from("notes")
      .select("title,body_markdown")
      .eq("id", request.currentEntity.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .is("archived_at", null)
      .maybeSingle();
    if (note) {
      currentSurface = {
        type: "note_draft",
        title: note.title,
        content: note.body_markdown.slice(0, 20_000),
      };
    }
  }
  const cognitiveRoute = routeCognitiveTask({
    message:
      request.surface === "reviews"
        ? "根据当前本地证据生成结构化内容"
        : message,
    surface: request.surface,
    hasCurrentDocument: Boolean(currentSurface),
    defaultRetrospectiveWindowDays: preferences.defaultRetrospectiveWindowDays,
  });
  const context =
    policy.context === "personal"
      ? await buildPersonalContext({
          message,
          surface:
            request.surface === "inbox" ||
            request.surface === "global" ||
            request.surface === "reviews"
              ? "global"
              : request.surface,
          currentEntity: request.currentEntity,
          currentSurface,
          cognitiveRoute,
        })
      : null;
  const selectedModel = selectAssistantModel({
    surface: request.surface,
    requestedModel: request.model,
    message,
    intent: context?.request.intent,
    cognitiveRoute,
  });
  const resolved = await getDeepSeekModel(userId, selectedModel);
  const operatingModel = buildPersonalOperatingModel(context, preferences);
  const recipe = getCognitiveRecipe(cognitiveRoute.recipe);
  const system = `${BASE_ASSISTANT_SYSTEM_POLICY}\n\n${policy.instruction}\n\n${formatCognitiveRecipeForModel(recipe)}\n\n${formatAssistantPreferences(preferences)}\n\n${formatPersonalOperatingModel(operatingModel)}\n\n当前时间：${nowInZone(timezone)}；时区：${timezone}。${context ? `\n\n${formatPersonalContextForModel(context)}` : ""}`;
  if (request.runId) {
    await updateAgentRun({
      supabase,
      userId,
      runId: request.runId,
      status: "running",
      model: resolved.modelId,
    });
    await recordAgentStep({
      supabase,
      userId,
      runId: request.runId,
      stepType: "context",
      title: "已准备个人上下文",
      summary: context
        ? `选择 ${context.sources.length} 个来源；配方 ${cognitiveRoute.recipe}`
        : "本次请求不需要 Personal Context",
      output: {
        sourceCount: context?.sources.length ?? 0,
        recipe: cognitiveRoute.recipe,
        complexity: cognitiveRoute.complexity,
        retrievalWindowDays: context?.diagnostics.retrievalWindowDays ?? 0,
        semanticAvailable: context?.diagnostics.available.semantic ?? false,
        sources:
          context?.sources.map(({ id, domain, title, href }) => ({
            id,
            domain,
            title,
            href,
          })) ?? [],
      },
    });
  }
  return {
    supabase,
    userId,
    timezone,
    policy,
    context,
    cognitiveRoute,
    preferences,
    model: resolved.model,
    modelId: resolved.modelId,
    system,
    defaultEventDurationMinutes: resolved.defaultEventDurationMinutes,
  };
}
export async function createAssistantAgent(request: AssistantRequest) {
  const runtime = await setup(request);
  const toolGroups = selectAssistantToolGroups({
    surface: request.surface,
    message: latestText(request),
    intent: runtime.context?.request.intent,
    route: runtime.cognitiveRoute,
    available: runtime.policy.tools,
  });
  return {
    ...runtime,
    toolGroups,
    agent: new ToolLoopAgent({
      model: runtime.model,
      stopWhen: isStepCount(runtime.policy.maxSteps),
      maxOutputTokens: runtime.policy.maxOutputTokens,
      providerOptions: selectReasoningProviderOptions(runtime.cognitiveRoute),
      instructions: runtime.system,
      tools: buildAssistantTools({
        supabase: runtime.supabase,
        userId: runtime.userId,
        policy: { ...runtime.policy, tools: toolGroups },
        timezone: runtime.timezone,
        runId: request.runId,
      }),
    }),
  };
}
export async function runAssistant(
  request: AssistantRequest,
): Promise<AssistantResult> {
  const runtime = await setup(request);
  const { text } = await generateText({
    model: runtime.model,
    maxOutputTokens: runtime.policy.maxOutputTokens,
    providerOptions: selectReasoningProviderOptions(runtime.cognitiveRoute),
    system: runtime.system,
    prompt: `${request.instruction || "请处理当前内容。"}${runtime.context ? "\n\n当前内容已经作为上下文来源提供。" : request.currentSurface?.content ? `\n\n当前内容：\n---\n${request.currentSurface.content}\n---` : ""}`,
  });
  await runtime.supabase.from("audit_logs").insert({
    user_id: runtime.userId,
    action: "assist",
    entity_type: request.currentEntity?.type || "assistant",
    entity_id: request.currentEntity?.id ?? null,
    actor_type: "user",
    after_data: {
      surface: request.surface,
      mode: request.mode,
      model: runtime.modelId,
      operation: request.operation ?? null,
      context_source_count: runtime.context?.sources.length ?? 0,
      cognitive_recipe: runtime.cognitiveRoute.recipe,
      reasoning_enabled: runtime.cognitiveRoute.complexity !== "simple",
      tool_names: [],
    },
  });
  return {
    status: "success",
    text: text.trim(),
    modelId: runtime.modelId,
    contextSources:
      runtime.context?.sources.map(({ id, title, domain, href, reasons }) => ({
        id,
        title,
        domain,
        href,
        reasons,
      })) ?? [],
  };
}
