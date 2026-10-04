/** Read-only presentation of the source sections observed in the interview library.
 * Never infer facts from labels, rewrite stored Markdown, or strip individual caveats.
 */
const referenceHeadings = new Set([
  "来源与目标岗位",
  "来源核验记录",
  "来源与适用边界",
  "参考资料",
  "使用边界",
]);

type StudySegment = { kind: "reading" | "reference"; markdown: string };
export type StudyContent = {
  original: string;
  format: "markdown" | "structured-original";
  reading: string;
  references: string;
  segments: StudySegment[];
};

export function prepareStudyContent(original: string): StudyContent {
  const unchanged = (format: StudyContent["format"] = "markdown"): StudyContent => ({
    original, format, reading: format === "markdown" ? original : "", references: "",
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
  if (/^ {0,3}(?:<|\[[^\]\n]+\]:|(?:=+|-+)\s*$)/m.test(original)) return unchanged();

  const segments: StudySegment[] = [];
  let start = 0;
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
    const offset = line.index!;
    if (offset > start) segments.push({ kind, markdown: original.slice(start, offset) });
    start = offset;
    kind = heading[1] === "##" && referenceHeadings.has(heading[2].replace(/[\t ]+#+$/, "")) ? "reference" : "reading";
  }
  if (start < original.length) segments.push({ kind, markdown: original.slice(start) });
  if (!segments.some((segment) => segment.kind === "reference")) return unchanged();
  return {
    original, format: "markdown", segments,
    reading: segments.filter((segment) => segment.kind === "reading").map((segment) => segment.markdown).join("\n\n"),
    references: segments.filter((segment) => segment.kind === "reference").map((segment) => segment.markdown).join("\n\n"),
  };
}
