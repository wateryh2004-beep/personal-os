import { StateField, type Text } from "@codemirror/state";

function count(text: Text, from = 0, to = text.length) {
  let total = 0;
  // CodeMirror's rope iterator avoids flattening the entire document.
  for (const cursor = text.iterRange(from, to); !cursor.next().done;) total += cursor.value.replace(/\s/g, "").length;
  return total;
}
export const documentCharacterCount = StateField.define<number>({
  create: (state) => count(state.doc),
  update: (value, transaction) => {
    if (!transaction.docChanged) return value;
    transaction.changes.iterChanges((from, to, _from, _to, inserted) => {
      value += count(inserted) - count(transaction.startState.doc, from, to);
    });
    return value;
  },
});
