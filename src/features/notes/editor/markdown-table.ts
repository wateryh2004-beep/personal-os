/**
 * Tolerant Markdown pipe-table scanning for the live editor.
 *
 * Parsing is presentation-only: the original text remains byte-for-byte intact
 * until the user edits a cell or explicitly inserts a row/column. We do not
 * silently repair an imported Markdown note just because it was opened.
 */
export type TableAlignment = "left" | "center" | "right" | null;
export type TableCellRange = { from: number; to: number; value: string };
export type MarkdownTable = {
  from: number;
  to: number;
  source: string;
  width: number;
  header: string[];
  rows: string[][];
  headerCells: Array<TableCellRange | null>;
  rowCells: Array<Array<TableCellRange | null>>;
  alignment: TableAlignment[];
  hasDelimiter: boolean;
  canonical: boolean;
};

const MAX_COLUMNS = 20;
const MAX_ROWS = 250;

function splitPipeLine(text: string, from: number, minCells = 2): TableCellRange[] | null {
  if (/^(?: {4,}|\t| {0,3}>)/.test(text) || !text.includes("|")) return null;
  const separators: number[] = [];
  let ticks = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\\" && i + 1 < text.length) { i += 1; continue; }
    if (char === "\x60") {
      let run = 1;
      while (text[i + run] === "\x60") run += 1;
      if (ticks === 0) ticks = run;
      else if (ticks === run) ticks = 0;
      i += run - 1;
      continue;
    }
    if (char === "|" && ticks === 0) separators.push(i);
  }
  if (!separators.length) return null;
  const edges = [-1, ...separators, text.length];
  const parts: TableCellRange[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const left = edges[index] + 1;
    const right = edges[index + 1];
    const raw = text.slice(left, right);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    const start = left + leading;
    const end = Math.max(start, right - trailing);
    parts.push({
      from: from + start,
      to: from + end,
      value: raw.trim().replace(/\\\|/g, "|"),
    });
  }
  // Border pipes are structural only when the outer fragments are whitespace.
  if (/^\s*\|/.test(text) && parts[0]?.value === "") parts.shift();
  if (/\|\s*$/.test(text) && parts.at(-1)?.value === "") parts.pop();
  return parts.length >= minCells && parts.length <= MAX_COLUMNS ? parts : null;
}

function isSeparator(cells: TableCellRange[]): boolean {
  return cells.length >= 2 && cells.every(cell => /^:?-+:?$/.test(cell.value));
}

function alignmentOf(value: string): TableAlignment {
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  if (value.startsWith(":")) return "left";
  return null;
}

function bordered(text: string): boolean {
  return /^\s*\|/.test(text) && /\|\s*$/.test(text);
}

type Line = { text: string; from: number; to: number; fenced: boolean };

/** An unterminated fence never turns code content into table widgets. */
function getLines(source: string): Line[] {
  let offset = 0;
  let fence: { char: string; length: number } | null = null;
  return source.split("\n").map(text => {
    const from = offset;
    offset += text.length + 1;
    const open = /^ {0,3}([\x60~])\1{2,}/.exec(text);
    const wasFenced = Boolean(fence);
    if (open) {
      const char = open[1];
      const run = /^ {0,3}[\x60~]+/.exec(text)?.[0].trim().length ?? 0;
      if (!fence) fence = { char, length: run };
      else if (fence.char === char && run >= fence.length &&
        text.slice(open[0].length).trim() === "") fence = null;
    }
    return { text, from, to: from + text.length, fenced: wasFenced || Boolean(open) };
  });
}

function pad<T>(values: T[], size: number, make: (index: number) => T): T[] {
  return Array.from({ length: size }, (_, i) => values[i] ?? make(i));
}

/**
 * Identifies GFM tables and common partially typed variants:
 * - missing/partial --- separator;
 * - omitted border pipes;
 * - ragged rows, padded only for display;
 * - Markdown escaped pipes and pipes inside inline code.
 *
 * Ordinary prose using a single pipe is not converted unless a real
 * alignment separator follows, or both edge pipes identify a table row.
 */
