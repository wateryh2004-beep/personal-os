import { redo, undo } from "@codemirror/commands";
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import {
  addMarkdownTableColumn,
  addMarkdownTableRow,
  editMarkdownTableCell,
  parseMarkdownTables,
  type MarkdownTable,
  type TableChange,
} from "./markdown-table";

const setTableSource = StateEffect.define<number | null>();

type TablePreviewState = { decorations: DecorationSet; sourceFrom: number | null };

function locateTable(view: EditorView, root: HTMLElement): MarkdownTable | undefined {
  const start = Number(root.dataset.tableFrom);
  return parseMarkdownTables(view.state.doc.toString()).find(table => table.from === start);
}

function writeChange(view: EditorView, change: TableChange) {
  view.dispatch({ changes: change, userEvent: "input" });
}

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-note-table-action";
  button.textContent = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

function renderCell(
  view: EditorView,
  root: HTMLDivElement,
  row: number,
  column: number,
  text: string,
  readonly: boolean,
): HTMLTableCellElement {
  const element = document.createElement(row === -1 ? "th" : "td");
  element.dataset.column = String(column);
  element.dataset.row = String(row);
  if (readonly) {
    element.textContent = text;
    return element;
  }
  const input = document.createElement("input");
  input.type = "text";
  input.value = text;
  input.spellcheck = false;
  input.className = "cm-note-table-cell-input";
  input.setAttribute("aria-label", (row === -1 ? "表头" : "第 " + (row + 1) + " 行") + "第 " + (column + 1) + " 列");
  input.dataset.row = String(row);
  input.dataset.column = String(column);
  let composing = false;
  const commitInput = () => {
    const table = locateTable(view, root);
    if (!table) return;
    const wasFocused = document.activeElement === input;
    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;
    writeChange(view, editMarkdownTableCell(table, row, column, input.value));
    // CodeMirror may replace a block widget after an edit. Restore the cell
    // focus/caret without returning focus to the underlying Markdown source.
    if (wasFocused) queueMicrotask(() => {
      if (document.activeElement === input) return;
      const newCell = view.dom.querySelector<HTMLInputElement>(
        '.cm-note-table-widget[data-table-from="' + table.from + '"] input[data-row="' +
        row + '"][data-column="' + column + '"]',
      );
      if (newCell) {
        newCell.focus({ preventScroll: true });
        if (selectionStart !== null && selectionEnd !== null) {
          newCell.setSelectionRange(selectionStart, selectionEnd);
        }
      }
    });
  };
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; commitInput(); });
  input.addEventListener("input", () => { if (!composing) commitInput(); });
  input.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(view);
      else undo(view);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      const table = locateTable(view, root);
      if (!table) return;
      view.dispatch({
        effects: setTableSource.of(table.from),
        selection: { anchor: table.headerCells[column]?.from ?? table.from },
        scrollIntoView: true,
      });
      view.focus();
      return;
    }
    if (event.key !== "Tab" && event.key !== "Enter") return;
    event.preventDefault();
    const table = locateTable(view, root);
    if (!table) return;
    const cells = Array.from(root.querySelectorAll<HTMLInputElement>(".cm-note-table-cell-input"));
    const current = cells.indexOf(input);
    const delta = event.key === "Enter" ? table.width : event.shiftKey ? -1 : 1;
    const next = cells[current + delta];
    if (next) {
      next.focus();
      next.select();
    } else if (delta > 0) {
      writeChange(view, addMarkdownTableRow(table));
      queueMicrotask(() => {
        const newCell = view.dom.querySelector<HTMLInputElement>(
          '.cm-note-table-widget[data-table-from="' + table.from + '"] input[data-row="' +
          table.rows.length + '"][data-column="' + (event.key === "Enter" ? column : 0) + '"]',
        );
        newCell?.focus({ preventScroll: true });
      });
    } else {
      input.blur();
      view.focus();
    }
  });
  element.append(input);
  return element;
}

class MarkdownTableWidget extends WidgetType {
  constructor(readonly table: MarkdownTable, readonly sourcePreview: boolean) {
    super();
  }

  eq(other: MarkdownTableWidget) {
    return other.sourcePreview === this.sourcePreview && other.table.source === this.table.source &&
      other.table.from === this.table.from;
  }

  updateDOM(dom: HTMLElement) {
    if (!(dom instanceof HTMLDivElement)) return false;
    const inputs = dom.querySelectorAll<HTMLInputElement>(".cm-note-table-cell-input");
    const expected = (this.table.rows.length + 1) * this.table.width;
    const oldHint = Boolean(dom.querySelector(".cm-note-table-hint"));
    // A repaired malformed table must remove its recovery hint. Recreate DOM
    // when the table's structure or canonical status changes.
    if (this.sourcePreview || inputs.length !== expected || oldHint === this.table.canonical) return false;
    dom.dataset.tableFrom = String(this.table.from);
    const values = [this.table.header, ...this.table.rows].flat();
    inputs.forEach((input, index) => {
      if (input.value === values[index]) return;
      const focused = document.activeElement === input;
      const start = input.selectionStart, end = input.selectionEnd;
      input.value = values[index];
      if (focused && start !== null && end !== null) {
        input.setSelectionRange(Math.min(start, input.value.length), Math.min(end, input.value.length));
      }
    });
    return true;
  }

