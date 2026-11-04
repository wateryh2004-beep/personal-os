import { redo, undo } from "@codemirror/commands";
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import {
  addMarkdownTableColumn,
  addMarkdownTableRow,
  alignMarkdownTableColumn,
  editMarkdownTableCell,
  markdownTableAsTsv,
  pasteSpreadsheetIntoTable,
  parseMarkdownTables,
  removeMarkdownTableColumn,
  removeMarkdownTableRow,
  type MarkdownTable,
  type TableChange,
} from "./markdown-table";
import { updateMarkdownTableCache } from "./markdown-table-cache";

const setTableSource = StateEffect.define<number | null>();

type TablePreviewState = { decorations: DecorationSet; tables: MarkdownTable[]; sourceFrom: number | null };

function locateTable(view: EditorView, root: HTMLElement): MarkdownTable | undefined {
  const start = Number(root.dataset.tableFrom);
  return view.state.field(markdownTableField).tables.find(table => table.from === start);
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
    // Browser IME can emit both compositionend and a trailing input event.
    // A no-op must not create another CodeMirror undo step or reset the caret.
    const currentValue = row === -1 ? table.header[column] : table.rows[row]?.[column];
    if (currentValue === input.value) return;
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
  input.addEventListener("paste", event => {
    const plain = event.clipboardData?.getData("text/plain") ?? "";
    if (!plain.includes("\t")) return;
    const table = locateTable(view, root);
    if (!table) return;
    const change = pasteSpreadsheetIntoTable(table, row, column, plain);
    if (!change) return; // Normal text paste remains editable.
    event.preventDefault();
    writeChange(view, change);
    requestAnimationFrame(() => {
      const cell = view.dom.querySelector<HTMLInputElement>(
        '.cm-note-table-widget[data-table-from="' + table.from + '"] input[data-row="' +
        row + '"][data-column="' + column + '"]',
      );
      cell?.focus({ preventScroll: true });
    });
  });
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; commitInput(); });
  input.addEventListener("input", () => { if (!composing) commitInput(); });
  input.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "z" || (!event.metaKey && event.key.toLowerCase() === "y"))) {
      event.preventDefault();
      const caret = input.selectionStart;
      const isRedo = event.shiftKey || event.key.toLowerCase() === "y";
      const changed = isRedo ? redo(view) : undo(view);
      if (changed) requestAnimationFrame(() => {
        if (!view.dom.isConnected) return;
        const next = view.dom.querySelector<HTMLInputElement>(
          '.cm-note-table-widget[data-table-from="' + root.dataset.tableFrom + '"] input[data-row="' +
          row + '"][data-column="' + column + '"]',
        );
        if (next) {
          next.focus({ preventScroll: true });
          if (caret !== null) next.setSelectionRange(Math.min(caret, next.value.length), Math.min(caret, next.value.length));
        } else view.focus();
      });
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
      requestAnimationFrame(() => {
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
    dom.querySelectorAll<HTMLSelectElement>(".cm-note-table-align").forEach((select, column) => {
      select.value = this.table.alignment[column] ?? "";
    });
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
      toolbar.append(actionButton("删除末行", () => {
        const table = locateTable(view, root);
        if (!table) return;
        const change = removeMarkdownTableRow(table, table.rows.length - 1);
        if (change) writeChange(view, change);
      }));
      if (this.table.width < 20) toolbar.append(actionButton("添加列", () => {
        const table = locateTable(view, root);
        if (!table) return;
        writeChange(view, addMarkdownTableColumn(table));
      }));
      if (this.table.width > 1) toolbar.append(actionButton("删除末列", () => {
        const table = locateTable(view, root);
        if (!table) return;
        const change = removeMarkdownTableColumn(table, table.width - 1);
        if (change) writeChange(view, change);
      }));
      toolbar.append(actionButton("复制 TSV", () => {
        const table = locateTable(view, root);
        if (!table) return;
        const plain = markdownTableAsTsv(table);
        const copy = async () => {
          if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(plain); return; }
          const field = document.createElement("textarea");
          field.value = plain; field.style.position = "fixed"; field.style.opacity = "0";
          document.body.append(field); field.select();
          const ok = document.execCommand("copy"); field.remove();
          if (!ok) throw new Error("clipboard_unavailable");
        };
        void copy().then(() => { label.textContent = "已复制 TSV"; }).catch(() => {
          label.textContent = "复制失败，请重试";
        });
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
      if (!this.sourcePreview) {
        const select = document.createElement("select");
        select.className = "cm-note-table-align";
        select.setAttribute("aria-label", "第 " + (column + 1) + " 列对齐");
        for (const [value, label] of [["", "默认对齐"], ["left", "左对齐"], ["center", "居中"], ["right", "右对齐"]]) {
          const option = document.createElement("option");
          option.value = value; option.textContent = label; select.append(option);
        }
        select.value = this.table.alignment[column] ?? "";
        select.addEventListener("change", () => {
          const table = locateTable(view, root);
          if (!table) return;
          const change = alignMarkdownTableColumn(table, column, select.value as "" | "left" | "center" | "right" || null);
          if (change) writeChange(view, change);
        });
        node.append(select);
      }
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

function validTableContext(state: EditorState, from: number): boolean {
  let node = syntaxTree(state).resolveInner(from, 1);
  while (node) {
    if (["FencedCode", "CodeBlock", "HTMLBlock", "Blockquote", "ListItem"].includes(node.name)) return false;
    node = node.parent;
  }
  return true;
}

function decorationsForTables(tables: MarkdownTable[], sourceFrom: number | null): DecorationSet {
  const decorations: Array<import("@codemirror/state").Range<Decoration>> = [];
  for (const table of tables) {
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
    const tables = parseMarkdownTables(state.doc.toString()).filter(table => validTableContext(state, table.from));
    return { tables, sourceFrom: null, decorations: decorationsForTables(tables, null) };
  },
  update(previous, transaction) {
    let sourceFrom = previous.sourceFrom;
    if (transaction.docChanged && sourceFrom !== null) {
      sourceFrom = transaction.changes.mapPos(sourceFrom, -1);
    }
    for (const effect of transaction.effects) {
      if (effect.is(setTableSource)) sourceFrom = effect.value;
    }
    const tables = transaction.docChanged
      ? updateMarkdownTableCache(previous.tables, transaction.changes, transaction.state.doc).tables
        .filter(table => validTableContext(transaction.state, table.from))
      : previous.tables;
    if (sourceFrom !== null && transaction.selection) {
      const table = tables.find(item => item.from === sourceFrom);
      const selection = transaction.state.selection.main;
      if (!table || selection.from < table.from || selection.to > table.to) sourceFrom = null;
    }
    if (!transaction.docChanged && sourceFrom === previous.sourceFrom) return previous;
    return { tables, sourceFrom, decorations: decorationsForTables(tables, sourceFrom) };
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
