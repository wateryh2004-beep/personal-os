import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type EditorState, type Extension } from "@codemirror/state";
import {
  Decoration, EditorView, ViewPlugin, WidgetType,
  type DecorationSet, type ViewUpdate,
} from "@codemirror/view";

export type MarkdownImageSpec = { alt: string; src: string; title?: string };

const pattern = /^!\[([^\]]*)\]\((\S+?)(?:\s+"((?:\\.|[^"\\])*)")?\)$/;

export function parseMarkdownImage(source: string): MarkdownImageSpec | null {
  const match = pattern.exec(source.trim());
  if (!match) return null;
  const src = match[2];
  if (!/^https?:\/\/\S+$/i.test(src) && !/^\/(?!\/)\S*$/.test(src)) return null;
  const alt = match[1].trim() || "笔记图片";
  const title = match[3]?.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return title ? { alt, src, title } : { alt, src };
}

/** Standard, portable Markdown image syntax, with no custom width metadata. */
export function serializeMarkdownImage(spec: MarkdownImageSpec): string {
  const alt = spec.alt.replace(/[\n\r]+/g, " ").replace(/\\/g, "\\\\").replace(/[\[\]]/g, "");
  const src = spec.src.trim();
  if (!/^https?:\/\/\S+$/i.test(src) && !/^\/(?!\/)\S*$/.test(src))
    throw new Error("图片地址应为站内路径或 HTTPS/HTTP 地址");
  const title = spec.title?.trim().replace(/[\n\r]+/g, " ");
  return "![" + (alt || "笔记图片") + "](" + src +
    (title ? ' "' + title.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"' : "") + ")";
}

function selectionTouches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some(range =>
    range.empty ? range.from > from && range.from < to : range.from < to && range.to > from,
  );
}

class MarkdownImageWidget extends WidgetType {
  constructor(
    readonly spec: MarkdownImageSpec,
    readonly sourceFrom: number,
    readonly sourceTo: number,
    readonly original: string,
  ) { super(); }

  eq(other: MarkdownImageWidget) {
    return other.sourceFrom === this.sourceFrom && other.sourceTo === this.sourceTo &&
      other.original === this.original;
  }

  toDOM(view: EditorView) {
    const figure = document.createElement("figure");
    figure.className = "cm-note-image-preview";
    figure.contentEditable = "false";

    const img = document.createElement("img");
    img.src = this.spec.src;
    img.alt = this.spec.alt;
    img.loading = "lazy";
    img.decoding = "async";
    img.title = "点击图片可编辑 Markdown 源码";
    img.addEventListener("error", () => {
      figure.classList.add("cm-note-image-preview-error");
      figure.setAttribute("data-error", "图片暂时无法显示，点击查看源码");
    });
    img.addEventListener("click", () => {
      view.dispatch({ selection: { anchor: this.sourceFrom + 2 }, scrollIntoView: true });
      view.focus();
    });
    figure.append(img);

    if (this.spec.title) {
      const caption = document.createElement("figcaption");
      caption.className = "cm-note-image-caption";
      caption.textContent = this.spec.title;
      figure.append(caption);
    }

    const actions = document.createElement("div");
    actions.className = "cm-note-image-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "调整图片";
    edit.setAttribute("aria-label", "调整图片");
    actions.append(edit);
    const open = document.createElement("a");
    open.href = this.spec.src;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "查看原图";
    actions.append(open);
    figure.append(actions);

    const form = document.createElement("form");
    form.className = "cm-note-image-editor";
    form.hidden = true;
    form.setAttribute("aria-label", "图片属性");
    const field = (label: string, value: string, name: string) => {
      const wrapper = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = label;
      const input = document.createElement("input");
      input.type = "text";
      input.name = name;
      input.value = value;
      input.setAttribute("aria-label", label);
      wrapper.append(title, input);
      form.append(wrapper);
      return input;
    };
    const alt = field("替代文字", this.spec.alt, "alt");
    const title = field("图片说明", this.spec.title ?? "", "title");
    const src = field("图片地址", this.spec.src, "src");
    const notice = document.createElement("span");
    notice.className = "cm-note-image-message";
    notice.setAttribute("role", "status");
    form.append(notice);

    const sourceCurrent = () => view.state.sliceDoc(this.sourceFrom, this.sourceTo) === this.original;
    const updateSource = (replacement: string) => {
      if (!sourceCurrent()) {
        notice.textContent = "图片源码已变化，请退出编辑后重新打开";
        return;
      }
      view.dispatch({
        changes: { from: this.sourceFrom, to: this.sourceTo, insert: replacement },
        selection: { anchor: this.sourceFrom + replacement.length },
        scrollIntoView: true,
        userEvent: "input",
      });
      view.focus();
    };
    const controls = document.createElement("div");
    controls.className = "cm-note-image-editor-actions";
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "保存图片属性";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.addEventListener("click", () => {
      form.hidden = true;
      actions.hidden = false;
      edit.focus({ preventScroll: true });
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "移除图片";
    remove.addEventListener("click", () => updateSource(""));
    controls.append(save, cancel, remove);
    form.append(controls);

    form.addEventListener("submit", event => {
      event.preventDefault();
      try { updateSource(serializeMarkdownImage({ alt: alt.value, src: src.value, title: title.value })); }
      catch (error) { notice.textContent = error instanceof Error ? error.message : "图片信息无效"; }
    });
    edit.addEventListener("click", () => {
      actions.hidden = true;
      form.hidden = false;
      alt.focus({ preventScroll: true });
    });
    figure.append(form);
    return figure;
  }

  ignoreEvent() { return true; }
}

function imageDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name !== "Image") return;
      if (selectionTouches(view.state, node.from, node.to)) return;
      const original = view.state.sliceDoc(node.from, node.to);
      const spec = parseMarkdownImage(original);
      if (!spec) return;
      builder.add(node.from, node.to, Decoration.replace({
        block: false,
        inclusive: false,
        widget: new MarkdownImageWidget(spec, node.from, node.to, original),
      }));
    },
  });
  return builder.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = imageDecorations(view); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged)
        this.decorations = imageDecorations(update.view);
    }
  },
  { decorations: value => value.decorations },
);

export const markdownImagePreview: Extension = plugin;
