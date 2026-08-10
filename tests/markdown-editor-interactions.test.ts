import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdownHeadingLineStyles } from "@/features/notes/editor/markdown-theme";
import {
  addMarkdownUploadPlaceholder,
  findMarkdownUploadRange,
  markdownUploadPlaceholder,
  removeMarkdownUploadPlaceholder,
} from "@/features/notes/editor/markdown-upload-placeholder";

describe("Markdown 编辑器交互布局", () => {
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
});
