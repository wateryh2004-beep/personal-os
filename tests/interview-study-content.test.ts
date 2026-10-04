import { describe, expect, it } from "vitest";
import { prepareStudyContent } from "@/features/interview/study-content";

describe("read-only interview section presentation", () => {
  it("folds only observed source headings and preserves every original byte", () => {
    const original = "## 来源与目标岗位\r\nSynthetic context\r\n\r\n## 概念白话解释\r\n100−20−15=65，不是90。\r\n\r\n## 来源核验记录\r\n### Synthetic reference\r\n- 来源类型：primary_reference\r\n- 作者或发布方：未披露\r\n\r\n## 使用方法\r\nCheck each assumption.\r\n\r\n## 使用边界\r\n这是教学算例。\r\n";
    const result = prepareStudyContent(original);
    expect(result.reading).toContain("100−20−15=65，不是90。");
    expect(result.reading).toContain("Check each assumption.");
    expect(result.reading).not.toContain("primary_reference");
    expect(result.references).toContain("primary_reference");
    expect(result.references).toContain("这是教学算例。");
    expect(result.original).toBe(original);
    expect(result.segments.map((segment) => segment.markdown).join("")).toBe(original);
  });

  it("retains unknown headings, arbitrary caveats, and numeric corrections in prose", () => {
    const original = "免责声明：这是教学例子，不是个人业绩。\n\n## 适用边界解释\n100−20−15=65，而90遗漏了必要扣减。\n\n## 来源核验记录补充\nDo not delete me.\n\n### 参考资料\nNested content stays.\n\n## 使用边界#\nLiteral hash stays.";
    expect(prepareStudyContent(original).reading).toBe(original);
  });

  it.each(["```", "~~~~"])("does not move headings inside a %s fenced example", (delimiter) => {
    const original = `${delimiter}text\n## 来源核验记录\nprimary_reference is just data.\n${delimiter}\n\n## 参考资料\nOutside reference.\n\n## 深入追问与参考应答\nKeep this useful answer.`;
    const result = prepareStudyContent(original);
    expect(result.reading).toContain("## 来源核验记录");
    expect(result.reading).toContain("Keep this useful answer.");
    expect(result.references).toContain("Outside reference.");
    expect(result.references).not.toContain("just data");
  });

  it("does not close a fence with a shorter or different delimiter", () => {
    const original = "````markdown\n```\n## 使用边界\nExample\n~~~\n## 参考资料\nStill code\n````";
    expect(prepareStudyContent(original).reading).toBe(original);
  });

  it("ends a recognized section at an actual level-one heading", () => {
    const result = prepareStudyContent("## 参考资料\nReference.\n# A new answer\n100−20−15=65");
    expect(result.references).not.toContain("65");
    expect(result.reading).toContain("100−20−15=65");
  });

  it.each([
    "<!--\n## 使用边界\n-->\nAnswer",
    "## Answer\n[Read][source]\n## 参考资料\n[source]: https://example.com",
    "## 参考资料\nReference.\nNew section\n===\nAnswer",
  ])("falls back intact when section context requires a full Markdown parser", (original) => {
    expect(prepareStudyContent(original).reading).toBe(original);
    expect(prepareStudyContent(original).references).toBe("");
  });

  it("exposes unknown JSON only as original content without inventing semantic keys", () => {
    const original = '{"provenance_audit":{"primary_reference":"unverified"},"example":"100−20−15=65 vs 90"}';
    expect(prepareStudyContent(original)).toMatchObject({ format: "structured-original", original, reading: "", references: "" });
    expect(prepareStudyContent('{"incomplete":').reading).toBe('{"incomplete":');
  });
});
