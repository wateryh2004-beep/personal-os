import { describe, expect, it } from "vitest";
import { history, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, type StateCommand } from "@codemirror/state";
import { GFM } from "@lezer/markdown";
import {
  continueMarkdownList,
  createMarkdownLink,
  deleteMarkdownListMarkupBackward,
  deleteSelectedListItems,
  indentMarkdownList,
  outdentMarkdownList,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleHeading,
  toggleItalic,
  toggleOrderedList,
  toggleTaskList,
} from "@/features/notes/editor/markdown-commands";

function stateWithCursor(source: string) {
  const cursor = source.indexOf("|");
  if (cursor < 0) throw new Error("测试文本需要一个 | 光标标记");
  return EditorState.create({
    doc: source.slice(0, cursor) + source.slice(cursor + 1),
    selection: EditorSelection.cursor(cursor),
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM], addKeymap: false }),
      history(),
    ],
  });
}

function runCommand(source: string, command: StateCommand) {
  let state = stateWithCursor(source);
  const handled = command({
    state,
    dispatch(transaction) {
      state = transaction.state;
    },
  });
  const cursor = state.selection.main.head;
  return {
    handled,
    state,
    text: `${state.doc.sliceString(0, cursor)}|${state.doc.sliceString(cursor)}`,
  };
}

function runSelection(
  source: string,
  from: number,
  to: number,
  command: StateCommand,
) {
  let state = EditorState.create({
    doc: source,
    selection: EditorSelection.range(from, to),
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM], addKeymap: false }),
      history(),
    ],
  });
  const handled = command({
    state,
    dispatch(transaction) {
      state = transaction.state;
    },
  });
  return { handled, state, text: state.doc.toString() };
}

describe("Markdown 有序列表事务", () => {
  it("分割线 Enter 后保留正确的 thematic break 并开始新段落", () => {
    expect(runCommand("---|", continueMarkdownList).text).toBe("---\n\n|");
    expect(runCommand("***|", continueMarkdownList).text).toBe("***\n\n|");
  });
  it("Enter 继续当前编号，并支持两位数", () => {
    expect(runCommand("1. 第一项|", continueMarkdownList).text).toBe(
      "1. 第一项\n2. |",
    );
    expect(runCommand("9. 第九项|", continueMarkdownList).text).toBe(
      "9. 第九项\n10. |",
    );
  });

  it("连续 Enter 继续递增", () => {
    const first = runCommand("1. A|", continueMarkdownList);
    expect(runCommand(first.text.replace("|", "B|"), continueMarkdownList).text).toBe(
      "1. A\n2. B\n3. |",
    );
  });

  it("在中间插入时重排后续同级编号", () => {
    expect(
      runCommand("1. A|\n2. B\n3. C", continueMarkdownList).text,
    ).toBe("1. A\n2. |\n3. B\n4. C");
  });

  it("删除选中的中间项时重排后续编号", () => {
    const source = "1. A\n2. B\n3. C";
    const from = source.indexOf("2. B");
    const to = source.indexOf("3. C");
    expect(runSelection(source, from, to, deleteSelectedListItems).text).toBe(
      "1. A\n2. C",
    );
  });

  it("空顶层项 Enter 退出列表", () => {
    expect(runCommand("1. A\n2. |", continueMarkdownList).text).toBe(
      "1. A\n|",
    );
  });

  it("嵌套列表独立递增", () => {
    expect(
      runCommand("1. A\n   1. 子项|\n2. C", continueMarkdownList).text,
    ).toBe("1. A\n   1. 子项\n   2. |\n2. C");
  });

  it("空嵌套项 Enter 提升为父级下一项并重排", () => {
    expect(
      runCommand(
        "1. A\n   1. 子项\n   2. |\n2. C",
        continueMarkdownList,
      ).text,
    ).toBe("1. A\n   1. 子项\n2. |\n3. C");
  });

  it("Tab 与 Shift-Tab 移动子树并维护两个层级编号", () => {
    const indented = runCommand(
      "1. A\n2. B|\n3. C",
      indentMarkdownList,
    );
    expect(indented.text).toBe("1. A\n   1. B|\n2. C");
    expect(runCommand(indented.text, outdentMarkdownList).text).toBe(
      "1. A\n2. B|\n3. C",
    );
  });

  it("多行选择可以整体缩进并恢复", () => {
    const source = "1. A\n2. B\n3. C";
    const from = source.indexOf("2. B");
    const indented = runSelection(source, from, source.length, indentMarkdownList);
    expect(indented.text).toBe("1. A\n   1. B\n   2. C");
    const restored = runSelection(
      indented.text,
      indented.text.indexOf("1. B"),
      indented.text.length,
      outdentMarkdownList,
    );
    expect(restored.text).toBe("1. A\n2. B\n3. C");
  });

  it("Backspace 在内容起点一次移除完整标记", () => {
    expect(
      runCommand("1. |", deleteMarkdownListMarkupBackward).text,
    ).toBe("|");
    expect(
      runCommand("1. |正文", deleteMarkdownListMarkupBackward).text,
    ).toBe("|正文");
  });

  it("一条结构操作可以一次撤销", () => {
    const changed = runCommand("1. A|\n2. B\n3. C", continueMarkdownList);
    let state = changed.state;
    expect(
      undo({ state, dispatch: (transaction) => { state = transaction.state; } }),
    ).toBe(true);
    expect(state.doc.toString()).toBe("1. A\n2. B\n3. C");
  });
});

