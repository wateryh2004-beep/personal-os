import { describe, expect, it } from "vitest";
import { routeCognitiveTask } from "@/features/assistant/cognitive-router";
import { buildFallbackContextPlan } from "@/features/context/planner";
import { selectAssistantToolGroups } from "@/features/assistant/tool-router";
import type { AssistantToolGroup } from "@/features/assistant/types";

const available: AssistantToolGroup[] = [
  "search", "calendar_read", "calendar_proposal", "todo_read", "todo_proposal",
  "notes_read", "notes_proposal", "career_read", "career_proposal", "memory_read",
  "memory_proposal", "projects_read", "projects_proposal", "files_read",
];

describe("Cognitive Task Router", () => {
  it.each([
    ["最近我在思考什么？", "retrospective_thinking"],
    ["我最近主要在关注什么？", "retrospective_thinking"],
    ["我最近有哪些想法发生了变化？", "belief_change"],
    ["我这段时间有没有反复纠结的问题？", "retrospective_thinking"],
    ["结合我最近的笔记，你觉得我真正的问题是什么？", "retrospective_thinking"],
    ["我最近是不是改变了对量化的看法？", "belief_change"],
    ["我之前为什么放弃那个方向？", "belief_change"],
    ["我的几条判断是否互相矛盾？", "contradiction_detection"],
    ["我有哪些尚未处理的行动事项？", "open_loops"],
    ["结合当前情况，我下一步最该做什么？", "next_best_action"],
  ])("routes %s to %s", (message, expected) => {
    expect(routeCognitiveTask({ message, surface: "global" }).recipe).toBe(expected);
  });

  it("uses queryless recent retrieval for the concrete regression prompt", () => {
    const message = "最近我在思考什么？知识范围：全部笔记。请优先检索 Notes，并为结论附上可打开的来源；证据不足时明确说明。";
    const route = routeCognitiveTask({ message, surface: "global" });
    const plan = buildFallbackContextPlan({ message, surface: "global", cognitiveRoute: route });
    expect(route.recipe).toBe("retrospective_thinking");
    expect(plan.recentNotes).toMatchObject({ enabled: true, days: 21, expandedDays: 45, minimumNotes: 5 });
    expect(plan.searchQueries).toEqual([]);
    expect(plan.includeWorkingMemory).toBe(true);
    expect(plan.includeRecentHistory).toBe(true);
    expect(plan.includeTimeContext).toBe(false);
  });

  it("keeps calendar mutations on read + proposal tools", () => {
    const message = "明天下午三点帮我安排会议。";
    const route = routeCognitiveTask({ message, surface: "global" });
    expect(route.recipe).toBe("mutation_request");
    expect(selectAssistantToolGroups({ surface: "global", message, route, available })).toEqual([
      "calendar_read",
      "calendar_proposal",
    ]);
  });
});
