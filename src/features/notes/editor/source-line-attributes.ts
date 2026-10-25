import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

/** Expose the visible source-line anchors without scanning or decorating the full document. */
function anchors(view: EditorView) {
  const seen = new Set<number>();
  const ranges = [];
  for (const range of view.visibleRanges) {
    for (let pos = range.from; pos <= range.to;) {
      const line = view.state.doc.lineAt(pos);
      if (!seen.has(line.from)) { seen.add(line.from); ranges.push(Decoration.line({ attributes: { "data-source-line": String(line.number) } }).range(line.from)); }
      if (line.to >= range.to) break;
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}
export const sourceLineAttributes = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = anchors(view); }
  update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged) this.decorations = anchors(update.view); }
}, { decorations: (plugin) => plugin.decorations });
