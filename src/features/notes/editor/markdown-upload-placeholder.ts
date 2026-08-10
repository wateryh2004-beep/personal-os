import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

type UploadRange = { id: string; from: number; to: number };

export const addMarkdownUploadPlaceholder = StateEffect.define<UploadRange>({
  map(value, changes) {
    return {
      ...value,
      from: changes.mapPos(value.from, -1),
      to: changes.mapPos(value.to, 1),
    };
  },
});

export const removeMarkdownUploadPlaceholder = StateEffect.define<string>();

class UploadWidget extends WidgetType {
  constructor(readonly uploadId: string) {
    super();
  }

  eq(other: UploadWidget) {
    return other.uploadId === this.uploadId;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = "cm-note-image-upload";
    element.dataset.uploadId = this.uploadId;
    element.setAttribute("aria-label", "图片上传中");
    element.setAttribute("role", "status");
    element.textContent = "图片上传中…";
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

function uploadDecoration(value: UploadRange) {
  if (value.from === value.to) {
    return Decoration.widget({
      widget: new UploadWidget(value.id),
      side: 1,
      uploadId: value.id,
    }).range(value.from);
  }
  return Decoration.mark({
    class: "cm-note-image-upload-range",
    uploadId: value.id,
  }).range(value.from, value.to);
}

const uploadPlaceholderField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(placeholders, transaction) {
    let next = placeholders.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(addMarkdownUploadPlaceholder)) {
        next = next.update({ add: [uploadDecoration(effect.value)], sort: true });
      } else if (effect.is(removeMarkdownUploadPlaceholder)) {
        next = next.update({
          filter: (_from, _to, decoration) =>
            decoration.spec.uploadId !== effect.value,
        });
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const markdownUploadPlaceholder: Extension = uploadPlaceholderField;

export function findMarkdownUploadRange(state: EditorState, uploadId: string) {
  const placeholders = state.field(uploadPlaceholderField, false);
  if (!placeholders) return null;
  const matches: Array<{ from: number; to: number }> = [];
  placeholders.between(0, state.doc.length, (from, to, decoration) => {
    if (decoration.spec.uploadId === uploadId) matches.push({ from, to });
  });
  return matches[0] ?? null;
}
