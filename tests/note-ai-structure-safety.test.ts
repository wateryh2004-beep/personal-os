import { describe, expect, it } from "vitest";
import {
  collectProtectedNoteSpans,
  preservesProtectedNoteStructures,
  protectNoteStructures,
} from "@/features/notes/ai-protect";

describe("Notes AI 3.0 structure-preserving rewrite", () => {
  const original = [
    "# 长文",
    "这是 {{ink:info|重要信息}} 和 {{mark:important|高亮内容}}。",
    "",
    "> [!NOTE]",
    "> 保留这个色块与其中的 **加粗**。",
    "> - 还有列表",
    "",
    "| 参数 | 数值 |",
    "| --- | --- |",
    "| 租金 | 120 |",
    "",
    "~~~ts",
    "const value = \"[[not-a-link]]\";",
    "~~~",
  ].join("\n");

  it("protects callouts, color marks, GFM tables and fenced code as indivisible spans", () => {
    const kinds = collectProtectedNoteSpans(original).map(span => span.kind);
    expect(kinds).toEqual(["color", "color", "callout", "table", "codeblock"]);
    const protectedNote = protectNoteStructures(original);
    expect(protectedNote.count).toBe(5);
    expect(protectedNote.restoreChecked(protectedNote.protected)).toEqual({ ok: true, text: original });
  });
  it("rejects a model that deletes a table, duplicates a link or loses a callout", () => {
    const value = protectNoteStructures(original);
    const missing = value.protected.replace("⟦3⟧", "");
    const duplicate = value.protected + "\n⟦2⟧";
    expect(value.restoreChecked(missing)).toMatchObject({ ok: false, reason: "missing_structure" });
    expect(value.restoreChecked(duplicate)).toMatchObject({ ok: false, reason: "duplicated_structure" });
    expect(value.restoreChecked(value.protected + "⟦999⟧")).toMatchObject({ ok: false, reason: "unknown_placeholder" });
  });
  it("permits moving a preserved block but not silently changing its bytes", () => {
    const chunks = collectProtectedNoteSpans(original);
    const callout = chunks.find(s => s.kind === "callout")!;
    const moved = original.replace(callout.text, "").replace("~~~ts", callout.text + "~~~ts");
    expect(preservesProtectedNoteStructures(original, moved)).toBe(true);
    expect(preservesProtectedNoteStructures(original, moved.replace("保留这个", "删除这个"))).toBe(false);
  });
  it("does not invent protected structure in plain prose", () => {
    expect(collectProtectedNoteSpans("普通段落 123")).toEqual([]);
  });
});
