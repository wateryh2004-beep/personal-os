import type { ChangeDesc, Text } from "@codemirror/state";
import { parseMarkdownTables, type MarkdownTable } from "./markdown-table";

/** Incremental Markdown table ranges for CodeMirror. Ordinary keystrokes
 * scan only nearby pipe lines; structural edits fall back to a full scan. */
export type TableScanResult = { tables: MarkdownTable[]; scannedCharacters: number; fullRescan: boolean };
type Span = { from: number; to: number };
const MAX_LOCAL_LINES = 280;
const MAX_LOCAL_WINDOWS = 8;

function shiftTable(table: MarkdownTable, delta: number): MarkdownTable {
  const shift = (cell: { from: number; to: number; value: string } | null) =>
    cell ? { ...cell, from: cell.from + delta, to: cell.to + delta } : null;
  return {
    ...table, from: table.from + delta, to: table.to + delta,
    headerCells: table.headerCells.map(shift),
    rowCells: table.rowCells.map(row => row.map(shift)),
  };
}

function fullScan(doc: Text): TableScanResult {
  return { tables: parseMarkdownTables(doc.toString()), scannedCharacters: doc.length, fullRescan: true };
}

function structural(text: string) {
  return /^ {0,3}(?:[\x60~]{3,}|<!--|-->|<\/?(?:pre|table|script|style|textarea|div|section|article|details|summary)\b)/i.test(text);
}

/** A neighbor on either side catches newly typed/removed table delimiters. */
function windowAround(doc: Text, from: number, to: number): Span | null {
  const first = doc.lineAt(Math.max(0, Math.min(doc.length, from))).number;
  const last = doc.lineAt(Math.max(0, Math.min(doc.length, to))).number;
  let start = Math.max(1, first - 1);
  let stop = Math.min(doc.lines, last + 1);
  if (stop - start > MAX_LOCAL_LINES) return null;
  while (start > 1 && doc.line(start - 1).text.includes("|")) {
    start--;
    if (stop - start > MAX_LOCAL_LINES) return null;
  }
  while (stop < doc.lines && doc.line(stop + 1).text.includes("|")) {
    stop++;
    if (stop - start > MAX_LOCAL_LINES) return null;
  }
  return { from: doc.line(start).from, to: doc.line(stop).to };
}

export function updateMarkdownTableCache(previous: MarkdownTable[], changes: ChangeDesc, doc: Text): TableScanResult {
  if (changes.empty) return { tables: previous, scannedCharacters: 0, fullRescan: false };
  const candidates: Span[] = [];
  let forceFull = false;
  changes.iterChangedRanges((oldFrom, oldTo, newFrom, newTo) => {
    const startLine = doc.lineAt(Math.min(newFrom, doc.length)).text;
    const endLine = doc.lineAt(Math.min(newTo, doc.length)).text;
    if (structural(startLine) || structural(endLine)) forceFull = true;
    let start = newFrom, end = newTo;
    for (const table of previous) {
      if (oldFrom <= table.to && oldTo >= table.from) {
        start = Math.min(start, changes.mapPos(table.from, 1));
        end = Math.max(end, changes.mapPos(table.to, -1));
      }
    }
    const window = windowAround(doc, start, end);
    if (window) candidates.push(window);
    else forceFull = true;
  });
  if (forceFull || candidates.length > MAX_LOCAL_WINDOWS) return fullScan(doc);
  candidates.sort((a, b) => a.from - b.from);
  const windows: Span[] = [];
  for (const span of candidates) {
    const last = windows[windows.length - 1];
    if (last && span.from <= last.to + 1) last.to = Math.max(last.to, span.to);
    else windows.push({ ...span });
  }
  // A fence or raw HTML boundary changes the parsing context beyond the
  // local window and therefore must invalidate the full document index.
  if (windows.some(span => doc.sliceString(span.from, span.to)
    .split("\n").some(structural))) return fullScan(doc);

  const mapped = previous.map(table => {
    const from = changes.mapPos(table.from, 1);
    const to = changes.mapPos(table.to, -1);
    return to < from ? null : shiftTable(table, from - table.from);
  }).filter((table): table is MarkdownTable => Boolean(table));
  const retained = mapped.filter(table => !windows.some(span => table.from <= span.to && table.to >= span.from));
  let scannedCharacters = 0;
  const revised = windows.flatMap(span => {
    const source = doc.sliceString(span.from, span.to);
    scannedCharacters += source.length;
    return parseMarkdownTables(source).map(table => shiftTable(table, span.from));
  });
  return {
    tables: [...retained, ...revised].sort((a, b) => a.from - b.from),
    scannedCharacters,
    fullRescan: false,
  };
}
