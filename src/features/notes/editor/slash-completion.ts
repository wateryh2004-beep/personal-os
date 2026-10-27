import { syntaxTree } from "@codemirror/language";
import type { CompletionSource } from "@codemirror/autocomplete";

const blocks = [
  ["标题", "h1", "# "], ["二级标题", "h2", "## "], ["三级标题", "h3", "### "],
  ["无序列表", "list", "- "], ["有序列表", "ordered", "1. "], ["待办", "task", "- [ ] "],
  ["引用", "quote", "> "], ["代码块", "code", "```\n\n```"], ["分隔线", "divider", "---\n"],
] as const;

/** Local completion only; no body or slash query leaves the editor. */
export const slashCompletion: CompletionSource = (context) => {
  if (!context.state.selection.main.empty) return null;
  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);
  const match = /^(\s{0,3})\/([^\s/]*)$/.exec(before);
  if (!match) return null;
  let node = syntaxTree(context.state).resolveInner(Math.max(line.from, context.pos - 1), -1);
  while (node.parent) {
    if (["FencedCode", "CodeBlock", "InlineCode", "Link", "URL", "HTMLBlock"].includes(node.name)) return null;
    node = node.parent;
  }
  const query = match[2].toLowerCase();
  return {
    from: line.from + match[1].length,
    filter: false,
    options: blocks.filter(([label, alias]) => !query || label.includes(query) || alias.includes(query)).map(([label, alias, insert]) => ({
      label: `/${alias}`, displayLabel: label, detail: "Markdown 完整块", type: "text",
      apply(view, _completion, from, to) {
        if (view.composing || view.state.readOnly) return;
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + (alias === "code" ? 4 : insert.length) }, scrollIntoView: true, userEvent: "input.complete" });
      },
    })),
  };
};
