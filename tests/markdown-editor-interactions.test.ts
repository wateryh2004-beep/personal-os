import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdownHeadingLineStyles } from "@/features/notes/editor/markdown-theme";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addMarkdownUploadPlaceholder,
  findMarkdownUploadRange,
  markdownUploadPlaceholder,
  removeMarkdownUploadPlaceholder,
} from "@/features/notes/editor/markdown-upload-placeholder";
import { parseMarkdownImage } from "@/features/notes/editor/markdown-image-preview";

describe("Markdown 编辑器交互布局", () => {
  it("将完整列表前缀替换为视觉标记，不保留 -、编号或任务列表的源空格", () => {
    const theme = readFileSync(
      resolve(process.cwd(), "src/features/notes/editor/markdown-theme.ts"),
      "utf8",
    );
    expect(theme).toContain("parseMarkdownListLine");
    expect(theme).toContain("const prefixEnd");
    expect(theme).toContain("builder.add(node.from, prefixEnd, Decoration.replace(");
    expect(theme).toContain("node.to, node.to + 1");
  });

  it("标题行不使用会吞掉相邻空行点击区域的垂直 margin 或 padding", () => {
    for (const style of Object.values(markdownHeadingLineStyles)) {
      expect(Object.keys(style)).not.toContain("marginTop");
      expect(Object.keys(style)).not.toContain("marginBottom");
      expect(Object.keys(style)).not.toContain("paddingTop");
      expect(Object.keys(style)).not.toContain("paddingBottom");
    }
  });

  it("异步图片上传期间继续输入，也能保留原插入位置", () => {
    let state = EditorState.create({
      doc: "第一行\n第二行",
      extensions: [markdownUploadPlaceholder],
    });
    const originalPosition = state.doc.line(2).from;
    state = state.update({
      effects: addMarkdownUploadPlaceholder.of({
        id: "upload-1",
        from: originalPosition,
        to: originalPosition,
      }),
    }).state;
    state = state.update({ changes: { from: 0, insert: "新增\n" } }).state;

    expect(findMarkdownUploadRange(state, "upload-1")).toEqual({
      from: originalPosition + 3,
      to: originalPosition + 3,
    });

    state = state.update({
      effects: removeMarkdownUploadPlaceholder.of("upload-1"),
    }).state;
    expect(findMarkdownUploadRange(state, "upload-1")).toBeNull();
  });

  it("空笔记也能记录图片插入位置", () => {
    let state = EditorState.create({
      doc: "",
      extensions: [markdownUploadPlaceholder],
    });
    state = state.update({
      effects: addMarkdownUploadPlaceholder.of({
        id: "upload-empty",
        from: 0,
        to: 0,
      }),
    }).state;

    expect(findMarkdownUploadRange(state, "upload-empty")).toEqual({ from: 0, to: 0 });
  });

  it("把私有下载地址识别为可内联预览的 Markdown 图片", () => {
    expect(
      parseMarkdownImage(
        "![截图](/api/files/0590c8dd-5b8e-4c7c-aab1-7c24f24c0654/download?inline=1)",
      ),
    ).toEqual({
      alt: "截图",
      src: "/api/files/0590c8dd-5b8e-4c7c-aab1-7c24f24c0654/download?inline=1",
    });
    expect(parseMarkdownImage("![危险](javascript:alert(1))")).toBeNull();
  });
});
