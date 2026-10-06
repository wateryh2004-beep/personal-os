import { describe, expect, it } from "vitest";
import { prepareInterviewAnswer, prepareStudyContent } from "@/features/interview/study-content";

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

describe("answer and explanation boundary", () => {
  it("separates canonical full answer from teaching without truncating the answer", () => {
    const raw = "## 标准答案\r\n我的结论是65。\r\n### 限制条件\r\n只有这些条件成立才适用。\r\n\r\n## 思路拆解讲解\r\n先算100−20−15。\r\n\r\n## 参考资料\r\nhttps://example.com";
    const result = prepareInterviewAnswer(raw);
    expect(result.answer).toContain("我的结论是65。");
    expect(result.answer).toContain("只有这些条件成立才适用。");
    expect(result.answer).not.toContain("先算");
    expect(result.explanation).toContain("先算100−20−15。");
    expect(result.explanation).not.toContain("## 思路拆解讲解");
    expect(result.references).toContain("https://example.com");
    expect(result.segments.map((segment) => segment.markdown).join("")).toBe(raw);
    expect(result.original).toBe(raw);
  });

  it("keeps follow-ups and recaps out of a recognized complete answer", () => {
    const result = prepareInterviewAnswer("## 来源与适用边界\n原创。\n## 完整参考答案（AI原创未确认草稿）\nA full spoken answer.\n## 简洁口述版\nShort recap.\n## 模拟追问与原创参考应答\nTeach the extension.");
    expect(result.answer.trim()).toBe("A full spoken answer.");
    expect(result.explanation).toContain("Short recap.");
    expect(result.explanation).toContain("Teach the extension.");
    expect(result.references).toContain("原创。");
  });

  it("does not promote a reasoning walkthrough or brief recap into a complete answer", () => {
    const raw = "## 完整推理与参考解析\nWorked reasoning.\n## 简洁复述版\nShort recap.";
    expect(prepareInterviewAnswer(raw)).toMatchObject({ answer: "", explanation: raw, separation: "needs-answer" });
  });

  it("does not split on example headings within a fence or mistake nested headings for boundaries", () => {
    const result = prepareInterviewAnswer("## 标准答案\nAnswer.\n```md\n## 思路拆解讲解\nLiteral example.\n```\n### 思路拆解讲解\nPart of the answer.\n## 思路拆解讲解\nReal teaching.");
    expect(result.answer).toContain("Literal example.");
    expect(result.answer).toContain("Part of the answer.");
    expect(result.answer).not.toContain("Real teaching.");
    expect(result.explanation).toContain("Real teaching.");
  });

  it("retains prose and every uncertain original without claiming a semantic rewrite", () => {
    expect(prepareInterviewAnswer("A plain authored answer.")).toMatchObject({ answer: "A plain authored answer.", explanation: "", separation: "unsectioned" });
    expect(prepareInterviewAnswer('{"answer":"unknown contract"}')).toMatchObject({ answer: "", separation: "structured-original" });
    const raw = "## 标准答案\n[Linked][source]\n## 思路拆解讲解\n[source]: https://example.com";
    expect(prepareInterviewAnswer(raw)).toMatchObject({ original: raw, answer: "", explanation: raw, separation: "needs-answer" });
  });
});

it("preserves both languages of observed bilingual answers and keeps verification notes separate", () => {
  const result = prepareInterviewAnswer("## 中文口述参考（约120秒）\n中文完整回答。\n## English spoken answer\nComplete English answer.\n## 核实边界与依据（不属于口述内容）\nDo not invent facts.");
  expect(result.answer).toContain("### 中文口述参考（约120秒）");
  expect(result.answer).toContain("### English spoken answer");
  expect(result.answer).toContain("Complete English answer.");
  expect(result.answer).not.toContain("Do not invent facts.");
  expect(result.references).toContain("Do not invent facts.");
});