describe("Markdown 其他列表", () => {
  it.each(["-", "*", "+"])("保留 %s 无序标记", (marker) => {
    expect(
      runCommand(`${marker} 项目|`, continueMarkdownList).text,
    ).toBe(`${marker} 项目\n${marker} |`);
  });

  it("任务列表的新项始终未勾选", () => {
    expect(
      runCommand("- [x] 完成|", continueMarkdownList).text,
    ).toBe("- [x] 完成\n- [ ] |");
    expect(
      runCommand("- [ ] 待办|", continueMarkdownList).text,
    ).toBe("- [ ] 待办\n- [ ] |");
  });

  it("多行选择可转换列表类型并可再次取消", () => {
    const source = "苹果\n香蕉";
    const ordered = runSelection(source, 0, source.length, toggleOrderedList);
    expect(ordered.text).toBe("1. 苹果\n2. 香蕉");
    const bullet = runSelection(
      ordered.text,
      0,
      ordered.text.length,
      toggleBulletList,
    );
    expect(bullet.text).toBe("- 苹果\n- 香蕉");
    const plain = runSelection(
      bullet.text,
      0,
      bullet.text.length,
      toggleBulletList,
    );
    expect(plain.text).toBe("苹果\n香蕉");
    expect(
      runSelection(source, 0, source.length, toggleTaskList).text,
    ).toBe("- [ ] 苹果\n- [ ] 香蕉");
  });

  it("有序列表可直接转为任务列表或普通文本", () => {
    const source = "1. 苹果\n2. 香蕉";
    expect(runSelection(source, 0, source.length, toggleTaskList).text).toBe(
      "- [ ] 苹果\n- [ ] 香蕉",
    );
    expect(runSelection(source, 0, source.length, toggleOrderedList).text).toBe(
      "苹果\n香蕉",
    );
  });
});

describe("工具栏与快捷键共用的 Markdown 命令", () => {
  it("选区粗体、斜体与链接均保持选区语义", () => {
    expect(runSelection("文字", 0, 2, toggleBold).text).toBe("**文字**");
    expect(runSelection("文字", 0, 2, toggleItalic).text).toBe("*文字*");
    expect(runSelection("文字", 0, 2, createMarkdownLink).text).toBe("[文字]()");
  });

  it("空选区插入成对语法并把光标放在中间", () => {
    expect(runCommand("正文|", toggleBold).text).toBe("正文**|**");
    expect(runCommand("正文|", toggleItalic).text).toBe("正文*|*");
    expect(runCommand("正文|", createMarkdownLink).text).toBe("正文[](|)");
  });

  it("标题和引用支持多行选择", () => {
    const source = "第一行\n第二行";
    expect(runSelection(source, 0, source.length, toggleHeading(2)).text).toBe(
      "## 第一行\n## 第二行",
    );
    expect(runSelection(source, 0, source.length, toggleBlockquote).text).toBe(
      "> 第一行\n> 第二行",
    );
  });

  it("代码块包裹完整选区", () => {
    expect(runSelection("const a = 1;", 0, 12, toggleCodeBlock).text).toBe(
      "```\nconst a = 1;\n```",
    );
  });

  it("代码块可以恢复为正文，而不是重复嵌套围栏", () => {
    expect(runCommand("```ts\nconst a = 1;|\n```", toggleCodeBlock).text).toBe(
      "const a = 1;|",
    );
  });
});
