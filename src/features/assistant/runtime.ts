import "server-only";
import { generateText, isStepCount, ToolLoopAgent } from "ai";
import { getDeepSeekModel } from "@/lib/ai/deepseek";
import { buildPersonalContext } from "@/features/context/engine";
import { formatPersonalContextForModel } from "@/features/context/formatter";
import { requireOwner } from "@/lib/auth/require-owner";
import { BASE_ASSISTANT_SYSTEM_POLICY, resolveAssistantPolicy } from "./policy";
import { buildAssistantTools } from "./tools";
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
  const context =
    policy.context === "personal"
      ? await buildPersonalContext({
          message: latestText(request),
          surface:
            request.surface === "inbox" || request.surface === "global"
              ? "global"
              : request.surface,
          currentEntity: request.currentEntity,
          currentSurface: request.currentSurface?.content
            ? {
                type:
                  request.currentSurface.type === "note_draft"
                    ? "note_draft"
                    : "text",
                title: request.currentSurface.title,
                content: request.currentSurface.content,
              }
            : null,
        })
      : null;
  const resolved = await getDeepSeekModel(userId, request.model ?? undefined);
  const system = `${BASE_ASSISTANT_SYSTEM_POLICY}\n\n${policy.instruction}\n\n当前时间：${nowInZone(timezone)}；时区：${timezone}。${context ? `\n\n${formatPersonalContextForModel(context)}` : ""}`;
  return {
    supabase,
    userId,
    timezone,
    policy,
    context,
    model: resolved.model,
    modelId: resolved.modelId,
    system,
    defaultEventDurationMinutes: resolved.defaultEventDurationMinutes,
  };
}
export async function createAssistantAgent(request: AssistantRequest) {
  const runtime = await setup(request);
  return {
    ...runtime,
    agent: new ToolLoopAgent({
      model: runtime.model,
      stopWhen: isStepCount(runtime.policy.maxSteps),
      maxOutputTokens: runtime.policy.maxOutputTokens,
      providerOptions: { deepseek: { thinking: { type: "disabled" } } },
      instructions: runtime.system,
      tools: buildAssistantTools({
        supabase: runtime.supabase,
        policy: runtime.policy,
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
    providerOptions: { deepseek: { thinking: { type: "disabled" } } },
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
