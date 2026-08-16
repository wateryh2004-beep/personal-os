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
import type { EntityLinkSuggestion } from "@/features/links/types";

export type NoteLinkQuery = { kind: "entity"; from: number; to: number; query: string };

// 唯一触发符是 @（飞书风格），笔记与跨实体统一走同一入口。
// @ 前是普通字符(如邮箱 foo@bar)时不触发，避免误判邮件地址。
export function extractNoteLinkQuery(document: string, position: number): NoteLinkQuery | null {
  const lineStart = document.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const beforeCursor = document.slice(lineStart, position);

  const atOffset = beforeCursor.lastIndexOf("@");
  if (atOffset < 0) return null;
  const beforeAt = beforeCursor[atOffset - 1];
  if (beforeAt && /[A-Za-z0-9_.-]/.test(beforeAt)) return null;
  const query = beforeCursor.slice(atOffset + 1);
  if (!query || /[\s\[\]【】@]/.test(query)) return null;
  return { kind: "entity", from: lineStart + atOffset, to: position, query };
}

function uniqueEntities(entities: readonly EntityLinkSuggestion[]) {
  return [...new Map(entities.map((entity) => [entity.id, entity])).values()];
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
  searchEntities: (query: string) => Promise<EntityLinkSuggestion[]>;
};

/**
 * 补全入口只有 @：没有 query 时不弹出，只有真实标题查询才会请求 owner-only 搜索端点。
 */
export function createNoteLinkCompletion({ searchEntities }: NoteLinkCompletionOptions): Extension {
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
    if (!query) return null;
    const entities = await loadRemoteSuggestions(query, searchEntities);
    return { from: token.from, options: uniqueEntities(entities).map(entityCompletionFor), filter: false };
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
