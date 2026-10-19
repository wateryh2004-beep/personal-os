import { describe, expect, it } from "vitest";
import { emptyExperienceFilters, experienceDates, experienceFilters, experienceHistoryDate, experienceLibraryHref, filterExperiences, safeOutputHref, type ExperienceRow } from "@/features/career/experience-library";

const first: ExperienceRow = { id: "e1", organization: "Example研究", role: "SQL分析", department: "数据团队", location: "北京", experience_type: "internship", is_current: true, start_date: "2026-01-01", end_date: null, status: "confirmed", confidentiality_level: "private" };
const rows: ExperienceRow[] = [first, { ...first, id: "e2", organization: "示例大学", experience_type: "education", is_current: false, status: "draft" }];
describe("Experience metadata browsing", () => {
  it("combines case/NFKC multi-term metadata search with all independent dimensions", () => {
    const filter = { q: "ＥＸＡＭＰＬＥ SQL 北京", type: "internship", period: "current", status: "confirmed" };
    expect(filterExperiences(rows, filter).map(row => row.id)).toEqual(["e1"]);
    expect(filterExperiences(rows, { ...filter, period: "past" })).toEqual([]);
    expect(filterExperiences(rows, { ...emptyExperienceFilters, q: "数据团队" })).toHaveLength(2);
    expect(filterExperiences(rows, { ...emptyExperienceFilters, type: "future" })).toEqual([]);
    expect(filterExperiences(rows, { ...emptyExperienceFilters, period: "unknown" })).toEqual([]);
    expect(filterExperiences(rows, emptyExperienceFilters)).toEqual(rows);
  });
  it("preserves composing spaces and unknown conditions using a fixed internal route", () => {
    const filter = experienceFilters(new URLSearchParams("q=SQL+&type=future&period=other&status=legacy&returnTo=https://outside.test&create=1"));
    const href = experienceLibraryHref(filter);
    expect(href).toBe("/career/experiences?q=SQL+&type=future&period=other&status=legacy");
    expect(experienceFilters(new URLSearchParams(href.split("?")[1]))).toEqual(filter);
  });
  it("does not invent end dates or ongoing status", () => {
    expect(experienceDates(first)).toContain("至今");
    expect(experienceDates({ ...first, is_current: false })).toContain("未填写结束日期");
    expect(experienceDates({ ...first, start_date: null })).toContain("未填写开始日期");
  });
  it("only activates explicit http/https output links", () => {
    expect(safeOutputHref("https://example.com/report")).toBe("https://example.com/report");
    for (const value of ["javascript:alert(1)", "data:text/html,<script>", "/private", "bad", null]) expect(safeOutputHref(value)).toBeNull();
  });
  it("shows history in the configured timezone rather than the server timezone", () => {
    expect(experienceHistoryDate("2026-01-01T00:00:00Z", "America/New_York")).toContain("2025/12/31");
    expect(experienceHistoryDate("2026-01-01T00:00:00Z", "Asia/Shanghai")).toContain("2026/1/1");
    expect(experienceHistoryDate("2026-01-01T00:00:00Z", "invalid-zone")).toContain("UTC");
  });
});
