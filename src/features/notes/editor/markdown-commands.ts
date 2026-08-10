import {
  EditorSelection,
  type ChangeSpec,
  type StateCommand,
  type Text,
  type TransactionSpec,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
} from "@codemirror/lang-markdown";
import {
  lineNumberAt,
  listPrefix,
  listSubtreeEndLine,
  markdownListIndent,
  parentListItem,
  parseMarkdownListLine,
  previousListSibling,
  renumberNearLines,
  renumberOrderedListAt,
  selectedLineNumbers,
  type MarkdownListKind,
} from "./markdown-list";

function markerIsMarkdown(state: Parameters<StateCommand>[0]["state"], lineFrom: number, markerOffset: number) {
  let node = syntaxTree(state).resolveInner(lineFrom + markerOffset, 1);
  while (node) {
    if (node.name === "ListItem") return true;
    if (node.name === "FencedCode" || node.name === "CodeBlock") return false;
    if (!node.parent) break;
    node = node.parent;
  }
  return false;
}

function dispatchSequential(
  target: Parameters<StateCommand>[0],
  primary: TransactionSpec,
  secondaryChanges: ChangeSpec[],
) {
  const transaction = secondaryChanges.length
    ? target.state.update(primary, {
        changes: secondaryChanges,
        sequential: true,
      })
    : target.state.update(primary);
  target.dispatch(transaction);
}

function uniqueChanges(changes: ChangeSpec[]) {
  const map = new Map<string, ChangeSpec>();
  for (const change of changes) {
    const value = change as { from: number; to?: number };
    map.set(`${value.from}:${value.to ?? value.from}`, change);
  }
  return [...map.values()].sort(
    (left, right) =>
      (left as { from: number }).from - (right as { from: number }).from,
  );
}

export const continueMarkdownList: StateCommand = (target) => {
  const { state } = target;
  const selection = state.selection.main;
  if (!selection.empty) return false;
  const line = state.doc.lineAt(selection.head);
  const context = parseMarkdownListLine(line.text);
  if (
    !context ||
    !markerIsMarkdown(state, line.from, context.indent.length)
  )
    return insertNewlineContinueMarkup(target);

  if (!context.content.trim()) {
    const parent = parentListItem(state.doc, line.number, context.indentWidth);
    if (!parent) {
      target.dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: "" },
          selection: { anchor: line.from },
          scrollIntoView: true,
          userEvent: "input",
        }),
      );
      return true;
    }
    const prefix = listPrefix(parent.context, {
      number:
        parent.context.kind === "ordered"
          ? (parent.context.number ?? 1) + 1
          : undefined,
      uncheckedTask: true,
    });
    const interim = state.update({
      changes: { from: line.from, to: line.to, insert: prefix },
      selection: { anchor: line.from + prefix.length },
      scrollIntoView: true,
      userEvent: "input",
    });
    const renumber = renumberOrderedListAt(
      interim.newDoc,
      line.number,
      parent.context.kind === "ordered"
        ? (parent.context.number ?? 1) + 1
        : undefined,
    );
    dispatchSequential(
      target,
      {
        changes: { from: line.from, to: line.to, insert: prefix },
        selection: { anchor: line.from + prefix.length },
        scrollIntoView: true,
        userEvent: "input",
      },
      renumber,
    );
    return true;
  }

  const nextPrefix = listPrefix(context, {
    number:
      context.kind === "ordered" ? (context.number ?? 1) + 1 : undefined,
    uncheckedTask: true,
  });
  const inserted = `\n${nextPrefix}`;
  const primary = {
    changes: { from: selection.head, insert: inserted },
    selection: { anchor: selection.head + inserted.length },
    scrollIntoView: true,
    userEvent: "input",
  } as const;
  const interim = state.update(primary);
  const newLine = interim.newDoc.lineAt(selection.head + inserted.length);
  dispatchSequential(
    target,
    primary,
    renumberOrderedListAt(interim.newDoc, newLine.number),
  );
  return true;
};

export const deleteMarkdownListMarkupBackward: StateCommand = (target) => {
  const { state } = target;
  const selection = state.selection.main;
  if (!selection.empty) return false;
  const line = state.doc.lineAt(selection.head);
  const context = parseMarkdownListLine(line.text);
  if (!context) return deleteMarkupBackward(target);
  const contentPosition = line.from + context.contentStart;
  if (
    selection.head !== contentPosition ||
    !markerIsMarkdown(state, line.from, context.indent.length)
  )
    return deleteMarkupBackward(target);
  target.dispatch(
    state.update({
      changes: { from: line.from, to: contentPosition, insert: "" },
      selection: { anchor: line.from },
      scrollIntoView: true,
      userEvent: "delete.backward",
    }),
  );
  return true;
};

