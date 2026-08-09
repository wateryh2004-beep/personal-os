import { describe, expect, it } from "vitest";
import { selectAssistantToolGroups } from "@/features/assistant/tool-router";
import type { AssistantToolGroup } from "@/features/assistant/types";

const available: AssistantToolGroup[] = [
  "search",
  "calendar_read",
  "calendar_proposal",
  "todo_read",
  "todo_proposal",
  "notes_read",
  "notes_proposal",
  "career_read",
  "career_proposal",
  "memory_read",
  "memory_proposal",
  "projects_read",
  "projects_proposal",
  "files_read",
];

describe("Global Agent tool routing", () => {
  it("answers identity questions from prepared Personal Context", () => {
    expect(
      selectAssistantToolGroups({
        surface: "global",
        message: "你知道我是谁吗？",
        intent: "personal_analysis",
        available,
      }),
    ).toEqual([]);
  });

  it("only exposes relevant read and proposal tools", () => {
    expect(
      selectAssistantToolGroups({
        surface: "global",
        message: "把明天下午的日程改到三点",
        intent: "time_planning",
        available,
      }),
    ).toEqual(["calendar_read", "calendar_proposal"]);
  });

  it("keeps proposal tools hidden for read-only recall", () => {
    expect(
      selectAssistantToolGroups({
        surface: "global",
        message: "找出我之前关于量化实习的笔记",
        intent: "career_analysis",
        available,
      }),
    ).toEqual(["search", "notes_read", "career_read", "memory_read"]);
  });
});
