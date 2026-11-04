import { describe, expect, it } from "vitest";
import {
  addMarkdownTableColumn,
  addMarkdownTableRow,
  editMarkdownTableCell,
  parseMarkdownTables,
  pastedTsvToMarkdown,
  serializeMarkdownTable,
} from "@/features/notes/editor/markdown-table";

describe("Notes Markdown live table parsing", () => {
  it("recognizes valid GFM tables without altering their original Markdown", () => {
    const source = "之前的正文\n\n| 地区 | 收入 |\n| :--- | ---: |\n| 北京 | 25 |\n| 上海 | 30 |\n\n之后";
    const [table] = parseMarkdownTables(source);
    expect(table).toBeDefined();
    expect(table.header).toEqual(["地区", "收入"]);
    expect(table.rows).toEqual([["北京", "25"], ["上海", "30"]]);
    expect(table.alignment).toEqual(["left", "right"]);
    expect(table.canonical).toBe(true);
    expect(source.slice(table.from, table.to)).toBe(table.source);
    expect(table.source).toContain("| :--- | ---: |");
  });

  it("tolerates missing delimiter and ragged rows, repairing only on an explicit edit", () => {
    const source = "| 姓名 | 成绩 |\n| 甲 |\n| 乙 | 98 | 附注 |";
    const [table] = parseMarkdownTables(source);
    expect(table.hasDelimiter).toBe(false);
    expect(table.canonical).toBe(false);
    expect(table.width).toBe(3);
    expect(table.header).toEqual(["姓名", "成绩", "列 3"]);
    expect(table.rows).toEqual([["甲", "", ""], ["乙", "98", "附注"]]);
    expect(source.slice(table.from, table.to)).toBe(source);
    const patch = editMarkdownTableCell(table, 0, 1, "85");
    const repaired = source.slice(0, patch.from) + patch.insert + source.slice(patch.to);
    expect(repaired).toContain("| --- | --- | --- |");
    expect(parseMarkdownTables(repaired)[0].canonical).toBe(true);
    expect(parseMarkdownTables(repaired)[0].rows[0]).toEqual(["甲", "85", ""]);
  });

  it("handles partially typed GFM separators instead of dropping a table", () => {
    const [table] = parseMarkdownTables("| A | B |\n| - | :-: |\n| a | b |");
    expect(table.hasDelimiter).toBe(true);
    expect(table.alignment).toEqual([null, "center"]);
    const normalized = serializeMarkdownTable(table);
    expect(normalized).toContain("| --- | :---: |");
  });

  it("ignores fenced and indented code, non-table prose and quoted pipe fragments", () => {
    const source = [
      "~~~md",
      "| not | a |",
      "| --- | --- |",
      "~~~",
      "    | indented | source |",
      "    | --- | --- |",
      "This is a | normal sentence",
      "and this has | another pipe",
      "> | quoted | text |",
      "> | --- | --- |",
      "",
      "| real | table |",
      "| --- | --- |",
      "| yes | 1 |",
    ].join("\n");
    const tables = parseMarkdownTables(source);
    expect(tables).toHaveLength(1);
    expect(tables[0].header).toEqual(["real", "table"]);
  });

  it("keeps escaped pipes and inline code pipe tokens inside a single cell", () => {
    const source = "| name | expression |\n| --- | --- |\n| item | a\\|b |\n| code | " +
      "\x60a|b\x60" + " |";
    const [table] = parseMarkdownTables(source);
    expect(table.width).toBe(2);
    expect(table.rows).toEqual([["item", "a|b"], ["code", "\x60a|b\x60"]]);
    const patch = editMarkdownTableCell(table, 0, 1, "a|c");
    const output = source.slice(0, patch.from) + patch.insert + source.slice(patch.to);
    expect(output).toContain("a\\|c");
    expect(output).toContain("\x60a|b\x60");
    expect(parseMarkdownTables(output)[0].rows[0][1]).toBe("a|c");
  });

  it("preserves existing valid table formatting by changing only one cell range", () => {
    const source = "Intro\n\nName | Score\n:--- | ---:\n A |  91 \n\nEnd";
    const [table] = parseMarkdownTables(source);
    expect(table.canonical).toBe(true);
    const patch = editMarkdownTableCell(table, 0, 1, "95");
    const result = source.slice(0, patch.from) + patch.insert + source.slice(patch.to);
    expect(result).toBe("Intro\n\nName | Score\n:--- | ---:\n A |  95 \n\nEnd");
  });

  it("supports row and column insertions while retaining GFM semantics", () => {
    const source = "| 1 | 2 |\n| --- | --- |\n| 3 | 4 |";
    const table = parseMarkdownTables(source)[0];
    const row = addMarkdownTableRow(table);
    const afterRow = parseMarkdownTables(row.insert)[0];
    expect(afterRow.rows).toEqual([["3", "4"], ["", ""]]);
    const col = addMarkdownTableColumn(afterRow);
    const afterCol = parseMarkdownTables(col.insert)[0];
    expect(afterCol.width).toBe(3);
    expect(afterCol.rows[0]).toEqual(["3", "4", ""]);
    expect(afterCol.canonical).toBe(true);
  });

  it("converts spreadsheet multi-line TSV with escaped pipes and ragged rows", () => {
    const result = pastedTsvToMarkdown("项目\t金额\nA\t10\nB|C\t20\t备注\n");
    expect(result).toContain("| 项目 | 金额 |  |");
    expect(result).toContain("B\\|C");
    expect(parseMarkdownTables(result!)[0].rows[1]).toEqual(["B|C", "20", "备注"]);
    expect(pastedTsvToMarkdown("普通\t文本")).toBeNull();
    expect(pastedTsvToMarkdown("| 是 | Markdown |")).toBeNull();
  });

  it("does not execute or inject HTML from source table cells", () => {
    const source = "| label | text |\n| --- | --- |\n| x | <img src=x onerror=alert(1)> |";
    const [table] = parseMarkdownTables(source);
    expect(table.rows[0][1]).toBe("<img src=x onerror=alert(1)>");
    // The view widget inserts this value only through input.value/textContent.
    const patch = editMarkdownTableCell(table, 0, 1, "<script>alert(1)</script>");
    expect(patch.insert).toContain("<script>alert(1)</script>");
  });
});
