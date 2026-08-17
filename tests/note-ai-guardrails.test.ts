import { describe, expect, it } from "vitest";
import { evaluateRewriteGuardrail } from "@/features/notes/ai-guardrails";

describe("evaluateRewriteGuardrail", () => {
  it("returns null when output keeps most of the input length", () => {
    expect(evaluateRewriteGuardrail(1000, 950)).toBeNull();
    expect(evaluateRewriteGuardrail(1000, 1200)).toBeNull();
  });

  it("returns a warning when output is far shorter than input", () => {
    const warning = evaluateRewriteGuardrail(1000, 200);
    expect(warning).not.toBeNull();
    expect(warning).toContain("1000");
    expect(warning).toContain("200");
    expect(warning).toContain("丢失");
  });

  it("treats the 35% ratio as the warning boundary", () => {
    expect(evaluateRewriteGuardrail(1000, 351)).toBeNull(); // 35.1% → 无警告
    expect(evaluateRewriteGuardrail(1000, 350)).toBeNull(); // 恰好 35% → 无警告
    expect(evaluateRewriteGuardrail(1000, 349)).not.toBeNull(); // 34.9% → 警告
  });

  it("warns when output collapses to nearly nothing", () => {
    expect(evaluateRewriteGuardrail(1, 0)).not.toBeNull();
  });
});
