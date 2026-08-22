type WorkspaceName = "today" | "tasks" | "calendar";
type WorkspaceLatencySource = "rsc" | "api";

type WorkspaceLatencySnapshot = {
  type: "workspace_latency";
  workspace: WorkspaceName;
  source: WorkspaceLatencySource;
  traceId: string;
  status: number;
  totalMs: number;
  authMs?: number;
  supabaseMs?: number;
  assembleMs?: number;
  fallbackMs?: number;
  fallback: boolean;
  region: string | null;
};

const traceIdPattern = /^[A-Za-z0-9_-]{8,80}$/;

export function safeWorkspaceTraceId(value?: string | null) {
  return value && traceIdPattern.test(value) ? value : crypto.randomUUID();
}

export class WorkspaceLatencyProfiler {
  readonly traceId: string;
  private readonly startedAt = performance.now();
  private readonly spans = new Map<string, number>();
  private fallback = false;
  private finished = false;

  constructor(
    readonly workspace: WorkspaceName,
    readonly source: WorkspaceLatencySource,
    traceId?: string | null,
  ) {
    this.traceId = safeWorkspaceTraceId(traceId);
  }

  async time<T>(name: string, work: () => PromiseLike<T> | T): Promise<T> {
    const startedAt = performance.now();
    try {
      return await work();
    } finally {
      this.add(name, performance.now() - startedAt);
    }
  }

  timeSync<T>(name: string, work: () => T): T {
    const startedAt = performance.now();
    try {
      return work();
    } finally {
      this.add(name, performance.now() - startedAt);
    }
  }

  noteFallback() {
    this.fallback = true;
  }

  private add(name: string, durationMs: number) {
    this.spans.set(name, (this.spans.get(name) ?? 0) + durationMs);
  }

  private durationMs() {
    return performance.now() - this.startedAt;
  }

  serverTiming() {
    const entries = [...this.spans.entries()].map(
      ([name, duration]) => `${name};dur=${duration.toFixed(1)}`,
    );
    entries.push(`total;dur=${this.durationMs().toFixed(1)}`);
    return entries.join(", ");
  }

  responseHeaders() {
    return {
      "Server-Timing": this.serverTiming(),
      "X-Personal-OS-Trace-Id": this.traceId,
    };
  }

  finish(status = 200): WorkspaceLatencySnapshot {
    const snapshot: WorkspaceLatencySnapshot = {
      type: "workspace_latency",
      workspace: this.workspace,
      source: this.source,
      traceId: this.traceId,
      status,
      totalMs: Math.round(this.durationMs()),
      authMs: rounded(this.spans.get("auth")),
      supabaseMs: rounded(this.spans.get("supabase")),
      assembleMs: rounded(this.spans.get("assemble")),
      fallbackMs: rounded(this.spans.get("fallback")),
      fallback: this.fallback,
      region: process.env.VERCEL_REGION ?? null,
    };

    if (!this.finished && (process.env.VERCEL_ENV || process.env.PERF_DEBUG === "true")) {
      this.finished = true;
      console.info(JSON.stringify(snapshot));
    }
    return snapshot;
  }
}

function rounded(value: number | undefined) {
  return value === undefined ? undefined : Math.round(value);
}

export function createWorkspaceLatencyProfiler(
  workspace: WorkspaceName,
  source: WorkspaceLatencySource,
  traceId?: string | null,
) {
  return new WorkspaceLatencyProfiler(workspace, source, traceId);
}

export function applyWorkspaceLatencyHeaders(response: Response, profiler: WorkspaceLatencyProfiler) {
  for (const [name, value] of Object.entries(profiler.responseHeaders())) {
    response.headers.set(name, value);
  }
  return response;
}
