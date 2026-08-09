"use client";

import { useRef } from "react";
import type { StateCommand } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import {
  Bold,
  Code2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Redo2,
  Sparkles,
  Table2,
  Undo2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createMarkdownLink,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleHeading,
  toggleInlineCode,
  toggleItalic,
  toggleOrderedList,
  toggleTaskList,
} from "./markdown-commands";
import { parseMarkdownListLine } from "./markdown-list";

type ToolbarState = {
  heading: number;
  quote: boolean;
  bold: boolean;
  italic: boolean;
  inlineCode: boolean;
  link: boolean;
  list: "ordered" | "bullet" | "task" | null;
};

function stateAtSelection(view: EditorView | null): ToolbarState {
  if (!view)
    return { heading: 0, quote: false, bold: false, italic: false, inlineCode: false, link: false, list: null };
  const main = view.state.selection.main;
  const line = view.state.doc.lineAt(main.head);
  const list = parseMarkdownListLine(line.text)?.kind ?? null;
  const heading = Number(/^\s*(#{1,4})\s/.exec(line.text)?.[1].length ?? 0);
  let node = syntaxTree(view.state).resolveInner(main.head, -1);
  const names = new Set<string>();
  while (node) {
    names.add(node.name);
    if (!node.parent) break;
    node = node.parent;
  }
  return {
    heading,
    quote: /^\s*>\s?/.test(line.text),
    bold: names.has("StrongEmphasis"),
    italic: names.has("Emphasis"),
    inlineCode: names.has("InlineCode"),
    link: names.has("Link"),
    list,
  };
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active || undefined}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-35 ${active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function MarkdownToolbar({
  view,
  stateVersion,
  onPickImage,
  onInsertTable,
  onOpenAi,
}: {
  view: EditorView | null;
  stateVersion: number;
  onPickImage: (file: File) => void;
  onInsertTable: () => void;
  onOpenAi?: () => void;
}) {
  void stateVersion;
  const fileRef = useRef<HTMLInputElement>(null);
  const active = stateAtSelection(view);
  const run = (command: StateCommand) => {
    if (!view) return;
    command(view);
    view.focus();
  };
  const block = active.heading ? `h${active.heading}` : active.quote ? "quote" : "paragraph";
  return (
    <div className="life-markdown-toolbar" role="toolbar" aria-label="Markdown 格式工具">
      <div className="flex min-w-max items-center gap-0.5">
        <ToolbarButton label="撤销（⌘Z）" disabled={!view} onClick={() => run(undo)}><Undo2 className="size-4" /></ToolbarButton>
        <ToolbarButton label="重做（⇧⌘Z）" disabled={!view} onClick={() => run(redo)}><Redo2 className="size-4" /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
        <label className="sr-only" htmlFor="markdown-block-style">块样式</label>
        <select
          id="markdown-block-style"
          aria-label="块样式"
          value={block}
          disabled={!view}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "quote") run(toggleBlockquote);
            else if (value === "code") run(toggleCodeBlock);
            else if (/^h[1-4]$/.test(value)) run(toggleHeading(Number(value.slice(1)) as 1 | 2 | 3 | 4));
            else if (active.heading) run(toggleHeading(active.heading as 1 | 2 | 3 | 4));
            else if (active.quote) run(toggleBlockquote);
          }}
          className="h-8 rounded-[var(--radius-sm)] border-0 bg-transparent px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus:outline-none"
        >
          <option value="paragraph">正文</option>
          <option value="h1">标题 1</option>
          <option value="h2">标题 2</option>
          <option value="h3">标题 3</option>
          <option value="h4">标题 4</option>
          <option value="quote">引用</option>
          <option value="code">代码块</option>
        </select>
        <span className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
        <ToolbarButton label="粗体（⌘B）" active={active.bold} disabled={!view} onClick={() => run(toggleBold)}><Bold className="size-4" /></ToolbarButton>
        <ToolbarButton label="斜体（⌘I）" active={active.italic} disabled={!view} onClick={() => run(toggleItalic)}><Italic className="size-4" /></ToolbarButton>
        <ToolbarButton label="行内代码" active={active.inlineCode} disabled={!view} onClick={() => run(toggleInlineCode)}><Code2 className="size-4" /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
        <ToolbarButton label="无序列表" active={active.list === "bullet"} disabled={!view} onClick={() => run(toggleBulletList)}><List className="size-4" /></ToolbarButton>
        <ToolbarButton label="有序列表" active={active.list === "ordered"} disabled={!view} onClick={() => run(toggleOrderedList)}><ListOrdered className="size-4" /></ToolbarButton>
        <ToolbarButton label="任务列表" active={active.list === "task"} disabled={!view} onClick={() => run(toggleTaskList)}><ListTodo className="size-4" /></ToolbarButton>
        <ToolbarButton label="链接（⌘K）" active={active.link} disabled={!view} onClick={() => run(createMarkdownLink)}><Link2 className="size-4" /></ToolbarButton>
        <ToolbarButton label="引用" active={active.quote} disabled={!view} onClick={() => run(toggleBlockquote)}><Quote className="size-4" /></ToolbarButton>
        <ToolbarButton label="插入图片" disabled={!view} onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /></ToolbarButton>
        <ToolbarButton label="插入表格" disabled={!view} onClick={() => { onInsertTable(); view?.focus(); }}><Table2 className="size-4" /></ToolbarButton>
      </div>
      <span className="min-w-3 flex-1" />
      <ToolbarButton label="AI" disabled={!view} onClick={() => { onOpenAi?.(); view?.focus(); }}><Sparkles className="size-4" /></ToolbarButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPickImage(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
