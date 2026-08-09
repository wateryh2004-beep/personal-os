import "server-only";
import type { AssistantSupabase } from "./tools/types";

export type AssistantPreferences = {
  defaultRetrospectiveWindowDays: number;
  preferredAnswerDepth: "brief" | "balanced" | "deep";
  inferenceTolerance: "conservative" | "balanced" | "exploratory";
  sourceCitationPreference: "always" | "analytical" | "when_needed";
  analyticalDimensions: string[];
  domainInstructions: Record<string, string>;
};

export const defaultAssistantPreferences: AssistantPreferences = {
  defaultRetrospectiveWindowDays: 21,
  preferredAnswerDepth: "balanced",
  inferenceTolerance: "conservative",
  sourceCitationPreference: "always",
  analyticalDimensions: ["目标", "约束", "证据", "变化", "开放问题", "下一步"],
  domainInstructions: {},
};

export async function loadAssistantPreferences(
  supabase: AssistantSupabase,
  userId: string,
): Promise<AssistantPreferences> {
  try {
    const { data, error } = await supabase
      .from("assistant_preferences")
      .select(
        "default_retrospective_window_days,preferred_answer_depth,inference_tolerance,source_citation_preference,analytical_dimensions,domain_instructions",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return defaultAssistantPreferences;
    const answerDepth = ["brief", "balanced", "deep"].includes(data.preferred_answer_depth)
      ? (data.preferred_answer_depth as AssistantPreferences["preferredAnswerDepth"])
      : defaultAssistantPreferences.preferredAnswerDepth;
    const inferenceTolerance = ["conservative", "balanced", "exploratory"].includes(data.inference_tolerance)
      ? (data.inference_tolerance as AssistantPreferences["inferenceTolerance"])
      : defaultAssistantPreferences.inferenceTolerance;
    const citationPreference = ["always", "analytical", "when_needed"].includes(data.source_citation_preference)
      ? (data.source_citation_preference as AssistantPreferences["sourceCitationPreference"])
      : defaultAssistantPreferences.sourceCitationPreference;
    return {
      defaultRetrospectiveWindowDays: data.default_retrospective_window_days,
      preferredAnswerDepth: answerDepth,
      inferenceTolerance,
      sourceCitationPreference: citationPreference,
      analyticalDimensions: data.analytical_dimensions?.length
        ? data.analytical_dimensions
        : defaultAssistantPreferences.analyticalDimensions,
      domainInstructions:
        data.domain_instructions && typeof data.domain_instructions === "object" && !Array.isArray(data.domain_instructions)
          ? (data.domain_instructions as Record<string, string>)
          : {},
    };
  } catch {
    // This fallback lets the app deploy safely before the owner applies the migration.
    return defaultAssistantPreferences;
  }
}

export function formatAssistantPreferences(preferences: AssistantPreferences) {
  return `ASSISTANT_PREFERENCES\n${JSON.stringify({
    answerDepth: preferences.preferredAnswerDepth,
    inferenceTolerance: preferences.inferenceTolerance,
    sourceCitationPreference: preferences.sourceCitationPreference,
    analyticalDimensions: preferences.analyticalDimensions,
    domainInstructions: preferences.domainInstructions,
  })}`;
}
