import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const assistant = readFileSync(new URL("../src/components/notes/note-ai-assistant.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/features/notes/ai-actions.ts", import.meta.url), "utf8");
const review = readFileSync(new URL("../src/components/notes/note-ai-segment-review.tsx", import.meta.url), "utf8");
describe("Notes AI 3.0 paragraph review workflow", () => {
  it("keeps per-block decisions local until a single protected final apply", () => {
    expect(assistant).toContain("assembleAiSegmentReview(reviewPlan)");
    expect(assistant).toContain("onPrepareApply({");
    expect(assistant).toContain("preservesProtectedNoteStructures(request.content, suggestion)");
    expect(review).toContain("接受这处修改");
    expect(review).toContain("保留原文");
    expect(review).toContain("再次修改这一处");
  });
  it("refuses to apply unfinished or truncated output", () => {
    expect(assistant).toContain("result.truncated || result.unsafeToApply");
    expect(actions).toContain("response.unsafeToApply = true;");
    expect(actions).toContain("restoreChecked(response.suggestion)");
    expect(actions).toContain('scope: z.enum(["note", "selection", "section"])');
  });
  it("applies only to a frozen chapter range and preserves the rest of the note", () => {
    expect(assistant).toContain('scope: chapter ? "section" : "note"');
    expect(assistant).toContain("source.slice(range.from, range.to) !== request.content");
    expect(assistant).toContain("source.slice(0, range.from) + suggestion + source.slice(range.to)");
  });
});
