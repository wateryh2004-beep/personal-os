import { describe, expect, it } from "vitest";
import { assessRequirement, meaningfulTerms } from "@/features/career/gap-analysis";

describe("Career Gap Analysis", () => {
  it("同时提取中文和英文有效词", () => {
    const terms = meaningfulTerms("熟悉 Python 与量化研究，required experience with SQL");
    expect(terms).toContain("python");
    expect(terms).toContain("sql");
    expect(terms).toContain("量化");
  });

  it("只把可追溯 Career 事实作为证据", () => {
    const result = assessRequirement("熟悉 Python 量化研究", [{ entityType: "experience_fact", entityId: "fact-1", text: "使用 Python 完成量化研究和回测" }]);
    expect(result.assessment).toBe("strong");
    expect(result.evidence.map((item) => item.entityId)).toEqual(["fact-1"]);
  });

  it("没有证据时保守地标记 missing 而不推断用户不会", () => {
    const result = assessRequirement("持有 CFA 证书", []);
    expect(result.assessment).toBe("missing");
    expect(result.explanation).toContain("尚未记录");
  });
});
