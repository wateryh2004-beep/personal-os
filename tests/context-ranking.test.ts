import { describe, expect, it } from "vitest";
import { rankContextCandidates } from "@/features/context/ranking";
import type { ContextCandidate } from "@/features/context/types";

const base: ContextCandidate = {
  key: "x",
  domain: "notes",
  title: "历史笔记",
  content: "曾考虑产品经理",
  origins: ["search"],
  reasons: [],
  score: 100,
  priority: 0,
  timestamp: "2024-01-01T00:00:00Z",
};

describe("Personal Context ranking", () => {
  it("ranks a current confirmed decision above an equally relevant old note", () => {
    const ranked = rankContextCandidates(
      [
        base,
        {
          ...base,
          key: "decision",
          domain: "memory",
          entityType: "decision",
          title: "Decision · 暂停产品岗投递",
          content: "当前决定",
          timestamp: "2026-08-08T00:00:00Z",
        },
      ],
      new Date("2026-08-09T00:00:00Z"),
    );

    expect(ranked[0].entityType).toBe("decision");
    expect(ranked[0].authority).toBeGreaterThan(ranked[1].authority ?? 0);
  });
});
