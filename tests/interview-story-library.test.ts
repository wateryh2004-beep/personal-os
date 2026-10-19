import { describe, expect, it } from "vitest";
import { emptyStoryFilters, filterStoryLibrary, storyFilters, storyFilterQuery, storyLibraryHref, type StoryLibraryRow } from "@/features/interview/story-library";
const rows: StoryLibraryRow[] = [
  { id: "a", title: "ＳＱＬ 口径核对", oneLine: "比较窗口和分组", status: "usable", experienceId: "e1", experienceLabel: "示例研究团队", competencies: [{ id: "c1", label: "数据分析" }], archetypeCount: 2 },
  { id: "b", title: "协作取舍", oneLine: "形成验收条件", status: "draft", experienceId: null, experienceLabel: "", competencies: [{ id: "c2", label: "沟通" }], archetypeCount: 0 },
];
describe("Story library filtering and return paths", () => {
  it("combines normalized multi-term search with independent metadata dimensions", () => {
    expect(filterStoryLibrary(rows, { ...emptyStoryFilters, q: "sql 数据分析", status: "usable", experience: "e1", competency: "c1" }).map(item => item.id)).toEqual(["a"]);
    expect(filterStoryLibrary(rows, { ...emptyStoryFilters, q: "SQL 沟通" })).toEqual([]);
    expect(filterStoryLibrary(rows, { ...emptyStoryFilters, experience: "unbound" }).map(item => item.id)).toEqual(["b"]);
    expect(filterStoryLibrary(rows, { ...emptyStoryFilters, competency: "unknown" })).toEqual([]);
    expect(filterStoryLibrary(rows, emptyStoryFilters)).toEqual(rows);
  });
  it("round-trips all conditions, preserves composing spaces, and keeps return paths internal", () => {
    const filters = { q: "SQL ", status: "usable", experience: "e1", competency: "c1" };
    expect(storyFilters(new URLSearchParams(storyFilterQuery(filters)))).toEqual(filters);
    expect(storyLibraryHref(emptyStoryFilters)).toBe("/career/interview/stories");
    expect(storyLibraryHref({ ...filters, q: "https://elsewhere.test/?private=yes" })).toMatch(/^\/career\/interview\/stories\?/);
    expect(storyFilters(new URLSearchParams("status=unknown&status=usable")).status).toBe("unknown");
    expect(rows[0].title).toBe("ＳＱＬ 口径核对");
  });
});