export function parseMarkdownTables(source: string): MarkdownTable[] {
  const lines = getLines(source);
  const result: MarkdownTable[] = [];
  for (let i = 0; i < lines.length;) {
    const first = lines[i];
    if (first.fenced) { i += 1; continue; }
    const header = splitPipeLine(first.text, first.from);
    const second = lines[i + 1];
    const secondCells = second && !second.fenced ? splitPipeLine(second.text, second.from) : null;
    const explicitDelimiter = Boolean(secondCells && isSeparator(secondCells));
    if (!header || (!bordered(first.text) && !explicitDelimiter)) {
      i += 1; continue;
    }
    let end = i;
    let cursor = i + 1;
    const data: TableCellRange[][] = [];
    const delimiter = explicitDelimiter ? secondCells! : null;
    if (delimiter) { end = cursor; cursor += 1; }
    while (cursor < lines.length && data.length < MAX_ROWS) {
      const line = lines[cursor];
      if (line.fenced || !line.text.trim()) break;
      const cells = splitPipeLine(line.text, line.from, 1);
      if (!cells || isSeparator(cells)) break;
      // Unbordered data cells are allowed after a genuine delimiter only.
      if (!delimiter && !bordered(line.text)) break;
      data.push(cells);
      end = cursor;
      cursor += 1;
    }
    // Do not split an oversized source table into several unrelated widgets.
    // Keep very large tables in ordinary editable Markdown instead.
    if (data.length === MAX_ROWS && cursor < lines.length && !lines[cursor].fenced &&
      splitPipeLine(lines[cursor].text, lines[cursor].from, 1)) {
      i = cursor + 1;
      while (i < lines.length && !lines[i].fenced &&
        splitPipeLine(lines[i].text, lines[i].from, 1)) i += 1;
      continue;
    }
    const width = Math.max(header.length, delimiter?.length ?? 0, ...data.map(row => row.length));
    const start = first.from;
    const stop = lines[end].to;
    const headerValues = pad(header.map(cell => cell.value), width, n => "列 " + (n + 1));
    const rows = data.map(row => pad(row.map(cell => cell.value), width, () => ""));
    result.push({
      from: start,
      to: stop,
      source: source.slice(start, stop),
      width,
      header: headerValues,
      rows,
      headerCells: pad<TableCellRange | null>(header, width, () => null),
      rowCells: data.map(row => pad<TableCellRange | null>(row, width, () => null)),
      alignment: pad(delimiter?.map(cell => alignmentOf(cell.value)) ?? [], width, () => null),
      hasDelimiter: Boolean(delimiter),
      canonical: Boolean(delimiter && delimiter.length === width && header.length === width &&
        data.every(row => row.length === width)),
    });
    i = end + 1;
  }
  return result;
}

function escapeCell(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/(?<!\\)\|/g, "\\|");
}

export function serializeMarkdownTable(table: Pick<MarkdownTable, "header" | "rows" | "alignment" | "width">): string {
  const row = (values: string[]) => "| " + pad(values, table.width, () => "")
    .map(value => escapeCell(value)).join(" | ") + " |";
  const separator = table.alignment.map(align => {
    if (align === "center") return ":---:";
    if (align === "left") return ":---";
    if (align === "right") return "---:";
    return "---";
  });
  return [row(table.header), row(separator), ...table.rows.map(row)].join("\n");
}

export type TableChange = { from: number; to: number; insert: string };

/** Keep exact source formatting for valid GFM; normalize only malformed tables on edit. */
export function editMarkdownTableCell(table: MarkdownTable, row: number, column: number, text: string): TableChange {
  if (column < 0 || column >= table.width || row < -1 || row >= table.rows.length) {
    throw new RangeError("Invalid table cell");
  }
  const value = text.replace(/[\r\n]+/g, " ");
  const range = row < 0 ? table.headerCells[column] : table.rowCells[row][column];
  if (table.canonical && range) {
    return { from: range.from, to: range.to, insert: escapeCell(value) };
  }
  const header = [...table.header];
  const rows = table.rows.map(cells => [...cells]);
  if (row < 0) header[column] = value;
  else rows[row][column] = value;
  return {
    from: table.from,
    to: table.to,
    insert: serializeMarkdownTable({ header, rows, alignment: table.alignment, width: table.width }),
  };
}

export function addMarkdownTableRow(table: MarkdownTable): TableChange {
  return {
    from: table.from, to: table.to,
    insert: serializeMarkdownTable({
      header: table.header,
      rows: [...table.rows, Array.from({ length: table.width }, () => "")],
      alignment: table.alignment, width: table.width,
    }),
  };
}

export function addMarkdownTableColumn(table: MarkdownTable): TableChange {
  const width = table.width + 1;
  if (width > MAX_COLUMNS) throw new RangeError("Too many table columns");
  return {
    from: table.from, to: table.to,
    insert: serializeMarkdownTable({
      header: [...table.header, "列 " + width],
      rows: table.rows.map(row => [...row, ""]),
      alignment: [...table.alignment, null], width,
    }),
  };
}

/** Spreadsheet clipboard: leave prose alone; only convert multi-row TSV. */
export function pastedTsvToMarkdown(text: string): string | null {
  if (!text.includes("\t") || !/\r|\n/.test(text)) return null;
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const values = lines.map(line => line.split("\t"));
  const width = Math.max(...values.map(row => row.length));
  if (values.length < 2 || width < 2 || width > MAX_COLUMNS || values.length > MAX_ROWS) return null;
  return serializeMarkdownTable({
    header: pad(values[0], width, () => ""),
    rows: values.slice(1).map(row => pad(row, width, () => "")),
    alignment: Array.from({ length: width }, () => null),
    width,
  });
}
