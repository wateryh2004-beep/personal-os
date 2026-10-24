import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PersonalContextPack } from "@/features/context/types";
import { z } from "zod";

export type AiGovernance = {
  semanticRetrievalOptIn: boolean;
  longTermMemoryOptIn: boolean;
  maxContextCharsPerRequest: number;
  maxOutputTokensPerRequest: number;
  dailyCallLimit: number;
  monthlyCallLimit: number;
  dailyCostLimitUsd: number;
  monthlyCostLimitUsd: number;
  estimatedInputCostPerMillionUsd: number;
  estimatedOutputCostPerMillionUsd: number;
};

export const defaultAiGovernance: AiGovernance = {
  semanticRetrievalOptIn: false,
  longTermMemoryOptIn: false,
  maxContextCharsPerRequest: 12_000,
  maxOutputTokensPerRequest: 1_200,
  dailyCallLimit: 40,
  monthlyCallLimit: 600,
  dailyCostLimitUsd: 2,
  monthlyCostLimitUsd: 20,
  estimatedInputCostPerMillionUsd: 0.5,
  estimatedOutputCostPerMillionUsd: 2,
};

export type SafeSourceSummary = {
  modules: string[];
  entitiesByModule: Record<string, number>;
  timeRange: { from: string | null; to: string | null };
  reasons: string[];
  sourceCount: number;
};

export type AiRequestTelemetry = {
  setupMs?: number;
  ttftMs?: number | null;
  durationMs?: number;
  duplicateReadCalls?: number;
  streamSourceCount?: number;
};

export function summarizeContextSources(pack: PersonalContextPack | null): SafeSourceSummary {
  const sources = pack?.sources ?? [];
  const entitiesByModule: Record<string, number> = {};
  const timestamps = sources.map((source) => source.timestamp).filter((value): value is string => Boolean(value)).sort();
  for (const source of sources) entitiesByModule[source.domain] = (entitiesByModule[source.domain] ?? 0) + 1;
  return {
    modules: Object.keys(entitiesByModule).sort(),
    entitiesByModule,
    timeRange: { from: timestamps.at(0) ?? null, to: timestamps.at(-1) ?? null },
    reasons: [...new Set(sources.flatMap((source) => source.reasons))].slice(0, 8),
    sourceCount: sources.length,
  };
}

export async function getAiGovernance(userId: string): Promise<AiGovernance> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ai_governance_settings")
    .select("semantic_retrieval_opt_in,long_term_memory_opt_in,max_context_chars_per_request,max_output_tokens_per_request,daily_call_limit,monthly_call_limit,daily_cost_limit_usd,monthly_cost_limit_usd,estimated_input_cost_per_million_usd,estimated_output_cost_per_million_usd")
    .eq("user_id", userId).maybeSingle();
  if (error) throw new Error("ai_governance_unavailable");
  if (!data) return defaultAiGovernance;
  return {
    semanticRetrievalOptIn: data.semantic_retrieval_opt_in,
    longTermMemoryOptIn: data.long_term_memory_opt_in,
    maxContextCharsPerRequest: data.max_context_chars_per_request,
    maxOutputTokensPerRequest: data.max_output_tokens_per_request,
    dailyCallLimit: data.daily_call_limit,
    monthlyCallLimit: data.monthly_call_limit,
    dailyCostLimitUsd: Number(data.daily_cost_limit_usd),
    monthlyCostLimitUsd: Number(data.monthly_cost_limit_usd),
    estimatedInputCostPerMillionUsd: Number(data.estimated_input_cost_per_million_usd),
    estimatedOutputCostPerMillionUsd: Number(data.estimated_output_cost_per_million_usd),
  };
}

