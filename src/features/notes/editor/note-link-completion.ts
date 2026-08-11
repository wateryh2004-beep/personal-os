import {
  autocompletion,
  closeCompletion,
  completionKeymap,
  completionStatus,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { keymap, EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { NoteLinkSuggestion } from "@/features/notes/links/types";

export type NoteLinkQuery = { from: number; to: number; query: string };

export function extractNoteLinkQuery(document: string, position: number): NoteLinkQuery | null {
  const lineStart = document.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const beforeCursor = document.slice(lineStart, position);
  const triggerOffset = beforeCursor.lastIndexOf("[[");
  if (triggerOffset < 0 || beforeCursor[triggerOffset - 1] === "[") return null;
  const query = beforeCursor.slice(triggerOffset + 2);
  if (/[\[\]\r\n]/.test(query) || query.includes("]]")) return null;
  return { from: lineStart + triggerOffset, to: position, query };
}

function uniqueNotes(notes: readonly NoteLinkSuggestion[]) {
  return [...new Map(notes.map((note) => [note.id, note])).values()];
}

function markdownLink(note: NoteLinkSuggestion) {
  return `[${note.title}](/notes/${note.id})`;
}

function completionFor(note: NoteLinkSuggestion): Completion {
  return {
    label: note.title,
    detail: note.folderName || "笔记",
    type: "text",
    apply(view, _completion, from, to) {
      const insert = markdownLink(note);
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        scrollIntoView: true,
        userEvent: "input.complete",
      });
    },
  };
}

export type NoteLinkCompletionOptions = {
  recentNotes: readonly NoteLinkSuggestion[];
  searchNotes: (query: string) => Promise<NoteLinkSuggestion[]>;
};

/**
 * Uses CodeMirror's own completion state and keyboard controls. Empty queries
 * are entirely local; only a real title query reaches the owner-only endpoint.
 */
export function createNoteLinkCompletion({ recentNotes, searchNotes }: NoteLinkCompletionOptions): Extension {
  let suppressedFrom: number | null = null;
  let controller: AbortController | null = null;
  let requestSequence = 0;

  const loadRemoteSuggestions = async (query: string) => {
    controller?.abort();
    controller = new AbortController();
    const sequence = ++requestSequence;
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    if (sequence !== requestSequence) return [];
    try {
      const notes = await searchNotes(query);
      return sequence === requestSequence ? notes : [];
    } catch {
      return [];
    }
  };

  const source: CompletionSource = async (context: CompletionContext) => {
    const token = extractNoteLinkQuery(context.state.doc.toString(), context.pos);
    if (!token || token.from === suppressedFrom) return null;
    const notes = token.query.trim()
      ? await loadRemoteSuggestions(token.query)
      : recentNotes;
    const options = uniqueNotes(notes).map(completionFor);
    // `from` intentionally includes `[[` so accepting a result replaces the
    // whole token. Let the owner-only search rank the options: CodeMirror's
    // default filter would otherwise try to match `[[query` against titles and
    // hide every result.
    return { from: token.from, options, filter: false };
  };

  return [
    autocompletion({
      override: [source],
      activateOnTyping: false,
      defaultKeymap: false,
      maxRenderedOptions: 20,
      tooltipClass: () => "cm-note-link-completion",
    }),
    keymap.of([
      {
        key: "Escape",
        run(view) {
          if (completionStatus(view.state) !== "active") return false;
          suppressedFrom = extractNoteLinkQuery(view.state.doc.toString(), view.state.selection.main.head)?.from ?? null;
          return closeCompletion(view);
        },
      },
      ...completionKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if ((!update.docChanged && !update.selectionSet) || update.view.composing) return;
      const token = extractNoteLinkQuery(
        update.state.doc.toString(),
        update.state.selection.main.head,
      );
      if (!token) {
        suppressedFrom = null;
        if (completionStatus(update.state) === "active") queueMicrotask(() => closeCompletion(update.view));
        return;
      }
      if (token.from === suppressedFrom) return;
      queueMicrotask(() => {
        if (update.view.dom.isConnected && !update.view.composing) startCompletion(update.view);
      });
    }),
  ];
}
