import { expect, it } from "vitest";
import { emptyLibraryFilters, filterWorkspaceItems, type WorkspaceItem, type WorkspaceSearchIndex } from "@/features/interview/workspace-library";

function makeItem(index: number): WorkspaceItem {
  return {
    preparationId: `prep-${index}`, questionId: `question-${index}`, contextId: null,
    prompt: `Question ${index}`, shortTitle: `Title ${index}`, category: "knowledge", categoryLabel: "专业",
    style: "standard", subcategory: "技术面 · SQL", competencies: [], thoughts: "Reasoning",
    answer: `Reference answer ${index}\n\n${"Complete reference body. ".repeat(160)}`, answerId: null,
  };
}

it("normalizes each reference body once across incremental searches with identical results", () => {
  let bodyReads = 0;
  const items = Array.from({ length: 153 }, (_, index) => {
    const item = makeItem(index);
    const answer = item.answer;
    Object.defineProperty(item, "answer", { get: () => { bodyReads += 1; return answer; } });
    return item;
  });
  const queries = ["r", "re", "ref", "refe", "reference"];
  const uncached = queries.map((q) => filterWorkspaceItems(items, { ...emptyLibraryFilters, q }));
  expect(bodyReads).toBe(765);
  bodyReads = 0;
  const index: WorkspaceSearchIndex = new WeakMap();
  queries.forEach((q, queryIndex) => {
    expect(filterWorkspaceItems(items, { ...emptyLibraryFilters, q }, index)).toEqual(uncached[queryIndex]);
  });
  expect(bodyReads).toBe(153);
});

it("indexes new draft snapshots without retaining stale search results for the same preparation", () => {
  const original = makeItem(0);
  const index: WorkspaceSearchIndex = new WeakMap();
  const filters = { ...emptyLibraryFilters, q: "new-keyword" };
  expect(filterWorkspaceItems([original], filters, index)).toEqual([]);
  const edited = { ...original, answer: "New-keyword added while offline" };
  expect(filterWorkspaceItems([edited], filters, index)).toEqual([edited]);
  const restored = { ...edited, answer: original.answer };
  expect(filterWorkspaceItems([restored], filters, index)).toEqual([]);
  expect(filterWorkspaceItems([original], { ...filters, q: "reference" }, index)).toEqual([original]);
});

it("keeps title, learning, competency and Unicode matching identical with indexing", () => {
  const item = { ...makeItem(0), shortTitle: "ＡＢ test", competencies: [{ key: "analysis", label: "判断力" }], learning: { keyMessage: "Randomization", logic: "Causality", pitfalls: "Correlation", nextFocus: "Practice" } };
  const index: WorkspaceSearchIndex = new WeakMap();
  for (const q of ["ab TEST", "randomization 判断力", "correlation", "causality", "missing"]) {
    const filters = { ...emptyLibraryFilters, q, category: "knowledge", domain: "SQL", style: "standard" };
    expect(filterWorkspaceItems([item], filters, index)).toEqual(filterWorkspaceItems([item], filters));
  }
});

it("does not read full bodies for category, domain or style-only filtering", () => {
  let bodyReads = 0;
  const item = makeItem(0);
  Object.defineProperty(item, "answer", { get: () => { bodyReads += 1; return "Answer"; } });
  expect(filterWorkspaceItems([item], { ...emptyLibraryFilters, domain: "SQL", category: "knowledge", style: "standard" }, new WeakMap())).toEqual([item]);
  expect(bodyReads).toBe(0);
});
