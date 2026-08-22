import { describe, expect, it } from "vitest";
import {
  applyWorkspaceLatencyHeaders,
  createWorkspaceLatencyProfiler,
  safeWorkspaceTraceId,
} from "@/lib/performance/workspace-latency";

describe("workspace latency profiling", () => {
  it("accepts only bounded opaque trace identifiers", () => {
    expect(safeWorkspaceTraceId("trace_12345678")).toBe("trace_12345678");
    expect(safeWorkspaceTraceId("bad trace")).not.toBe("bad trace");
    expect(safeWorkspaceTraceId("x")).not.toBe("x");
  });

  it("emits Server-Timing without private payload data", async () => {
    const profiler = createWorkspaceLatencyProfiler("today", "api", "trace_12345678");
    await profiler.time("auth", async () => undefined);
    await profiler.time("supabase", async () => undefined);
    profiler.timeSync("assemble", () => undefined);

    const response = applyWorkspaceLatencyHeaders(new Response(null), profiler);
    const timing = response.headers.get("Server-Timing") ?? "";

    expect(timing).toContain("auth;dur=");
    expect(timing).toContain("supabase;dur=");
    expect(timing).toContain("assemble;dur=");
    expect(timing).toContain("total;dur=");
    expect(response.headers.get("X-Personal-OS-Trace-Id")).toBe("trace_12345678");
    expect(timing).not.toContain("trace_12345678");
  });

  it("marks fallback separately from the normal database round trip", async () => {
    const profiler = createWorkspaceLatencyProfiler("tasks", "rsc");
    profiler.noteFallback();
    await profiler.time("fallback", async () => undefined);
    const snapshot = profiler.finish(200);

    expect(snapshot.fallback).toBe(true);
    expect(snapshot.fallbackMs).toBeTypeOf("number");
    expect(snapshot.status).toBe(200);
  });
});
