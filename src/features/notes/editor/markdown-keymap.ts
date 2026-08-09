import { Prec, type StateCommand } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";
import {
  continueMarkdownList,
  createMarkdownLink,
  deleteMarkdownListMarkupBackward,
  deleteSelectedListItems,
  indentMarkdownList,
  outdentMarkdownList,
  toggleBold,
  toggleItalic,
} from "./markdown-commands";

const withoutComposition = (command: StateCommand): Command => (view) =>
  view.composing ? false : command(view);

export const markdownEditorKeymap = Prec.highest(
  keymap.of([
    { key: "Enter", run: withoutComposition(continueMarkdownList) },
    { key: "Backspace", run: withoutComposition(deleteMarkdownListMarkupBackward) },
    { key: "Backspace", run: withoutComposition(deleteSelectedListItems) },
    { key: "Delete", run: withoutComposition(deleteSelectedListItems) },
    { key: "Tab", run: withoutComposition(indentMarkdownList) },
    { key: "Shift-Tab", run: withoutComposition(outdentMarkdownList) },
    { key: "Mod-b", run: withoutComposition(toggleBold) },
    { key: "Mod-i", run: withoutComposition(toggleItalic) },
    { key: "Mod-k", run: withoutComposition(createMarkdownLink) },
  ]),
);
