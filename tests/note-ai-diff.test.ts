import { describe, expect, it } from "vitest";
import { WORD_DIFF_CHAR_CAP, wordDiff } from "@/features/notes/diff-preview";

describe("wordDiff", () => {
  it("diffs CJK at character granularity", () => {
    const segments = wordDiff(
      "今天天气很好，我们一起去公园散步。",
      "今天天气特别棒，我们一起去公园散步。",
    );
    expect(segments).not.toBeNull();
    const deleted = segments!.filter((s) => s.type === "delete").map((s) => s.text).join("");
    const inserted = segments!.filter((s) => s.type === "insert").map((s) => s.text).join("");
    expect(deleted).toBe("很好");
    expect(inserted).toBe("特别棒");
    expect(segments!.some((s) => s.type === "equal" && s.text.includes("公园散步"))).toBe(true);
  });

  it("keeps ASCII words as single tokens", () => {
    const segments = wordDiff("fix the bug", "fix the bug now");
    expect(segments!.some((s) => s.type === "insert" && s.text.includes("now"))).toBe(true);
    expect(segments!.some((s) => s.type === "equal" && s.text === "fix the bug")).toBe(true);
  });

  it("returns all equal for identical text", () => {
    const segments = wordDiff("完全一致的内容", "完全一致的内容");
    expect(segments!.every((s) => s.type === "equal")).toBe(true);
  });

  it("falls back to null when combined length exceeds the cap", () => {
    const big = "a".repeat(WORD_DIFF_CHAR_CAP);
    expect(wordDiff(big, big + "b")).toBeNull();
  });

  it("treats wiki-link structure as unchanged", () => {
    const segments = wordDiff("见 [[华夏]] 笔记", "见 [[华夏]] 文档");
    const wiki = segments!.find((s) => s.text.includes("[[华夏]]"));
    expect(wiki?.type).toBe("equal");
  });
});
