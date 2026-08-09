import type { ChangeSpec, Text } from "@codemirror/state";

export const markdownListIndent = "   ";

export type MarkdownListKind = "ordered" | "bullet" | "task";

export type MarkdownListLine = {
  indent: string;
  indentWidth: number;
  kind: MarkdownListKind;
  marker: string;
  number: number | null;
  delimiter: "." | ")" | null;
  bullet: "-" | "*" | "+" | null;
  checked: boolean | null;
  content: string;
  contentStart: number;
};

const listPattern = /^([ \t]*)(?:(\d+)([.)])|([-+*]))[ \t]+(?:\[([ xX])\][ \t]+)?(.*)$/;

export function parseMarkdownListLine(text: string): MarkdownListLine | null {
  const match = listPattern.exec(text);
  if (!match) return null;
  const indent = match[1];
  const ordered = Boolean(match[2]);
  const task = !ordered && match[5] !== undefined;
  const content = match[6] ?? "";
  return {
    indent,
    indentWidth: indent.replaceAll("\t", markdownListIndent).length,
    kind: ordered ? "ordered" : task ? "task" : "bullet",
    marker: ordered ? `${match[2]}${match[3]}` : match[4],
    number: ordered ? Number(match[2]) : null,
    delimiter: ordered ? (match[3] as "." | ")") : null,
    bullet: ordered ? null : (match[4] as "-" | "*" | "+"),
    checked: task ? match[5].toLocaleLowerCase() === "x" : null,
    content,
    contentStart: text.length - content.length,
  };
}

export function listPrefix(
  context: MarkdownListLine,
  options: { indent?: string; number?: number; uncheckedTask?: boolean } = {},
) {
  const indent = options.indent ?? context.indent;
  if (context.kind === "ordered")
    return `${indent}${options.number ?? context.number ?? 1}${context.delimiter ?? "."} `;
  const bullet = context.bullet ?? "-";
  if (context.kind === "task")
    return `${indent}${bullet} [${options.uncheckedTask === false && context.checked ? "x" : " "}] `;
  return `${indent}${bullet} `;
}

export function lineNumberAt(doc: Text, position: number) {
  return doc.lineAt(Math.max(0, Math.min(position, doc.length))).number;
}

export function previousListSibling(
  doc: Text,
  lineNumber: number,
  context: MarkdownListLine,
) {
  for (let number = lineNumber - 1; number >= 1; number -= 1) {
    const line = doc.line(number);
    if (!line.text.trim()) return null;
    const parsed = parseMarkdownListLine(line.text);
    if (!parsed) return null;
    if (parsed.indentWidth < context.indentWidth) return null;
    if (parsed.indentWidth === context.indentWidth)
      return parsed.kind === context.kind ||
        (parsed.kind === "bullet" && context.kind === "task") ||
        (parsed.kind === "task" && context.kind === "bullet")
        ? { line, context: parsed }
        : null;
  }
  return null;
}

export function parentListItem(doc: Text, lineNumber: number, indentWidth: number) {
  for (let number = lineNumber - 1; number >= 1; number -= 1) {
    const line = doc.line(number);
    if (!line.text.trim()) continue;
    const parsed = parseMarkdownListLine(line.text);
    if (!parsed) continue;
    if (parsed.indentWidth < indentWidth) return { line, context: parsed };
  }
  return null;
}

function orderedGroupStart(doc: Text, lineNumber: number) {
  const initialLine = doc.line(lineNumber);
  const initial = parseMarkdownListLine(initialLine.text);
  if (!initial || initial.kind !== "ordered") return null;
  let currentLine = initialLine;
  let current = initial;
  while (true) {
    const previous = previousListSibling(doc, currentLine.number, current);
    if (!previous || previous.context.kind !== "ordered") break;
    currentLine = previous.line;
    current = previous.context;
  }
  return { line: currentLine, context: current };
}

export function renumberOrderedListAt(
  doc: Text,
  lineNumber: number,
  startNumber?: number,
): ChangeSpec[] {
  const requestedLine = doc.line(lineNumber);
  const requested = parseMarkdownListLine(requestedLine.text);
  const start =
    startNumber === undefined
      ? orderedGroupStart(doc, lineNumber)
      : requested?.kind === "ordered"
        ? { line: requestedLine, context: requested }
        : null;
  if (!start) return [];
  const changes: ChangeSpec[] = [];
  let expected = startNumber ?? start.context.number ?? 1;
  const indentWidth = start.context.indentWidth;
  for (let number = start.line.number; number <= doc.lines; number += 1) {
    const line = doc.line(number);
    if (!line.text.trim()) break;
    const parsed = parseMarkdownListLine(line.text);
    if (!parsed) break;
    if (parsed.indentWidth < indentWidth) break;
    if (parsed.indentWidth > indentWidth) continue;
    if (parsed.kind !== "ordered") break;
    const currentDigits = String(parsed.number ?? 1);
    const replacement = String(expected);
    if (currentDigits !== replacement) {
      changes.push({
        from: line.from + parsed.indent.length,
        to: line.from + parsed.indent.length + currentDigits.length,
        insert: replacement,
      });
    }
    expected += 1;
  }
  return changes;
}

export function renumberNearLines(doc: Text, lineNumbers: number[]) {
  const changes = new Map<string, ChangeSpec>();
  for (const number of lineNumbers) {
    for (const nearby of [number - 1, number, number + 1]) {
      if (nearby < 1 || nearby > doc.lines) continue;
      for (const change of renumberOrderedListAt(doc, nearby)) {
        const value = change as { from: number; to?: number; insert?: string };
        changes.set(`${value.from}:${value.to ?? value.from}`, change);
      }
    }
  }
  return [...changes.values()].sort(
    (left, right) =>
      (left as { from: number }).from - (right as { from: number }).from,
  );
}

export function listSubtreeEndLine(doc: Text, lineNumber: number) {
  const line = doc.line(lineNumber);
  const context = parseMarkdownListLine(line.text);
  if (!context) return lineNumber;
  let end = lineNumber;
  for (let number = lineNumber + 1; number <= doc.lines; number += 1) {
    const next = doc.line(number);
    if (!next.text.trim()) break;
    const parsed = parseMarkdownListLine(next.text);
    if (!parsed || parsed.indentWidth <= context.indentWidth) break;
    end = number;
  }
  return end;
}

export function selectedLineNumbers(doc: Text, from: number, to: number) {
  const first = lineNumberAt(doc, from);
  const adjustedEnd = to > from && doc.lineAt(to).from === to ? to - 1 : to;
  const last = lineNumberAt(doc, Math.max(from, adjustedEnd));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
