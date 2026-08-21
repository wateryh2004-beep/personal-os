export const systemDomains = ["tasks", "calendar", "notes", "files", "briefing", "ai"] as const;
export type SystemDomain = (typeof systemDomains)[number];
export const systemStates = ["fresh", "stale", "syncing", "failed", "conflict", "unavailable"] as const;
export type SystemState = (typeof systemStates)[number];
export type SystemEventType = "attempted" | "succeeded" | "failed" | "retry_scheduled" | "conflict_detected" | "unavailable";

export type DomainContract = {
  authoritySource: string;
  replicaRole: string;
  syncDirection: "none" | "pull" | "push" | "bidirectional";
  refreshIntervalSeconds: number | null;
};

/**
 * Boundary implemented by every asynchronous domain adapter. Business adapters
 * retain ownership of provider I/O; this narrow contract only exposes a safe,
 * payload-free operational outcome to the shared status layer.
 */
export type SystemStatusAdapter<TInput = unknown, TResult = unknown> = {
  readonly domain: SystemDomain;
  execute(input: TInput): Promise<TResult>;
  describeFailure(error: unknown): { code: string; summary: string; retryable: boolean };
};

export const domainContracts: Record<SystemDomain, DomainContract> = {
  tasks: { authoritySource: "Microsoft To Do", replicaRole: "Supabase 同步缓存", syncDirection: "bidirectional", refreshIntervalSeconds: 900 },
  calendar: { authoritySource: "Outlook Calendar", replicaRole: "Supabase 同步缓存", syncDirection: "bidirectional", refreshIntervalSeconds: 900 },
  notes: { authoritySource: "Supabase Notes", replicaRole: "无", syncDirection: "none", refreshIntervalSeconds: null },
  files: { authoritySource: "Cloudflare R2 对象", replicaRole: "Supabase 文档元数据", syncDirection: "push", refreshIntervalSeconds: null },
  briefing: { authoritySource: "Supabase Briefing 运行记录", replicaRole: "RSS 信源缓存", syncDirection: "pull", refreshIntervalSeconds: 3600 },
  ai: { authoritySource: "请求时模型响应", replicaRole: "Supabase 脱敏运行元数据", syncDirection: "none", refreshIntervalSeconds: null },
};

export function stateForSnapshot(input: { now: Date; lastSuccessAt?: string | null; lastAttemptAt?: string | null; refreshIntervalSeconds?: number | null; hasFailure?: boolean; hasConflict?: boolean; unavailable?: boolean }): SystemState {
  if (input.hasConflict) return "conflict";
  if (input.unavailable) return "unavailable";
  if (input.hasFailure) return "failed";
  if (input.lastAttemptAt && !input.lastSuccessAt) return "syncing";
  if (!input.lastSuccessAt || !input.refreshIntervalSeconds) return "fresh";
  return Date.parse(input.lastSuccessAt) + input.refreshIntervalSeconds * 1000 >= input.now.getTime() ? "fresh" : "stale";
}

/** Deterministic capped exponential backoff, safe to unit-test and display. */
export function retryAfter(attempt: number, now = new Date()) {
  const seconds = Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

export function safeErrorSummary(value: unknown) {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "operation_failed";
  // Avoid carrying request payloads, tokens, URLs with query strings, or provider bodies into status history.
  return raw.replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 280);
}
