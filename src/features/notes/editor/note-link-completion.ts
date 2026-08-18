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
import { Prec, type Extension } from "@codemirror/state";
import type { EntityLinkSuggestion } from "@/features/links/types";
import type { NoteLinkSuggestion } from "@/features/notes/links/types";

export type NoteLinkQuery = {
  kind: "note" | "entity";
  from: number;
  to: number;
  query: string;
};

// `[[` / `【【` 是等价的笔记专用入口；`@` 保留跨实体入口，单独输入时显示最近笔记。
// @ 前是普通字符(如邮箱 foo@bar)时不触发，避免误判邮件地址。
export function extractNoteLinkQuery(document: string, position: number): NoteLinkQuery | null {
  const lineStart = document.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const beforeCursor = document.slice(lineStart, position);

  const asciiWikiOffset = beforeCursor.lastIndexOf("[[");
  const fullWidthWikiOffset = beforeCursor.lastIndexOf("【【");
  const wikiOffset = Math.max(asciiWikiOffset, fullWidthWikiOffset);
  if (wikiOffset >= 0) {
    const trigger = wikiOffset === fullWidthWikiOffset ? "【【" : "[[";
    if (beforeCursor[wikiOffset - 1] === trigger[0]) return null;
    const query = beforeCursor.slice(wikiOffset + 2);
    if (/[\[\]【】\r\n]/.test(query)) return null;
    return { kind: "note", from: lineStart + wikiOffset, to: position, query };
  }

  const atOffset = beforeCursor.lastIndexOf("@");
  if (atOffset < 0) return null;
  const beforeAt = beforeCursor[atOffset - 1];
  if (beforeAt && /[A-Za-z0-9_.-]/.test(beforeAt)) return null;
  const query = beforeCursor.slice(atOffset + 1);
  if (/[\s\[\]【】@]/.test(query)) return null;
  return { kind: "entity", from: lineStart + atOffset, to: position, query };
}

function uniqueNotes(notes: readonly NoteLinkSuggestion[]) {
  return [...new Map(notes.map((note) => [note.id, note])).values()];
}

function uniqueEntities(entities: readonly EntityLinkSuggestion[]) {
  return [...new Map(entities.map((entity) => [entity.id, entity])).values()];
}

function noteCompletionFor(note: NoteLinkSuggestion): Completion {
  return {
    label: note.title,
    detail: note.folderName || "笔记",
    type: "text",
    apply(view, _completion, from, to) {
      const insert = `[${note.title}](/notes/${note.id})`;
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
  searchNotes: (query: string) => Promise<NoteLinkSuggestion[]>;
  searchEntities: (query: string) => Promise<EntityLinkSuggestion[]>;
};

/**
 * `[[` 始终搜索笔记；`@` 无查询时显示最近笔记，输入查询后搜索全部可引用实体。
 */
export function createNoteLinkCompletion({ searchNotes, searchEntities }: NoteLinkCompletionOptions): Extension {
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
    const query = token.query.trim();
    if (token.kind === "note" || !query) {
      const notes = await loadRemoteSuggestions(query, searchNotes);
      return {
        from: token.from,
        options: uniqueNotes(notes).map(noteCompletionFor),
        filter: false,
      };
    }
    const entities = await loadRemoteSuggestions(query, searchEntities);
    return { from: token.from, options: uniqueEntities(entities).map(entityCompletionFor), filter: false };
  };

  return [
    autocompletion({
      override: [source],
      activateOnTyping: false,
      defaultKeymap: false,
      icons: false,
      maxRenderedOptions: 20,
      tooltipClass: () => "cm-note-link-completion",
    }),
    // Keep completion navigation ahead of the editor's own keymaps. Without
    // this priority the base editor consumes ArrowUp/ArrowDown before the
    // suggestion list sees them.
    Prec.highest(keymap.of([
      {
        key: "Escape",
        run(view) {
          if (completionStatus(view.state) !== "active") return false;
          suppressedFrom = extractNoteLinkQuery(view.state.doc.toString(), view.state.selection.main.head)?.from ?? null;
          return closeCompletion(view);
        },
      },
      ...completionKeymap,
    ])),
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
