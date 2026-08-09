type ErrorLike = {
  cause?: unknown;
  errors?: unknown;
  lastError?: unknown;
  message?: unknown;
  responseBody?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function assistantErrorSignals(error: unknown) {
  const pending = [error];
  const seen = new Set<unknown>();
  const messages: string[] = [];
  const statuses: number[] = [];

  while (pending.length && seen.size < 16) {
    const current = pending.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (typeof current === "string") {
      messages.push(current);
      continue;
    }
    if (typeof current !== "object") continue;
    const value = current as ErrorLike;
    for (const candidate of [value.message, value.responseBody])
      if (typeof candidate === "string") messages.push(candidate);
    for (const candidate of [value.statusCode, value.status]) {
      const status = Number(candidate);
      if (Number.isFinite(status) && status > 0) statuses.push(status);
    }
    pending.push(value.cause, value.lastError);
    if (Array.isArray(value.errors)) pending.push(...value.errors);
  }

  return { status: statuses.at(-1) ?? 0, value: messages.join(" ").toLowerCase() };
}

export function normalizeAssistantError(error: unknown) {
  const { status, value } = assistantErrorSignals(error);
  if (
    status === 401 ||
    value.includes("api key") ||
    value.includes("authentication")
  )
    return {
      code: "api_key_invalid",
      message: "DeepSeek API Key 无效或已失效。请在 Settings 重新保存。",
    };
  if (
    status === 402 ||
    value.includes("balance") ||
    value.includes("insufficient")
  )
    return {
      code: "insufficient_balance",
      message: "DeepSeek 账户余额不足，请充值后重试。",
    };
  if (status === 429 || value.includes("rate limit"))
    return {
      code: "rate_limited",
      message: "DeepSeek 当前请求过于频繁，请稍后重试。",
    };
  if (value.includes("timeout") || value.includes("abort"))
    return { code: "timeout", message: "DeepSeek 响应超时，请重试。" };
  if (
    value.includes("not_configured") ||
    value.includes("credential_unreadable") ||
    value.includes("server_configuration_missing")
  )
    return {
      code: "not_configured",
      message: "请先在 Settings 保存 DeepSeek API Key。",
    };
  if (status === 400 || status === 422)
    return {
      code: "invalid_provider_request",
      message: "DeepSeek 拒绝了当前请求格式，请更新页面后重试。",
    };
  if (status === 403)
    return {
      code: "provider_forbidden",
      message: "DeepSeek 拒绝访问，请检查 API Key 权限后重试。",
    };
  if (status >= 500)
    return {
      code: "provider_overloaded",
      message: "DeepSeek 服务暂时繁忙，请稍后重试。",
    };
  return {
    code: "provider_unavailable",
    message: "AI 助手暂时不可用，请稍后重试。",
  };
}
