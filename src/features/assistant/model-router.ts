import type { DeepSeekModelId } from "@/lib/ai/deepseek";
import type { AssistantSurface } from "./types";
import type { CognitiveRoute } from "./cognitive-router";

export type AssistantComplexity = "simple" | "moderate" | "complex";

const complexIntent =
  /职业分析|决策|取舍|权衡|长期|跨笔记|跨领域|综合|规划|计划多个|最近.*变化|矛盾|复盘|一周|一个月|why|strategy/i;

export function estimateAssistantComplexity(input: {
  message: string;
  surface: AssistantSurface;
}): AssistantComplexity {
  if (input.surface === "career" || complexIntent.test(input.message))
    return "complex";
  if (input.message.length > 600 || /安排|空闲|结合|比较|分析/.test(input.message))
    return "moderate";
  return "simple";
}

export function selectAssistantModel(input: {
  intent?: string | null;
  surface: AssistantSurface;
  estimatedComplexity?: AssistantComplexity;
  requestedModel?: DeepSeekModelId | null;
  message?: string;
  cognitiveRoute?: CognitiveRoute | null;
}): DeepSeekModelId {
  if (input.requestedModel) return input.requestedModel;
  if (input.cognitiveRoute)
    return input.cognitiveRoute.complexity === "analytical"
      ? "deepseek-v4-pro"
      : "deepseek-v4-flash";
  const complexity =
    input.estimatedComplexity ??
    estimateAssistantComplexity({
      message: [input.intent, input.message].filter(Boolean).join(" "),
      surface: input.surface,
    });
  return complexity === "complex"
    ? "deepseek-v4-pro"
    : "deepseek-v4-flash";
}

export function selectReasoningProviderOptions(route?: CognitiveRoute | null) {
  if (!route || route.complexity === "simple")
    return { deepseek: { thinking: { type: "disabled" as const } } };
  if (route.complexity === "moderate")
    return {
      deepseek: {
        thinking: { type: "enabled" as const },
        reasoningEffort: "high" as const,
      },
    };
  const strongest = [
    "belief_change",
    "contradiction_detection",
    "decision_support",
    "career_strategy",
  ].includes(route.recipe);
  return {
    deepseek: {
      thinking: { type: "enabled" as const },
      reasoningEffort: strongest ? ("max" as const) : ("high" as const),
    },
  };
}
