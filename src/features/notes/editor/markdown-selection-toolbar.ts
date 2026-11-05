import { showTooltip, type EditorView, type Tooltip } from "@codemirror/view";
import type { Extension, StateCommand } from "@codemirror/state";
import { createMarkdownLink, toggleBold, toggleBlockquote, toggleInlineCode, toggleItalic } from "./markdown-commands";

/** Uses the CodeMirror selection directly; no duplicate React document state. */
export function markdownSelectionToolbar(openAi?: () => void): Extension {
  return showTooltip.compute(["selection"], (state): Tooltip | null => {
    const range = state.selection.main;
    if (range.empty || !state.sliceDoc(range.from, range.to).trim()) return null;
    return {
      pos: range.from,
      end: range.to,
      above: true,
      arrow: false,
      create(view: EditorView) {
        const toolbar = document.createElement("div");
        toolbar.className = "cm-note-selection-toolbar";
        toolbar.setAttribute("role", "toolbar");
        toolbar.setAttribute("aria-label", "选区快捷格式");
        const action = (name: string, onClick: () => void) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = name;
          button.setAttribute("aria-label", name);
          button.addEventListener("mousedown", event => event.preventDefault());
          button.addEventListener("click", onClick);
          toolbar.append(button);
        };
        const format = (name: string, command: StateCommand) =>
          action(name, () => { command(view); view.focus(); });
        format("粗体", toggleBold);
        format("斜体", toggleItalic);
        format("链接", createMarkdownLink);
        format("行内代码", toggleInlineCode);
        format("引用", toggleBlockquote);
        if (openAi) action("AI", openAi);
        return { dom: toolbar };
      },
    };
  });
}
