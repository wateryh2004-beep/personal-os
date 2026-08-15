import { describe, expect, it } from "vitest";
import { protectNoteStructures } from "@/features/notes/ai-protect";

const uuid = "550e8400-e29b-41d4-a716-446655440000";

describe("protectNoteStructures", () => {
  // 统一断言往返精确性：保护→还原必须与原文逐字符一致。
  const roundtrip = (markdown: string) => {
    const protectedNote = protectNoteStructures(markdown);
    expect(protectedNote.restore(protectedNote.protected)).toBe(markdown);
    return protectedNote;
  };

  it("保护并还原规范化内部链接", () => {
    const protectedNote = roundtrip(`看这个[华夏](/notes/${uuid})文档`);
    expect(protectedNote.count).toBe(1);
    expect(protectedNote.protected).not.toContain("/notes/");
    expect(protectedNote.protected).toContain("⟦");
  });

  it("保护并还原双链（含别名）", () => {
    roundtrip("见 [[华夏]] 和 [[Beta|显示名称]]");
  });

  it("保护并还原图片与围栏代码块", () => {
    roundtrip("![图](/notes/x.png)\n```\nconst a = 1;\n```");
  });

  it("代码块内的伪链接不当链接保护（整块一个 token）", () => {
    const protectedNote = roundtrip("```\n[[伪链接]]\n[x](/notes/" + uuid + ")\n```");
    expect(protectedNote.count).toBe(1);
    expect(protectedNote.protected).not.toContain("[[伪链接]]");
  });

  it("行内代码内的伪链接不当链接保护", () => {
    roundtrip("行内代码 `[[x]]` 与 `[y](/notes/" + uuid + ")`");
  });

  it("占位符不与原文已有 ⟦k⟧ 碰撞", () => {
    const original = "⟦0⟧ 真实链接 [a](/notes/" + uuid + ")";
    const protectedNote = protectNoteStructures(original);
    expect(protectedNote.protected).toContain("⟦1⟧");
    expect(protectedNote.restore(protectedNote.protected)).toBe(original);
  });

  it("模型重排占位符后按 key 还原", () => {
    const protectedNote = protectNoteStructures(`A [甲](/notes/${uuid}) B [[乙]] C`);
    expect(protectedNote.restore("X⟦1⟧Y⟦0⟧Z")).toBe(`X[[乙]]Y[甲](/notes/${uuid})Z`);
  });

  it("往返幂等：二次保护不再命中", () => {
    const once = protectNoteStructures("见 [[华夏]]");
    expect(protectNoteStructures(once.protected).count).toBe(0);
  });

  it("重叠结构保留外层（图片套链接）", () => {
    const original = `![a [b](/notes/${uuid})](pic.png)`;
    const protectedNote = protectNoteStructures(original);
    expect(protectedNote.count).toBe(1);
    expect(protectedNote.restore(protectedNote.protected)).toBe(original);
  });
});
