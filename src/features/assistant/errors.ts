export function normalizeAssistantError(error: unknown) {
  const value = error instanceof Error ? error.message.toLowerCase() : "";
  const status =
    typeof error === "object" && error && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
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
  if (value.includes("not_configured"))
    return {
      code: "not_configured",
      message: "请先在 Settings 保存 DeepSeek API Key。",
    };
  return {
    code: "provider_unavailable",
    message: "AI 助手暂时不可用，请稍后重试。",
  };
}
