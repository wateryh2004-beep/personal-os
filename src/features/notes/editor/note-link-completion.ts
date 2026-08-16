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
import type { EntityLinkSuggestion } from "@/features/links/types";

export type NoteLinkQuery = { kind: "note" | "entity"; from: number; to: number; query: string };

const noteLinkTriggers = ["[[", "【【"] as const;
const entityTrigger = "@";

function lastIndexOfAny(value: string, candidates: readonly string[]): { value: string; offset: number } | null {
  let best: { value: string; offset: number } | null = null;
  for (const candidate of candidates) {
    const offset = value.lastIndexOf(candidate);
    if (offset > (best?.offset ?? -1)) best = { value: candidate, offset };
  }
  return best;
}

export function extractNoteLinkQuery(document: string, position: number): NoteLinkQuery | null {
  const lineStart = document.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const beforeCursor = document.slice(lineStart, position);

  // 既有笔记触发符 [[ / 【【。
  const trigger = lastIndexOfAny(beforeCursor, noteLinkTriggers);
  if (trigger && trigger.offset >= 0) {
    if (trigger.value === "[[" && beforeCursor[trigger.offset - 1] === "[") return null;
    const query = beforeCursor.slice(trigger.offset + trigger.value.length);
    if (/[\[\]【】\r\n]/.test(query)) return null;
    return { kind: "note", from: lineStart + trigger.offset, to: position, query };
  }

  // 跨实体触发符 @:@ 前是普通字符(如邮箱 foo@bar)不触发。
  const atOffset = beforeCursor.lastIndexOf(entityTrigger);
  if (atOffset >= 0) {
    const beforeAt = beforeCursor[atOffset - 1];
    if (!beforeAt || !/[A-Za-z0-9_.-]/.test(beforeAt)) {
      const query = beforeCursor.slice(atOffset + 1);
      if (query && !/[\s\[\]【】@]/.test(query)) {
        return { kind: "entity", from: lineStart + atOffset, to: position, query };
      }
    }
  }
  return null;
}

function uniqueNotes(notes: readonly NoteLinkSuggestion[]) {
  return [...new Map(notes.map((note) => [note.id, note])).values()];
}

function uniqueEntities(entities: readonly EntityLinkSuggestion[]) {
  return [...new Map(entities.map((entity) => [entity.id, entity])).values()];
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

function entityCompletionFor(entity: EntityLinkSuggestion): Completion {
  return {
    label: entity.title,
    detail: entity.label,
    type: "text",
    apply(view, _completion, from, to) {
      const insert = `[${entity.title}](${entity.href})`;
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
  searchEntities?: (query: string) => Promise<EntityLinkSuggestion[]>;
};

/**
 * Uses CodeMirror's own completion state and keyboard controls. Empty queries
 * are entirely local; only a real title query reaches the owner-only endpoint.
 */
export function createNoteLinkCompletion({ recentNotes, searchNotes, searchEntities }: NoteLinkCompletionOptions): Extension {
  let suppressedFrom: number | null = null;
  let controller: AbortController | null = null;
  let requestSequence = 0;

  const loadRemoteSuggestions = async <T>(query: string, loader: (query: string) => Promise<T[]>) => {
    controller?.abort();
    controller = new AbortController();
    const sequence = ++requestSequence;
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    if (sequence !== requestSequence) return [];
    try {
      const items = await loader(query);
      return sequence === requestSequence ? items : [];
    } catch {
      return [];
    }
  };

  const source: CompletionSource = async (context: CompletionContext) => {
    const token = extractNoteLinkQuery(context.state.doc.toString(), context.pos);
    if (!token || token.from === suppressedFrom) return null;
    if (token.kind === "entity") {
      if (!searchEntities) return null;
      const query = token.query.trim();
      if (!query) return null;
      const entities = await loadRemoteSuggestions(query, searchEntities);
      return { from: token.from, options: uniqueEntities(entities).map(entityCompletionFor), filter: false };
    }
    const notes = token.query.trim()
      ? await loadRemoteSuggestions(token.query, searchNotes)
      : recentNotes;
    const options = uniqueNotes(notes).map(completionFor);
    // `from` intentionally includes either supported Wiki-link trigger so
    // accepting a result replaces the whole token with the canonical link.
    // Let the owner-only search rank the options: CodeMirror's default filter
    // would otherwise try to match the trigger and query against titles.
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
