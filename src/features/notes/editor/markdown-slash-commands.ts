import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Completion } from "@codemirror/autocomplete";

export type SlashQuery = { from: number; to: number; query: string };

/** Slash commands only activate at the start of an ordinary Markdown line,
 * not in a code fence, a blockquote, a link, or the middle of prose. */
export function extractMarkdownSlashQuery(state: EditorState, pos: number): SlashQuery | null {
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos);
  const match = /^ {0,3}\/([\p{L}\p{N}_-]*)$/u.exec(before);
  if (!match || state.sliceDoc(pos, line.to).trim()) return null;
  let node = syntaxTree(state).resolveInner(Math.max(line.from, pos - 1), -1);
  while (node) {
    if (["FencedCode", "CodeBlock", "InlineCode", "HTMLBlock", "Blockquote", "ListItem", "Link", "Image"].includes(node.name)) return null;
    if (!node.parent) break;
    node = node.parent;
  }
  return { from: line.from + before.indexOf("/"), to: pos, query: match[1] };
}

type SlashAction = {
  label: string;
  keywords: string;
  detail: string;
  insert?: string;
  cursorOffset?: number;
  callback?: "image" | "ai";
};
const actions: readonly SlashAction[] = [
  { label: "标题 1", keywords: "h1 标题 一级", detail: "一级章节", insert: "# " },
  { label: "标题 2", keywords: "h2 标题 二级", detail: "二级章节", insert: "## " },
  { label: "标题 3", keywords: "h3 标题 三级", detail: "三级章节", insert: "### " },
  { label: "无序列表", keywords: "列表 bullet list", detail: "项目符号", insert: "- " },
  { label: "有序列表", keywords: "列表 number list", detail: "自动续号", insert: "1. " },
  { label: "待办列表", keywords: "任务 todo checklist", detail: "复选任务", insert: "- [ ] " },
  { label: "引用", keywords: "blockquote 引用", detail: "引用段落", insert: "> " },
  { label: "代码块", keywords: "code 代码", detail: "带围栏的代码段", insert: "\u0060\u0060\u0060\n\n\u0060\u0060\u0060", cursorOffset: 4 },
  { label: "分隔线", keywords: "hr 分割线 divider", detail: "章节分隔", insert: "---\n\n" },
  { label: "表格", keywords: "table 表格", detail: "两列表格", insert: "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |", cursorOffset: 2 },
  { label: "上传图片", keywords: "image 图片 照片", detail: "选择本地图片", callback: "image" },
  { label: "AI 助手", keywords: "ai 智能 润色", detail: "在笔记中使用 AI", callback: "ai" },
];

export function slashCommandLabels(query: string): string[] {
  const q = query.toLocaleLowerCase().trim();
  return actions.filter(action => !q || (action.label + " " + action.keywords).toLocaleLowerCase().includes(q))
    .map(action => action.label);
}

function applySlashText(view: EditorView, from: number, to: number, action: SlashAction) {
  const insert = action.insert ?? "";
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + (action.cursorOffset ?? insert.length) },
    scrollIntoView: true,
    userEvent: "input.complete",
  });
}

export function markdownSlashCompletions({
  onImage,
  onAi,
}: { onImage?: (view: EditorView) => void; onAi?: () => void } = {}): Completion[] {
  return actions.filter(action => action.callback !== "image" || Boolean(onImage))
    .filter(action => action.callback !== "ai" || Boolean(onAi))
    .map(action => ({
      label: action.label,
      detail: action.detail,
      type: "keyword",
      apply(view: EditorView, _completion: Completion, from: number, to: number) {
        applySlashText(view, from, to, action);
        if (action.callback === "image") onImage?.(view);
        if (action.callback === "ai") onAi?.();
        if (!action.callback) view.focus();
      },
    }));
}
