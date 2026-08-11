import { describe, expect, it } from "vitest";
import { buildAiExecutionContext, formatCurrentSurfaceForModel, MAX_CURRENT_SURFACE_CHARS } from "@/features/assistant/kernel/execution-context";

describe("AI execution context contract", () => {
  it("keeps a transform surface when personal context is enabled", () => {
    const context = buildAiExecutionContext({ requiresCurrentSurface: true, usePersonalContext: true, currentSurface: { title: "测试", content: "当前正文" } });
    expect(context.personalContextEnabled).toBe(true);
    expect(formatCurrentSurfaceForModel(context)).toContain("当前正文");
  });

  it("fails before model invocation when a required surface is absent", () => {
    expect(() => buildAiExecutionContext({ requiresCurrentSurface: true, usePersonalContext: false, currentSurface: null })).toThrow("current_surface_required");
  });

  it("does not silently truncate a long current document", () => {
    expect(() => buildAiExecutionContext({ requiresCurrentSurface: true, usePersonalContext: false, currentSurface: { title: "长文", content: "x".repeat(MAX_CURRENT_SURFACE_CHARS + 1) } })).toThrow("current_surface_too_long");
  });
});
