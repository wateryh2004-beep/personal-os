/** Read-only presentation of the source sections observed in the interview library.
 * Never infer facts from labels, rewrite stored Markdown, or strip individual caveats.
 */
const referenceHeadings = new Set([
  "来源与目标岗位",
  "来源核验记录",
  "来源与适用边界",
  "参考资料",
  "使用边界",
  "训练说明与来源边界",
  "经典参考与改编界限",
  "原题出处与方法参考",
  "事实来源与使用边界",
  "核实边界与依据（不属于口述内容）",
]);

type StudySegment = { kind: "reading" | "reference"; markdown: string };
export type StudyContent = {
  original: string;
  canSeparate: boolean;
  hasSectionHeadings: boolean;
  format: "markdown" | "structured-original";
  reading: string;
  references: string;
  segments: StudySegment[];
};

function segmentStudyContent(original: string): StudyContent {
  const unchanged = (format: StudyContent["format"] = "markdown"): StudyContent => ({
    original, canSeparate: false, hasSectionHeadings: false, format, reading: format === "markdown" ? original : "", references: "",
    segments: [{ kind: "reading", markdown: original }],
  });
  // JSON is not a documented authoring schema here. Keep it available verbatim;
  // guessing what a key means could turn provenance into a claimed answer.
  try {
    const value: unknown = JSON.parse(original);
    if (value !== null && typeof value === "object") return unchanged("structured-original");
  } catch { /* Markdown and partial JSON remain readable without modification. */ }

  // Splitting these would require a complete document parser to retain global link
  // definitions, HTML blocks and setext-heading context. Prefer the full original.
  const requiresWholeDocument = /^ {0,3}(?:<|\[[^\]\n]+\]:|(?:=+|-+)\s*$)/m.test(original);

  const segments: StudySegment[] = [];
  let start = 0;
  let hasSectionHeadings = false;
  let kind: StudySegment["kind"] = "reading";
  let fence: { marker: string; length: number } | null = null;
  const lines = original.matchAll(/[^\n]*(?:\n|$)/g);
  for (const line of lines) {
    const text = line[0].replace(/\r?\n$/, "");
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fence) {
      if (delimiter && delimiter[1][0] === fence.marker && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = null;
      continue;
    }
    if (delimiter && !(delimiter[1][0] === "`" && delimiter[2].includes("`"))) {
      fence = { marker: delimiter[1][0], length: delimiter[1].length };
      continue;
    }
    // The observed schema uses unindented ATX level-two headings. List, quote,
    // indented-code and deeper headings never become section boundaries.
    const heading = /^(#{1,2})[\t ]+(.+?)[\t ]*$/.exec(text);
    if (!heading) continue;
    hasSectionHeadings = true;
    const offset = line.index!;
    if (offset > start) segments.push({ kind, markdown: original.slice(start, offset) });
    start = offset;
    kind = heading[1] === "##" && referenceHeadings.has(heading[2].replace(/[\t ]+#+$/, "")) ? "reference" : "reading";
  }
  if (start < original.length) segments.push({ kind, markdown: original.slice(start) });
  if (requiresWholeDocument) return { ...unchanged(), hasSectionHeadings };

  return {
    original, canSeparate: true, hasSectionHeadings, format: "markdown", segments,
    reading: segments.some((segment) => segment.kind === "reference") ? segments.filter((segment) => segment.kind === "reading").map((segment) => segment.markdown).join("\n\n") : original,
    references: segments.filter((segment) => segment.kind === "reference").map((segment) => segment.markdown).join("\n\n"),
  };
}

export function prepareStudyContent(original: string): StudyContent {
  return segmentStudyContent(original);
}

const answerHeadings = new Set([
  "标准答案", "完整参考答案", "完整参考答案（AI原创未确认草稿）", "可口述答案",
  "完整面试口述参考", "中文口述参考", "中文口述参考（约90秒）",
  "中文口述参考（约120秒）", "中文口述参考（约150秒）", "English spoken answer",
]);

export type InterviewAnswerContent = StudyContent & {
  answer: string;
  explanation: string;
  separation: "explicit" | "unsectioned" | "needs-answer" | "structured-original";
};

/** A presentation adapter, never a content rewrite or correctness check.
 * Only explicitly authored full-answer sections are promoted. A short recap or
 * a reasoning walkthrough is not a substitute for a full examiner-facing answer.
 * Unsectioned prose retains the existing spoken-answer field's meaning.
 */
export function prepareInterviewAnswer(original: string): InterviewAnswerContent {
  const content = segmentStudyContent(original);
  if (content.format === "structured-original") {
    return { ...content, answer: "", explanation: "", separation: "structured-original" };
  }
  const reading = content.segments.filter((segment) => segment.kind === "reading");
  const headingOf = (markdown: string) => /^##[\t ]+(.+?)[\t ]*(?:\r?\n|$)/.exec(markdown)?.[1].replace(/[\t ]+#+$/, "");
  const fullAnswers = content.canSeparate ? reading.filter((segment) => answerHeadings.has(headingOf(segment.markdown) ?? "")) : [];
  if (fullAnswers.length) {
    return {
      ...content,
      answer: fullAnswers.map((segment) => fullAnswers.length > 1 ? segment.markdown.replace(/^##/, "###") : segment.markdown.replace(/^##[^\n]*(?:\n|$)/, "")).join("\n\n"),
      explanation: reading.filter((segment) => !fullAnswers.includes(segment)).map((segment) => headingOf(segment.markdown) === "思路拆解讲解" ? segment.markdown.replace(/^##[^\n]*(?:\n|$)/, "") : segment.markdown).join("\n\n"),
      separation: "explicit",
    };
  }
  // A sectioned legacy lesson has no reliable full answer boundary. Preserve it
  // in the explanation instead of passing off teaching notes as a standard answer.
  const sectioned = content.canSeparate
    ? reading.some((segment) => /^#{1,2}[\t ]/.test(segment.markdown))
    : content.hasSectionHeadings;
  return {
    ...content,
    answer: sectioned ? "" : content.reading,
    explanation: sectioned ? content.reading : "",
    separation: sectioned ? "needs-answer" : "unsectioned",
  };
}
