import { describe, expect, it } from "vitest";
import {
  AI_REVIEW_MAX_CHARS, assembleAiSegmentReview, buildAiSegmentReview,
  chooseAiReviewHunk, chooseAllAiReviewHunks, countAiReviewDecisions, reviseAiReviewHunk,
} from "@/features/notes/editor/ai-segment-review";

describe("AI staged paragraph review", () => {
  const original = "# 日志\n\n我今天做了两件事。\n\n第二件事还没有结束。\n\n最后一段保持原样。\n";
  const candidate = "# 日志\n\n今天完成了两件事情。\n\n第二件事仍未结束。\n\n最后一段保持原样。\n";

  it("round-trips accepted and rejected hunks without changing untouched Markdown bytes", () => {
    const plan = buildAiSegmentReview(original, candidate);
    expect(plan).not.toBeNull();
    expect(plan!.hunks.length).toBe(2);
    expect(assembleAiSegmentReview(chooseAllAiReviewHunks(plan!, "accept"))).toBe(candidate);
    expect(assembleAiSegmentReview(chooseAllAiReviewHunks(plan!, "reject"))).toBe(original);
    let mixed = chooseAiReviewHunk(plan!, plan!.hunks[0].id, "accept");
    mixed = chooseAiReviewHunk(mixed, plan!.hunks[1].id, "reject");
    expect(assembleAiSegmentReview(mixed)).toContain("今天完成了两件事情。");
    expect(assembleAiSegmentReview(mixed)).toContain("第二件事还没有结束。");
    expect(assembleAiSegmentReview(mixed)).toContain("最后一段保持原样。");
  });

  it("requires explicit decisions, even for insertion/deletion-only changes", () => {
    const plan = buildAiSegmentReview("A\nB\n", "A\nC\nB\n");
    expect(plan?.hunks.length).toBe(1);
    expect(countAiReviewDecisions(plan!).pending).toBe(1);
    expect(() => assembleAiSegmentReview(plan!)).toThrow("ai_review_pending_decisions");
    expect(assembleAiSegmentReview(chooseAllAiReviewHunks(plan!, "accept"))).toBe("A\nC\nB\n");
  });

  it("refining a paragraph never rewrites the original source or silently accepts", () => {
    const plan = chooseAllAiReviewHunks(buildAiSegmentReview("旧段落\n", "新段落\n")!, "accept");
    const updated = reviseAiReviewHunk(plan, "part-1", "重新修改");
    expect(updated.source).toBe("旧段落\n");
    expect(updated.hunks[0]).toMatchObject({ original: "旧段落\n", suggested: "重新修改\n", decision: "pending" });
    expect(() => assembleAiSegmentReview(updated)).toThrow();
  });

  it("does not fabricate granular results for oversized documents", () => {
    expect(buildAiSegmentReview("a".repeat(AI_REVIEW_MAX_CHARS), "b")).toBeNull();
  });
  it("keeps the original when suggestions are identical", () => {
    const plan = buildAiSegmentReview("原样\n", "原样\n")!;
    expect(plan.hunks).toHaveLength(0);
    expect(assembleAiSegmentReview(plan)).toBe("原样\n");
  });
});