export const deleteSelectedListItems: StateCommand = (target) => {
  const { state } = target;
  const selection = state.selection.main;
  if (selection.empty) return false;
  const first = state.doc.lineAt(selection.from);
  const selected = state.doc.sliceString(selection.from, selection.to);
  if (!selected.includes("\n") || selection.from > first.from) return false;
  const lineNumbers = selectedLineNumbers(
    state.doc,
    selection.from,
    selection.to,
  );
  if (
    !lineNumbers.some((number) =>
      Boolean(parseMarkdownListLine(state.doc.line(number).text)),
    )
  )
    return false;
  const primary = {
    changes: { from: selection.from, to: selection.to, insert: "" },
    selection: { anchor: selection.from },
    scrollIntoView: true,
    userEvent: "delete.selection",
  } as const;
  const interim = state.update(primary);
  const anchorLine = lineNumberAt(interim.newDoc, selection.from);
  dispatchSequential(
    target,
    primary,
    renumberNearLines(interim.newDoc, [anchorLine]),
  );
  return true;
};

function listLinesForIndent(state: Parameters<StateCommand>[0]["state"]) {
  const selection = state.selection.main;
  const selected = selectedLineNumbers(state.doc, selection.from, selection.to);
  if (!selection.empty) return selected;
  const start = selected[0];
  const end = listSubtreeEndLine(state.doc, start);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function changeListIndent(target: Parameters<StateCommand>[0], direction: "in" | "out") {
  const { state } = target;
  const lines = listLinesForIndent(state);
  const firstLine = state.doc.line(lines[0]);
  const firstContext = parseMarkdownListLine(firstLine.text);
  if (
    !firstContext ||
    !markerIsMarkdown(state, firstLine.from, firstContext.indent.length)
  )
    return false;
  if (
    direction === "in" &&
    !previousListSibling(state.doc, firstLine.number, firstContext)
  )
    return true;
  if (direction === "out" && firstContext.indentWidth === 0) return true;

  const changes: ChangeSpec[] = lines.map((number) => {
    const line = state.doc.line(number);
    if (direction === "in") return { from: line.from, insert: markdownListIndent };
    const removable = line.text.startsWith("\t")
      ? 1
      : Math.min(markdownListIndent.length, /^ */.exec(line.text)?.[0].length ?? 0);
    return { from: line.from, to: line.from + removable, insert: "" };
  });
  const primary = {
    changes,
    scrollIntoView: true,
    userEvent: "input.indent",
  } as const;
  const interim = state.update(primary);
  const movedLine = interim.newDoc.line(firstLine.number);
  const moved = parseMarkdownListLine(movedLine.text);
  const renumber: ChangeSpec[] = renumberNearLines(interim.newDoc, [
    firstLine.number - 1,
    firstLine.number,
    lines.at(-1) ?? firstLine.number,
  ]);
  if (moved?.kind === "ordered") {
    const previous = previousListSibling(
      interim.newDoc,
      movedLine.number,
      moved,
    );
    const expected =
      previous?.context.kind === "ordered"
        ? (previous.context.number ?? 1) + 1
        : 1;
    renumber.push(
      ...renumberOrderedListAt(interim.newDoc, movedLine.number, expected),
    );
  }
  dispatchSequential(target, primary, uniqueChanges(renumber));
  return true;
}

export const indentMarkdownList: StateCommand = (target) =>
  changeListIndent(target, "in");
export const outdentMarkdownList: StateCommand = (target) =>
  changeListIndent(target, "out");

function selectedLines(doc: Text, from: number, to: number) {
  return selectedLineNumbers(doc, from, to).map((number) => doc.line(number));
}

export function toggleMarkdownList(kind: MarkdownListKind): StateCommand {
  return ({ state, dispatch }) => {
    const selection = state.selection.main;
    const lines = selectedLines(state.doc, selection.from, selection.to);
    const meaningful = lines.filter((line) => line.text.trim());
    const remove =
      meaningful.length > 0 &&
      meaningful.every(
        (line) => parseMarkdownListLine(line.text)?.kind === kind,
      );
    const counters = new Map<number, number>();
    const changes: ChangeSpec[] = [];
    for (const line of lines) {
      if (!line.text.trim() && lines.length > 1) continue;
      const parsed = parseMarkdownListLine(line.text);
      const indent = parsed?.indent ?? /^\s*/.exec(line.text)?.[0] ?? "";
      const indentWidth = indent.replaceAll("\t", markdownListIndent).length;
      const content = parsed
        ? parsed.content
        : line.text.slice(indent.length);
      let replacement: string;
      if (remove) {
        replacement = `${indent}${content}`;
      } else if (kind === "ordered") {
        for (const depth of [...counters.keys()]) {
          if (depth > indentWidth) counters.delete(depth);
        }
        const number = (counters.get(indentWidth) ?? 0) + 1;
        counters.set(indentWidth, number);
        replacement = `${indent}${number}. ${content}`;
      } else if (kind === "task") {
        replacement = `${indent}- [ ] ${content}`;
      } else {
        replacement = `${indent}- ${content}`;
      }
      changes.push({ from: line.from, to: line.to, insert: replacement });
    }
    if (!changes.length) return false;
    dispatch(
      state.update({
        changes,
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  };
}

export const toggleOrderedList = toggleMarkdownList("ordered");
export const toggleBulletList = toggleMarkdownList("bullet");
export const toggleTaskList = toggleMarkdownList("task");

function toggleLinePrefix(prefix: string, pattern: RegExp): StateCommand {
  return ({ state, dispatch }) => {
    const selection = state.selection.main;
    const lines = selectedLines(state.doc, selection.from, selection.to);
    const nonBlank = lines.filter((line) => line.text.trim());
    const remove = nonBlank.length > 0 && nonBlank.every((line) => pattern.test(line.text));
    const changes = lines.flatMap((line): ChangeSpec[] => {
      if (!line.text.trim()) return [];
      const text = remove ? line.text.replace(pattern, "") : `${prefix}${line.text}`;
      return [{ from: line.from, to: line.to, insert: text }];
    });
    if (!changes.length) return false;
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

export const toggleBlockquote = toggleLinePrefix("> ", /^>\s?/);

export function toggleHeading(level: 1 | 2 | 3 | 4): StateCommand {
  return ({ state, dispatch }) => {
    const selection = state.selection.main;
    const lines = selectedLines(state.doc, selection.from, selection.to);
    const expected = `${"#".repeat(level)} `;
    const remove = lines
      .filter((line) => line.text.trim())
      .every((line) => line.text.startsWith(expected));
    const changes = lines.flatMap((line): ChangeSpec[] => {
      if (!line.text.trim()) return [];
      const withoutHeading = line.text.replace(/^#{1,6}\s+/, "");
      return [{
        from: line.from,
        to: line.to,
        insert: remove ? withoutHeading : `${expected}${withoutHeading}`,
      }];
    });
    if (!changes.length) return false;
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

export function wrapMarkdown(open: string, close = open): StateCommand {
  return ({ state, dispatch }) => {
    const spec = state.changeByRange((range) => {
      const selected = state.sliceDoc(range.from, range.to);
      if (!range.empty && selected.startsWith(open) && selected.endsWith(close)) {
        const content = selected.slice(open.length, selected.length - close.length);
        return {
          changes: { from: range.from, to: range.to, insert: content },
          range: EditorSelection.range(range.from, range.from + content.length),
        };
      }
      const insert = `${open}${selected}${close}`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: range.empty
          ? EditorSelection.cursor(range.from + open.length)
          : EditorSelection.range(
              range.from + open.length,
              range.from + open.length + selected.length,
            ),
      };
    });
    dispatch(state.update(spec, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

export const toggleBold = wrapMarkdown("**");
export const toggleItalic = wrapMarkdown("*");
export const toggleInlineCode = wrapMarkdown("`");
export const toggleStrikethrough = wrapMarkdown("~~");

export const createMarkdownLink: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);
  const insert = `[${selected}]()`;
  dispatch(
    state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: {
        anchor: range.from + selected.length + 3,
      },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

export const toggleCodeBlock: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  let node = syntaxTree(state).resolveInner(range.head, -1);
  while (node.name !== "FencedCode" && node.parent) node = node.parent;
  if (node.name === "FencedCode" && range.from >= node.from && range.to <= node.to) {
    const block = state.sliceDoc(node.from, node.to);
    const match = /^```[^\n]*\n([\s\S]*?)\n```[ \t]*$/.exec(block);
    if (match) {
      const content = match[1];
      const openingLength = block.indexOf("\n") + 1;
      const relativeAnchor = Math.max(
        0,
        Math.min(content.length, range.anchor - node.from - openingLength),
      );
      const relativeHead = Math.max(
        0,
        Math.min(content.length, range.head - node.from - openingLength),
      );
      dispatch(
        state.update({
          changes: { from: node.from, to: node.to, insert: content },
          selection: {
            anchor: node.from + relativeAnchor,
            head: node.from + relativeHead,
          },
          scrollIntoView: true,
          userEvent: "input",
        }),
      );
      return true;
    }
  }
  const first = state.doc.lineAt(range.from);
  const last = state.doc.lineAt(range.to);
  const selected = state.sliceDoc(first.from, last.to);
  const insert = `\`\`\`\n${selected}\n\`\`\``;
  dispatch(
    state.update({
      changes: { from: first.from, to: last.to, insert },
      selection: {
        anchor: first.from + 4,
        head: first.from + 4 + selected.length,
      },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};
