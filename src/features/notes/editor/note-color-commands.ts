import { syntaxTree } from "@codemirror/language";
import type { EditorState, StateCommand } from "@codemirror/state";
import { noteColorTones, type NoteColorTone } from "./note-color-palette";
import { noteCalloutFromSourceLine, noteInlineColorsInText } from "./note-color-syntax";

const calloutMarkers: Record<NoteColorTone, string> = {
  info: "NOTE", warning: "WARNING", important: "IMPORTANT", idea: "TIP", quote: "QUOTE",
};
const unsafeNodes = new Set(["InlineCode", "FencedCode", "CodeBlock", "HTMLBlock", "Link", "Image", "Autolink"]);

function inUnsafeSyntax(state: EditorState, at: number) {
  let node = syntaxTree(state).resolveInner(Math.min(at, state.doc.length), -1);
  while (node) {
    if (unsafeNodes.has(node.name)) return true;
    node = node.parent!;
  }
  return false;
}

/** One plain-text selection becomes one portable Markdown token. */
export function setNoteInlineColor(role: "text" | "highlight", tone: NoteColorTone): StateCommand {
  return ({ state, dispatch }) => {
    const range = state.selection.main;
    if (range.empty || range.from === range.to) return false;
    const selected = state.sliceDoc(range.from, range.to);
    if (inUnsafeSyntax(state, range.from) || inUnsafeSyntax(state, range.to - 1)) return false;
    const line = state.doc.lineAt(range.from);
    const current = noteInlineColorsInText(line.text).find(item =>
      (line.from + item.from === range.from && line.from + item.to === range.to) ||
      (line.from + item.contentFrom === range.from && line.from + item.contentTo === range.to));
    const plain = current?.text ?? selected;
    const kind = role === "text" ? "ink" : "mark";
    if (plain.length > 1000 || /[\r\n{}]/.test(plain)) return false;
    const insert = `{{${kind}:${tone}|${plain}}}`;
    const from = current ? line.from + current.from : range.from;
    const to = current ? line.from + current.to : range.to;
    if (state.sliceDoc(from, to) === insert) return true;
    dispatch(state.update({
      changes: { from, to, insert },
      selection: { anchor: from, head: from + insert.length },
      scrollIntoView: true,
      userEvent: "input",
    }));
    return true;
  };
}

/** Remove one complete token, without stripping unrelated Markdown syntax. */
export const clearNoteInlineColor: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (range.empty || state.doc.lineAt(range.from).number !== state.doc.lineAt(range.to).number) return false;
  const line = state.doc.lineAt(range.from);
  const token = noteInlineColorsInText(line.text).find(item =>
    (line.from + item.from === range.from && line.from + item.to === range.to) ||
    (line.from + item.contentFrom === range.from && line.from + item.contentTo === range.to));
  if (!token) return false;
  const from = line.from + token.from;
  const to = line.from + token.to;
  dispatch(state.update({
    changes: { from, to, insert: token.text },
    selection: { anchor: from, head: from + token.text.length },
    scrollIntoView: true,
    userEvent: "input",
  }));
  return true;
};

/** Insert a GFM-compatible callout at the current paragraph or selected lines. */
export function setNoteCallout(tone: NoteColorTone): StateCommand {
  return ({ state, dispatch }) => {
    const range = state.selection.main;
    const start = state.doc.lineAt(range.from);
    const end = state.doc.lineAt(Math.max(range.from, range.to - (range.empty ? 0 : 1)));
    // Preserve existing Markdown structure by rejecting a selection inside
    // fenced code. A callout inside another quote would nest unexpectedly.
    if (inUnsafeSyntax(state, start.from) || inUnsafeSyntax(state, end.from)) return false;
    const lines = Array.from({ length: end.number - start.number + 1 }, (_, i) => state.doc.line(start.number + i));
    const old = noteCalloutFromSourceLine(start.text);
    if (old) {
      const before = /^( {0,3}>\s?)\[![A-Z]+\]/.exec(start.text);
      if (!before) return false;
      const from = start.from + before[1].length;
      const to = from + old.markerLength;
      const insert = `[!${calloutMarkers[tone]}]`;
      if (state.sliceDoc(from, to) === insert) return true;
      dispatch(state.update({ changes: { from, to, insert }, userEvent: "input", scrollIntoView: true }));
      return true;
    }
    if (lines.some(line => /^\s*>/.test(line.text))) return false;
    const marker = `> [!${calloutMarkers[tone]}]\n`;
    const body = lines.map(line => line.text ? `> ${line.text}` : ">").join("\n");
    const selectedText = state.sliceDoc(start.from, end.to);
    // For a blank paragraph place the caret after "> " so writing is immediate.
    const insert = marker + (selectedText.trim() ? body + "\n" : "> \n");
    dispatch(state.update({
      changes: { from: start.from, to: end.to, insert },
      selection: { anchor: selectedText.trim() ? start.from + insert.length : start.from + marker.length + 2 },
      scrollIntoView: true,
      userEvent: "input",
    }));
    return true;
  };
}

export const noteColorCalloutOptions = noteColorTones.map(({ id, label }) => ({
  id, label, marker: calloutMarkers[id],
}));
