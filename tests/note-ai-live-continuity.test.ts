// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import { applyNoteAiEditorChange, registerNoteAiTarget, captureNoteAiBaseline, applyNoteAiSuggestion, type NoteAiLiveSnapshot } from "@/features/assistant/note-ai-live";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
let view: EditorView; let unregister = () => {}; let root: HTMLDivElement;
const noteId = "11111111-1111-4111-8111-111111111111";
let flags: Pick<NoteAiLiveSnapshot, "revision" | "knownRemoteRevision" | "title" | "editable" | "composing" | "conflict">;
function mount(body: string) {
  view = new EditorView({ state: EditorState.create({ doc: body, extensions: [history()] }), parent: root });
  unregister = registerNoteAiTarget({ read: () => ({ ...flags, noteId, role: "main", sourceMarkdown: view.state.doc.toString() }), apply: (baseline, change) => {
    if (change.mode === "title") { flags.title = change.text; return true; }
    return applyNoteAiEditorChange(view, baseline, change);
  } });
}
beforeEach(() => { clearWorkspaceResources(); flags = { revision: 1, knownRemoteRevision: 1, title: "Original title", editable: true, composing: false, conflict: false }; root = document.createElement("div"); document.body.append(root); });
afterEach(() => { unregister(); view?.destroy(); root.remove(); clearWorkspaceResources(); });
it("rebinds an immutable selected baseline to the new live CodeMirror instance and undoes in one transaction", () => {
  const body = "# Heading\n\nOriginal selected words\n\nTail"; mount(body);
  const from = body.indexOf("Original"), to = body.indexOf("\n\nTail");
  const baseline = captureNoteAiBaseline(noteId, "main", { from, to, text: body.slice(from, to) })!;
  unregister(); view.destroy(); mount(body); flags.revision = 2; flags.knownRemoteRevision = 2; flags.title = "User's newer unselected title";
  expect(applyNoteAiSuggestion(baseline, { mode: "replace", text: "Improved selected words" })).toEqual({ status: "applied" });
  expect(view.state.doc.toString()).toBe("# Heading\n\nImproved selected words\n\nTail"); expect(flags.title).toBe("User's newer unselected title");
  expect(undo(view)).toBe(true); expect(view.state.doc.toString()).toBe(body);
});
it("rejects changed content, known remote conflict, IME and readonly even when original text matches", () => {
  mount("original"); const baseline = captureNoteAiBaseline(noteId, "main", null)!;
  for (const patch of [{ conflict: true }, { knownRemoteRevision: 2 }, { composing: true }, { editable: false }]) {
    const original = { ...flags }; Object.assign(flags, patch); expect(applyNoteAiSuggestion(baseline, { mode: "replace", text: "new" }).status).toBe("conflict"); flags = original;
  }
  view.dispatch({ changes: { from: 0, to: 8, insert: "user edit" } }); expect(applyNoteAiSuggestion(baseline, { mode: "replace", text: "new" }).status).toBe("conflict");
  expect(view.state.doc.toString()).toBe("user edit");
});
it("compares title independently and refuses ambiguous duplicate live targets or a previous owner token", () => {
  mount("body"); const baseline = captureNoteAiBaseline(noteId, "main", { from: 0, to: 4, text: "body" })!;
  view.dispatch({ changes: { from: 0, to: 4, insert: "new body" } });
  expect(applyNoteAiSuggestion(baseline, { mode: "title", text: "Suggested title" }).status).toBe("applied"); expect(view.state.doc.toString()).toBe("new body");
  const duplicate = registerNoteAiTarget({ read: () => ({ ...flags, noteId, role: "main", sourceMarkdown: "new body" }), apply: () => true });
  expect(captureNoteAiBaseline(noteId, "main", null)).toBeNull(); expect(applyNoteAiSuggestion(baseline, { mode: "replace", text: "x" }).status).toBe("ambiguous"); duplicate();
  clearWorkspaceResources(); unregister(); view.destroy(); mount("body"); flags.title = baseline.title;
  expect(applyNoteAiSuggestion(baseline, { mode: "replace", text: "foreign" }).status).toBe("inactive");
});
