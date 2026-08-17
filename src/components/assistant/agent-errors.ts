import type { UIMessage } from "ai";
import type { AgentAction } from "@/features/assistant/types";

export type RunStep = { id: string; step_type: string; title: string; summary: string; tool_name?: string | null; output_json?: Record<string, unknown> | null; status: string };
export type RunPayload = {
  run?: { status?: string; error_code?: string | null };
  messages: UIMessage[];
  steps: RunStep[];
  actions: AgentAction[];
};

export const errorsByCode: Record<string, string> = {
  api_key_invalid: "DeepSeek API Key 无效或已失效。请在 Settings 重新保存。",
  insufficient_balance: "DeepSeek 账户余额不足，请充值后重试。",
  invalid_provider_request: "DeepSeek 拒绝了当前请求格式，请更新页面后重试。",
  not_configured: "请先在 Settings 保存 DeepSeek API Key。",
  provider_forbidden: "DeepSeek 拒绝访问，请检查 API Key 权限后重试。",
  provider_overloaded: "DeepSeek 服务暂时繁忙，请稍后重试。",
  provider_unavailable: "AI 助手暂时不可用，请稍后重试。",
  rate_limited: "DeepSeek 当前请求过于频繁，请稍后重试。",
  timeout: "DeepSeek 响应超时，请重试。",
};

export function runError(payload: RunPayload) {
  const code = payload.run?.error_code;
  return payload.run?.status === "failed" && code
    ? errorsByCode[code] ?? "Personal OS Agent 暂时不可用。当前会话已保留，可以重试。"
    : null;
}

export function errorMessage(error: Error | undefined) {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    const safe = Object.values(errorsByCode).find(
      (message) => error.message === message,
    );
    if (safe) return safe;
  }
  return "Personal OS Agent 暂时不可用。当前会话已保留，可以重试。";
}
