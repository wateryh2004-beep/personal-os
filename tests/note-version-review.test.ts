import { describe, expect, it } from "vitest";
import { applySelectedVersionChanges, compareNoteVersions, NOTE_VERSION_DIFF_LIMIT } from "@/features/notes/editor/version-review";

describe("Notes historical version comparison", () => {
  it("recovers exact old/current text and selectively restores independent paragraphs", () => {
    const current = "开头\n\n现行甲\n\n中间\n\n现行乙\n\n结尾\n";
    const historical = "开头\n\n历史甲\n\n中间\n\n历史乙\n\n结尾\n";
    const parts = compareNoteVersions(current, historical)!;
    expect(parts.filter(part => part.kind === "changed").length).toBe(2);
    expect(applySelectedVersionChanges(parts, new Set())).toBe(current);
    expect(applySelectedVersionChanges(parts, new Set(parts.filter(p => p.kind === "changed").map(p => p.id)))).toBe(historical);
    const first = parts.find(p => p.kind === "changed")!;
    expect(applySelectedVersionChanges(parts, new Set([first.id]))).toBe("开头\n\n历史甲\n\n中间\n\n现行乙\n\n结尾\n");
  });

  it("preserves GFM tables, fenced code, links and trailing whitespace byte for byte", () => {
    const old = "# A\n\n| a | b |\n| --- | --- |\n| x | 1 |\n\n\`\`\`md\n- code\n\`\`\`\n";
    const current = old.replace("| x | 1 |", "| x | 2 |");
    const p = compareNoteVersions(current, old)!;
    expect(applySelectedVersionChanges(p, new Set())).toBe(current);
    expect(applySelectedVersionChanges(p, new Set(p.filter(x => x.kind === "changed").map(x => x.id)))).toBe(old);
  });

  it("provides a bounded preview for large Markdown documents", () => {
    expect(compareNoteVersions("x".repeat(NOTE_VERSION_DIFF_LIMIT), "y")).toBeNull();
    expect(compareNoteVersions("", "")).toEqual([]);
    const p = compareNoteVersions("", "new\n")!;
    expect(applySelectedVersionChanges(p, new Set([0]))).toBe("new\n");
  });
});