it.each([
  "\n\n## 标准答案\nFull answer.\n\n---\n\n## 思路拆解讲解\nTeaching only.",
  "Preamble.\n## 标准答案\n[Answer][source]\n## 思路拆解讲解\nTeaching only.\n[source]: https://example.com",
  "Preamble.\n## 标准答案\nFull answer.\n<div>Block</div>\n## 思路拆解讲解\nTeaching only.",
])("never mislabels an intact complex document after a preamble as an unsectioned answer", (raw) => {
  expect(prepareInterviewAnswer(raw)).toMatchObject({ answer: "", explanation: raw, separation: "needs-answer", original: raw });
});

it("does not treat literal fenced headings as a semantic boundary in preserved Markdown", () => {
  const raw = "My answer includes this literal sample.\n```md\n## 思路拆解讲解\n```\n\n---\nEnd of my answer.";
  expect(prepareInterviewAnswer(raw)).toMatchObject({ answer: raw, explanation: "", separation: "unsectioned" });
});

it("keeps a plain authored answer visible when only provenance uses section headings", () => {
  const raw = "A complete plain authored answer.\n\n## 参考资料\nhttps://example.com";
  const result = prepareInterviewAnswer(raw);
  expect(result.separation).toBe("unsectioned");
  expect(result.answer.trim()).toBe("A complete plain authored answer.");
  expect(result.explanation).toBe("");
  expect(result.references).toContain("https://example.com");
});

describe("version-owned explanation detection", () => {
  it("recognizes only a nonempty explicit explanation alongside a full answer", () => {
    const body = "## 标准答案\nSynthetic answer.\n## 思路拆解讲解\nSynthetic lesson.\n## 来源与适用边界\nUnverified.";
    expect(prepareInterviewAnswer(body).hasExplicitExplanation).toBe(true);
    expect(prepareInterviewAnswer(body.replace("Synthetic lesson.", "")).hasExplicitExplanation).toBe(false);
    expect(prepareInterviewAnswer(body.replace("## 标准答案", "## 摘要")).hasExplicitExplanation).toBe(false);
    expect(prepareInterviewAnswer(body.replace("## 思路拆解讲解", "## 其他补充")).hasExplicitExplanation).toBe(false);
  });

  it.each([
    "## 标准答案\nSynthetic answer.\n```md\n## 思路拆解讲解\nNot a real section.\n```",
    ' {"body":"## 思路拆解讲解"}',
    "## 标准答案\nSynthetic answer.\n### 思路拆解讲解\nNested answer text.",
  ])("does not hide preparation notes for unrecognized boundaries", (body) => {
    expect(prepareInterviewAnswer(body).hasExplicitExplanation).toBe(false);
  });
});

describe("observed reference heading aliases", () => {
  const aliases = ["参考资料与证据边界", "参考来源", "来源与使用边界", "参考资料与来源边界", "参考资料与使用边界"];
  it.each(aliases)("folds the exact %s source section while preserving answer, lesson, and original", (heading) => {
    const raw = `## 标准答案\r\nSynthetic answer.\r\n## 思路拆解讲解\r\nSynthetic lesson.\r\n## ${heading}\r\nSynthetic citation and uncertainty boundary.\r\n`;
    const result = prepareInterviewAnswer(raw);
    expect(result.answer).toContain("Synthetic answer.");
    expect(result.explanation).toContain("Synthetic lesson.");
    expect(result.explanation).not.toContain("Synthetic citation");
    expect(result.references).toBe(`## ${heading}\r\nSynthetic citation and uncertainty boundary.\r\n`);
    expect(result.original).toBe(raw);
    expect(result.segments.map(segment => segment.markdown).join("")).toBe(raw);
  });
  it.each(aliases)("does not broadly infer boundaries from nested, fenced, or unknown variants of %s", (heading) => {
    const raw = `## 标准答案\nSynthetic answer.\n## 思路拆解讲解\nSynthetic lesson.\n### ${heading}\nNested caveat.\n\n\`\`\`md\n## ${heading}\nLiteral example.\n\`\`\`\n\n## ${heading}（其他补充）\nUnknown-heading caveat.`;
    const result = prepareInterviewAnswer(raw);
    expect(result.references).toBe("");
    for (const text of ["Nested caveat.", "Literal example.", "Unknown-heading caveat."]) expect(result.explanation).toContain(text);
    expect(result.original).toBe(raw);
    expect(result.segments.map(segment => segment.markdown).join("")).toBe(raw);
  });
});