  toDOM(view: EditorView) {
    const root = document.createElement("div");
    root.className = "cm-note-table-widget";
    root.contentEditable = "false";
    root.dataset.tableFrom = String(this.table.from);
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", this.sourcePreview ? "Markdown 表格即时预览" : "可编辑 Markdown 表格");
    const toolbar = document.createElement("div");
    toolbar.className = "cm-note-table-tools";
    const label = document.createElement("span");
    label.textContent = this.sourcePreview ? "实时预览" : "表格";
    label.className = "cm-note-table-label";
    toolbar.append(label);
    toolbar.append(actionButton(this.sourcePreview ? "完成源码编辑" : "编辑 Markdown 源码", () => {
      const table = locateTable(view, root);
      if (!table) return;
      view.dispatch({
        effects: setTableSource.of(this.sourcePreview ? null : table.from),
        selection: { anchor: this.sourcePreview ? Math.min(view.state.doc.length, table.to + 1) :
          table.headerCells[0]?.from ?? table.from },
        scrollIntoView: true,
      });
      view.focus();
    }));
    if (!this.sourcePreview) {
      toolbar.append(actionButton("添加行", () => {
        const table = locateTable(view, root);
        if (!table) return;
        writeChange(view, addMarkdownTableRow(table));
      }));
      if (this.table.width < 20) toolbar.append(actionButton("添加列", () => {
        const table = locateTable(view, root);
        if (!table) return;
        writeChange(view, addMarkdownTableColumn(table));
      }));
    }
    const scroll = document.createElement("div");
    scroll.className = "cm-note-table-scroll";
    const tableElement = document.createElement("table");
    tableElement.className = "cm-note-table";
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    this.table.header.forEach((cell, column) => {
      const node = renderCell(view, root, -1, column, cell, this.sourcePreview);
      node.dataset.align = this.table.alignment[column] ?? "";
      headerRow.append(node);
    });
    head.append(headerRow);
    tableElement.append(head);
    const body = document.createElement("tbody");
    this.table.rows.forEach((values, row) => {
      const tr = document.createElement("tr");
      values.forEach((value, column) => {
        const node = renderCell(view, root, row, column, value, this.sourcePreview);
        node.dataset.align = this.table.alignment[column] ?? "";
        tr.append(node);
      });
      body.append(tr);
    });
    tableElement.append(body);
    scroll.append(tableElement);
    root.append(toolbar, scroll);
    if (!this.table.canonical) {
      const hint = document.createElement("span");
      hint.className = "cm-note-table-hint";
      hint.textContent = "已容错显示；修改单元格时才修复 Markdown 表格格式";
      root.append(hint);
    }
    return root;
  }

  ignoreEvent() { return true; }
}

function decorationsForTables(state: EditorState, sourceFrom: number | null): DecorationSet {
  const decorations: Array<import("@codemirror/state").Range<Decoration>> = [];
  for (const table of parseMarkdownTables(state.doc.toString())) {
    if (table.from === sourceFrom) {
      decorations.push(Decoration.widget({
        block: true, side: 1, widget: new MarkdownTableWidget(table, true),
      }).range(table.to));
    } else {
      decorations.push(Decoration.replace({
        block: true, inclusive: false, widget: new MarkdownTableWidget(table, false),
      }).range(table.from, table.to));
    }
  }
  return Decoration.set(decorations, true);
}

const markdownTableField = StateField.define<TablePreviewState>({
  create(state) {
    return { sourceFrom: null, decorations: decorationsForTables(state, null) };
  },
  update(previous, transaction) {
    let sourceFrom = previous.sourceFrom;
    if (transaction.docChanged && sourceFrom !== null) {
      sourceFrom = transaction.changes.mapPos(sourceFrom, -1);
    }
    for (const effect of transaction.effects) {
      if (effect.is(setTableSource)) sourceFrom = effect.value;
    }
    if (sourceFrom !== null && transaction.selection) {
      const table = parseMarkdownTables(transaction.state.doc.toString())
        .find(item => item.from === sourceFrom);
      const selection = transaction.state.selection.main;
      if (!table || selection.from < table.from || selection.to > table.to) sourceFrom = null;
    }
    if (!transaction.docChanged && sourceFrom === previous.sourceFrom) return previous;
    return { sourceFrom, decorations: decorationsForTables(transaction.state, sourceFrom) };
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});

/**
 * Block widgets must be supplied from a StateField: ViewPlugins are evaluated
 * after viewport layout, too late for widgets that replace multiple lines.
 */
export const markdownTablePreview: Extension = [
  markdownTableField,
  EditorView.atomicRanges.of(view => view.state.field(markdownTableField).decorations),
];