function utcStart(now: Date, period: "day" | "month") {
  return period === "day"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function assertAiBudget(userId: string, governance: AiGovernance, now = new Date()) {
  const admin = createAdminClient();
  const [daily, monthly] = await Promise.all([
    admin.from("ai_request_audits").select("estimated_cost_usd", { count: "exact" }).eq("user_id", userId).in("status", ["allowed", "completed", "failed", "cancelled"]).is("archived_at", null).gte("created_at", utcStart(now, "day").toISOString()),
    admin.from("ai_request_audits").select("estimated_cost_usd", { count: "exact" }).eq("user_id", userId).in("status", ["allowed", "completed", "failed", "cancelled"]).is("archived_at", null).gte("created_at", utcStart(now, "month").toISOString()),
  ]);
  if (daily.error || monthly.error) return { allowed: false as const, code: "ai_budget_unavailable" };
  const dailyCost = (daily.data ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
  const monthlyCost = (monthly.data ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
  if ((daily.count ?? 0) >= governance.dailyCallLimit) return { allowed: false as const, code: "daily_call_limit" };
  if ((monthly.count ?? 0) >= governance.monthlyCallLimit) return { allowed: false as const, code: "monthly_call_limit" };
  if (dailyCost >= governance.dailyCostLimitUsd) return { allowed: false as const, code: "daily_cost_limit" };
  if (monthlyCost >= governance.monthlyCostLimitUsd) return { allowed: false as const, code: "monthly_cost_limit" };
  return { allowed: true as const };
}

export async function auditAiRequest(input: {
  userId: string;
  runId?: string | null;
  surface: string;
  purpose: string;
  model?: string | null;
  status: "allowed" | "completed" | "failed" | "blocked_budget" | "blocked_privacy" | "cancelled";
  retrievalMode: "none" | "local" | "targeted" | "expanded";
  sourceSummary: SafeSourceSummary;
  retrievalReason?: string | null;
  contextChars: number;
  outputTokenLimit: number;
  errorCode?: string | null;
  reservedCostUsd?: number;
}) {
  const admin = createAdminClient();
  const metadata = {
    user_id: input.userId, run_id: input.runId ?? null, surface: input.surface, purpose: input.purpose,
    model: input.model ?? null, status: input.status, retrieval_mode: input.retrievalMode,
    source_summary: input.sourceSummary, retrieval_reason: input.retrievalReason ?? "",
    context_chars: input.contextChars, output_token_limit: input.outputTokenLimit,
    error_code: input.errorCode ?? null,
    reserved_cost_usd: input.reservedCostUsd ?? 0,
    completed_at: ["completed", "failed", "blocked_budget", "blocked_privacy", "cancelled"].includes(input.status) ? new Date().toISOString() : null,
  };
  if (input.status === "allowed") {
    const { data, error } = await admin.rpc("reserve_ai_request", { p_user_id: input.userId, p_metadata: metadata });
    if (error) throw new Error("ai_budget_unavailable");
    const result = z.object({ id: z.string().uuid(), allowed: z.boolean(), code: z.string().nullable() }).parse(data);
    if (!result.allowed) throw new Error(result.code ?? "ai_budget_blocked");
    return result.id;
  }
  const { data, error } = await admin.from("ai_request_audits").insert(metadata).select("id").single();
  if (error || !data) throw new Error("ai_audit_unavailable");
  return data.id as string;
}

export async function completeAiRequest(auditId: string, status: "completed" | "failed" | "cancelled", errorCode?: string | null) {
  await completeAiRequestWithUsage(auditId, status, {}, errorCode);
}

export function estimateAiCostUsd(governance: AiGovernance, inputTokens?: number, outputTokens?: number) {
  return ((inputTokens ?? 0) * governance.estimatedInputCostPerMillionUsd + (outputTokens ?? 0) * governance.estimatedOutputCostPerMillionUsd) / 1_000_000;
}

export async function completeAiRequestWithUsage(
  auditId: string,
  status: "completed" | "failed" | "cancelled",
  usage: { inputTokens?: number; outputTokens?: number },
  errorCode?: string | null,
  governance = defaultAiGovernance,
  completion?: { sourceSummary?: SafeSourceSummary; telemetry?: AiRequestTelemetry; contextChars?: number },
) {
  const admin = createAdminClient();
  const hasUsage = usage.inputTokens !== undefined && usage.outputTokens !== undefined;
  const patch: Record<string, unknown> = {
    status,
    error_code: errorCode ?? null,
    input_tokens: usage.inputTokens ?? null,
    output_tokens: usage.outputTokens ?? null,
    completed_at: new Date().toISOString(),
  };
  // Missing provider usage is unknown spend. Keep its reservation instead of
  // reporting a free failed/cancelled call and releasing the budget.
  if (hasUsage) {
    patch.estimated_cost_usd = estimateAiCostUsd(governance, usage.inputTokens, usage.outputTokens);
    if (status === "completed") patch.reserved_cost_usd = 0;
  }
  if (completion?.contextChars !== undefined) patch.context_chars = completion.contextChars;
  if (completion?.sourceSummary) {
    patch.source_summary = completion.telemetry
      ? { ...completion.sourceSummary, telemetry: completion.telemetry }
      : completion.sourceSummary;
  }
  const { error } = await admin.from("ai_request_audits").update(patch).eq("id", auditId);
  if (error) throw new Error("ai_audit_completion_failed");
}

/** Every non-streaming provider invocation uses the same reservation and audit. */
export async function withGovernedAiCall<T extends { usage: { inputTokens?: number; outputTokens?: number } }>(
  input: { userId: string; surface: string; purpose: string; model: string; prompt: string; system: string; maxOutputTokens?: number; sourceCount?: number },
  call: (limits: { maxOutputTokens: number }) => Promise<T>,
): Promise<T> {
  const governance = await getAiGovernance(input.userId);
  const contextChars = input.prompt.length + input.system.length;
  const maxOutputTokens = Math.min(input.maxOutputTokens ?? governance.maxOutputTokensPerRequest, governance.maxOutputTokensPerRequest);
  const sourceSummary: SafeSourceSummary = { modules: [input.surface], entitiesByModule: { [input.surface]: input.sourceCount ?? 1 }, timeRange: { from: null, to: null }, reasons: [input.purpose], sourceCount: input.sourceCount ?? 1 };
  if (contextChars > governance.maxContextCharsPerRequest) {
    await auditAiRequest({ ...input, status: "blocked_budget", retrievalMode: "local", sourceSummary, contextChars, outputTokenLimit: maxOutputTokens, errorCode: "ai_context_limit" });
    throw new Error("ai_context_limit");
  }
  const auditId = await auditAiRequest({ ...input, status: "allowed", retrievalMode: "local", sourceSummary,
    contextChars, outputTokenLimit: maxOutputTokens,
    reservedCostUsd: estimateAiCostUsd(governance, Buffer.byteLength(input.system + input.prompt, "utf8"), maxOutputTokens),
  });
  try {
    const result = await call({ maxOutputTokens });
    await completeAiRequestWithUsage(auditId, "completed", result.usage, null, governance);
    return result;
  } catch (error) {
    await completeAiRequestWithUsage(auditId, "failed", {}, "ai_provider_request_failed", governance);
    throw error;
  }
}
