import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

export type MarkdownImageSpec = {
  alt: string;
  src: string;
};

const markdownImagePattern = /^!\[([^\]]*)\]\((\S+?)(?:\s+["'].*["'])?\)$/;

export function parseMarkdownImage(source: string): MarkdownImageSpec | null {
  const match = markdownImagePattern.exec(source.trim());
  if (!match) return null;
  const src = match[2];
  if (!src.startsWith("/") && !/^https?:\/\//i.test(src)) return null;
  return { alt: match[1].trim() || "笔记图片", src };
}

function selectionTouches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((range) =>
    range.empty
      ? range.from > from && range.from < to
      : range.from < to && range.to > from,
  );
}

class MarkdownImageWidget extends WidgetType {
  constructor(
    readonly spec: MarkdownImageSpec,
    readonly sourceFrom: number,
  ) {
    super();
  }

  eq(other: MarkdownImageWidget) {
    return other.spec.src === this.spec.src && other.spec.alt === this.spec.alt;
  }

  toDOM(view: EditorView) {
    const figure = document.createElement("figure");
    figure.className = "cm-note-image-preview";
    figure.contentEditable = "false";
    figure.title = "点击图片可编辑 Markdown 源码";

    const image = document.createElement("img");
    image.src = this.spec.src;
    image.alt = this.spec.alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      figure.classList.add("cm-note-image-preview-error");
      figure.setAttribute("data-error", "图片暂时无法显示，点击查看源码");
    });
    figure.append(image);
    figure.addEventListener("click", () => {
      view.dispatch({
        selection: { anchor: this.sourceFrom + 2 },
        scrollIntoView: true,
      });
      view.focus();
    });
    return figure;
  }

  ignoreEvent(event: Event) {
    return event.type !== "click";
  }
}

function imageDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name !== "Image") return;
      if (selectionTouches(view.state, node.from, node.to)) return;
      const spec = parseMarkdownImage(view.state.sliceDoc(node.from, node.to));
      if (!spec) return;
      builder.add(
        node.from,
        node.to,
        Decoration.replace({
          block: false,
          inclusive: false,
          widget: new MarkdownImageWidget(spec, node.from),
        }),
      );
    },
  });
  return builder.finish();
}

const markdownImagePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = imageDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = imageDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export const markdownImagePreview: Extension = markdownImagePreviewPlugin;
