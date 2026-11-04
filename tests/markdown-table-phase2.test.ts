import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  addMarkdownTableRow,
  alignMarkdownTableColumn,
  markdownTableAsTsv,
  parseMarkdownTables,
  parseSpreadsheetTsv,
  pasteSpreadsheetIntoTable,
  removeMarkdownTableColumn,
  removeMarkdownTableRow,
} from "@/features/notes/editor/markdown-table";
import { updateMarkdownTableCache } from "@/features/notes/editor/markdown-table-cache";

describe("Phase 2: robust, editable GFM pipe tables", () => {
  it("supports one-column GFM while leaving lone pipe lines as ordinary prose", () => {
    const [one] = parseMarkdownTables("| 标签 |\n| :--- |\n| 甲 |\n| 乙 |");
    expect(one.width).toBe(1);
    expect(one.rows).toEqual([["甲"], ["乙"]]);
    expect(one.canonical).toBe(true);
    expect(parseMarkdownTables("| 尚未写完 |")).toHaveLength(0);
    expect(parseMarkdownTables("| 列一 | 列二 |")).toHaveLength(0);
    expect(parseMarkdownTables("| 甲 |\n| 乙 |")).toHaveLength(0);
  });

  it("does not interpret fenced code, raw HTML blocks or isolated pipe prose as grids", () => {
    const source = [
      "<div>", "| fake | table |", "| --- | --- |", "</div>", "",
      "<!--", "| comment | table |", "| --- | --- |", "-->", "",
      "~~~md", "| code | table |", "| --- | --- |", "~~~", "",
      "This sentence has a | pipe", "| lone | partial |", "",
      "| real | table |", "| --- | --- |", "| yes | 1 |",
    ].join("\n");
    const parsed = parseMarkdownTables(source);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].header).toEqual(["real", "table"]);
  });

  it("deletes rows and columns and changes per-column alignment in portable Markdown", () => {
    const table = parseMarkdownTables("| A | B |\n| --- | --- |\n| a | b |\n| c | d |")[0];
    const aligned = parseMarkdownTables(alignMarkdownTableColumn(table, 1, "right")!.insert)[0];
    expect(aligned.alignment).toEqual([null, "right"]);
    expect(parseMarkdownTables(removeMarkdownTableRow(aligned, 0)!.insert)[0].rows).toEqual([["c", "d"]]);
    const remaining = parseMarkdownTables(removeMarkdownTableColumn(aligned, 0)!.insert)[0];
    expect(remaining.width).toBe(1);
    expect(remaining.header).toEqual(["B"]);
    expect(removeMarkdownTableColumn(remaining, 0)).toBeNull();
    expect(removeMarkdownTableRow(table, 99)).toBeNull();
  });

  it("pastes quoted multi-cell TSV including embedded tabs and line breaks as one change", () => {
    const quoted = '"Line\nbreak"\t"has\tTab"\r\n"a""b"\t15\n';
    expect(parseSpreadsheetTsv(quoted)).toEqual([["Line\nbreak", "has\tTab"], ['a"b', "15"]]);
    const table = parseMarkdownTables("| Name | Value |\n| --- | --- |\n| Alice | 5 |")[0];
    const patch = pasteSpreadsheetIntoTable(table, 0, 1, quoted)!;
    expect(patch.from).toBe(table.from);
    const next = parseMarkdownTables(patch.insert)[0];
    expect(next.width).toBe(3);
    expect(next.rows[0][1]).toBe("Line<br>break");
    expect(next.rows[0][2]).toBe("has\tTab");
    expect(next.rows[1][1]).toBe('a"b');
    expect(markdownTableAsTsv(next)).toContain('"has\tTab"');
    expect(pasteSpreadsheetIntoTable(next, 0, 0, "bad\t" + "a\t".repeat(25))).toBeNull();
    expect(parseSpreadsheetTsv('"unterminated\tvalue')).toBeNull();
    expect(addMarkdownTableRow(next).insert).toContain("| --- |");
  });

  it("reparses only a small region of a long document and remaps later table offsets", () => {
    const intro = "普通的学习笔记内容。\n\n".repeat(3000);
    const source = intro + "| 名称 | 值 |\n| --- | --- |\n| 测试 | 5 |\n";
    const initial = EditorState.create({ doc: source });
    const existing = parseMarkdownTables(source);
    expect(existing).toHaveLength(1);
    const transaction = initial.update({ changes: { from: 3, insert: "新" } });
    const next = updateMarkdownTableCache(existing, transaction.changes, transaction.state.doc);
    expect(next.fullRescan).toBe(false);
    expect(next.scannedCharacters).toBeLessThan(200);
    expect(next.tables).toHaveLength(1);
    expect(next.tables[0].from).toBe(existing[0].from + 1);
    expect(next.tables[0].headerCells[0]!.from).toBe(existing[0].headerCells[0]!.from + 1);
  });

  it("updates nearby tables after a cell change and falls back for fence boundaries", () => {
    const source = "Intro\n\n| A | B |\n| --- | --- |\n| x | y |\n\nEnd";
    const initial = EditorState.create({ doc: source });
    const tables = parseMarkdownTables(source);
    const from = source.indexOf("y |");
    const transaction = initial.update({ changes: { from, to: from + 1, insert: "edited" } });
    const incremental = updateMarkdownTableCache(tables, transaction.changes, transaction.state.doc);
    expect(incremental.fullRescan).toBe(false);
    expect(incremental.tables[0].rows).toEqual([["x", "edited"]]);
    const fence = transaction.state.update({ changes: { from: 0, insert: "~~~md\n" } });
    expect(updateMarkdownTableCache(incremental.tables, fence.changes, fence.state.doc).fullRescan).toBe(true);
  });
});
