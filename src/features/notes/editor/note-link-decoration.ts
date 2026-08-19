import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  hoverTooltip,
  ViewPlugin,
  type DecorationSet,
  type Tooltip,
  type ViewUpdate,
} from "@codemirror/view";
import { parseInternalNoteLinkOccurrences } from "@/features/notes/links/parser";
import type { NoteLinkPreview } from "@/features/notes/links/types";

const previewCache = new Map<string, Promise<NoteLinkPreview | null>>();

function selectionTouches(view: EditorView, from: number, to: number) {
  return view.state.selection.ranges.some((range) =>
    range.empty ? range.from > from && range.from < to : range.from < to && range.to > from,
  );
}

function buildDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  for (const link of parseInternalNoteLinkOccurrences(view.state.doc.toString())) {
    if (selectionTouches(view, link.from, link.to)) continue;
    const labelFrom = link.from;
    const labelTo = link.from + link.label.length + 2;
    const hrefFrom = labelTo;
    builder.add(link.from, link.to, Decoration.mark({ class: "cm-note-internal-link" }));
    builder.add(labelFrom, labelTo, Decoration.mark({ class: "cm-note-internal-link-label", attributes: { "data-note-id": link.noteId } }));
    builder.add(hrefFrom, link.to, Decoration.mark({ class: "cm-note-internal-link-url" }));
  }
  return builder.finish();
}

const noteLinkDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function previewFor(noteId: string) {
  let request = previewCache.get(noteId);
  if (!request) {
    request = fetch(`/api/notes/${noteId}/link-preview`, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { note?: NoteLinkPreview };
        return data.note ?? null;
      })
      .catch(() => null);
    previewCache.set(noteId, request);
  }
  return request;
}

function previewTooltip(view: EditorView, position: number): Tooltip | null {
  const link = parseInternalNoteLinkOccurrences(view.state.doc.toString()).find(
    (item) => position >= item.from && position <= item.to,
  );
  if (!link) return null;
  return {
    pos: link.from,
    end: link.to,
    above: true,
    strictSide: false,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-note-link-preview";
      dom.setAttribute("role", "tooltip");
      dom.textContent = "正在读取笔记预览…";
      void previewFor(link.noteId).then((preview) => {
        if (!dom.isConnected) return;
        dom.replaceChildren();
        if (!preview) {
          dom.classList.add("cm-note-link-preview-broken");
          dom.textContent = "该笔记已删除或不可访问";
          return;
        }
        const title = document.createElement("strong");
        title.textContent = preview.title;
        const meta = document.createElement("span");
        meta.textContent = `${preview.folderName || "笔记"} · 点击打开`;
        const excerpt = document.createElement("p");
        excerpt.textContent = preview.excerpt || "这篇笔记暂无正文。";
        dom.append(title, meta, excerpt);
        // 预览卡片可点击：在新标签页打开目标笔记，不用先点进编辑器再找链接。
        dom.classList.add("cm-note-link-preview-openable");
        dom.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.open(`/notes/${link.noteId}`, "_blank", "noopener,noreferrer");
        });
      });
      return { dom };
    },
  };
}

const noteLinkCommandClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!event.metaKey && !event.ctrlKey) return false;
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position === null) return false;
    const link = parseInternalNoteLinkOccurrences(view.state.doc.toString()).find(
      (item) => position >= item.from && position <= item.to,
    );
    if (!link) return false;
    event.preventDefault();
    window.open(`/notes/${link.noteId}`, "_blank", "noopener,noreferrer");
    return true;
  },
});

export const noteLinkDecoration: Extension = [
  noteLinkDecorationPlugin,
  noteLinkCommandClick,
  hoverTooltip(previewTooltip, { hoverTime: 320 }),
];
