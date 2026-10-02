import { expect, it } from "vitest";
import { emptyLibraryFilters, filterWorkspaceItems, normalizeLibraryFilters, workspaceDomain, workspaceUrl, type WorkspaceItem } from "@/features/interview/workspace-library";
const question: WorkspaceItem = { preparationId: "p1", questionId: "q1", contextId: null, prompt: "A question", shortTitle: "Full-width ＡＢ test", category: "knowledge", categoryLabel: "专业", style: "stress", subcategory: "技术面 · SQL与数据分析", competencies: [{ key: "judgment", label: "判断力" }], thoughts: "Window functions", answer: "Explain selection bias", answerId: null, learning: { keyMessage: "", logic: "Randomization", pitfalls: "Correlation", nextFocus: "Practice" } };
it("keeps domains, question types and pressure style orthogonal", () => {
  expect(workspaceDomain(question)).toBe("SQL与数据分析");
  expect(filterWorkspaceItems([question], { ...emptyLibraryFilters, domain: "SQL与数据分析", category: "knowledge", style: "stress" })).toEqual([question]);
  expect(filterWorkspaceItems([question], { ...emptyLibraryFilters, category: "behavioral" })).toEqual([]);
  expect(normalizeLibraryFilters({ category: "stress" })).toMatchObject({ category: "all", style: "stress" });
});
it.each(["ab test", "SELECTION bias", "window 判断力", "randomization", "correlation"])("searches titles, concepts, reasoning and reference bodies: %s", (q) => {
  expect(filterWorkspaceItems([question], { ...emptyLibraryFilters, q })).toEqual([question]);
});
it("keeps unknown and unclassified modules discoverable", () => {
  expect(workspaceDomain({ ...question, subcategory: "future_topic" })).toBe("future_topic");
  expect(workspaceDomain({ ...question, subcategory: "" })).toBe("未分类");
});
it("serializes the exact discovery context and answer version", () => {
  const params = new URL(workspaceUrl("target", "q1", { category: "knowledge", domain: "SQL与数据分析", style: "stress", q: " bias " }, "a2"), "https://local.test").searchParams;
  expect(Object.fromEntries(params)).toEqual({ context: "target", question: "q1", category: "knowledge", domain: "SQL与数据分析", style: "stress", q: "bias", answer: "a2" });
});
