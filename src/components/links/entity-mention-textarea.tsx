"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EntityLinkSuggestion } from "@/features/links/types";

const entityTypeLabels: Record<string, string> = {
  note: "笔记",
  todo_task: "任务",
  calendar_event: "日程",
  document: "文件",
};

const pickerEntityTypes = ["note", "todo_task", "calendar_event", "document"];

async function searchEntities(query: string, signal: AbortSignal): Promise<EntityLinkSuggestion[]> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`, {
    signal,
    credentials: "same-origin",
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    results?: Array<{ entityType: string; entityId: string; title: string; href: string }>;
  };
  return (data.results ?? [])
    .filter((item) => pickerEntityTypes.includes(item.entityType))
    .map((item) => ({
      id: item.entityId,
      title: item.title,
      href: item.href,
      label: entityTypeLabels[item.entityType] ?? "引用",
    }));
}

type MentionState = {
  start: number;
  caret: number;
  query: string;
  top: number;
  left: number;
  suggestions: EntityLinkSuggestion[];
  activeIndex: number;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
};

/**
 * 带 @ 实体提及的受控 textarea。
 * 输入 @ 后弹出实体选择器(复用全局搜索),回车/点击落成 [标题](/type/id) markdown 链接。
 * 仍保留原生 name,可继续用于 server action 表单提交。
 */
export function MentionTextarea(props: Props) {
  const { value, onChange, name, placeholder, rows = 4, maxLength, className, autoFocus, onBlur } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const sequenceRef = useRef(0);

  const caretPosition = useCallback(
    (atIndex: number) => {
      const textarea = textareaRef.current;
      if (!textarea) return { top: 0, left: 0 };
      const rect = textarea.getBoundingClientRect();
      const style = window.getComputedStyle(textarea);
      const probe = document.createElement("div");
      probe.style.cssText = `position:fixed;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;top:-9999px;left:-9999px;font:${style.font};letter-spacing:${style.letterSpacing};line-height:${style.lineHeight};padding:${style.padding};border:${style.border};width:${textarea.clientWidth}px;`;
      probe.textContent = value.slice(0, atIndex).replace(/\n/g, "​\n");
      document.body.appendChild(probe);
      const probeRect = probe.getBoundingClientRect();
      document.body.removeChild(probe);
      const lineHeight = Number.parseFloat(style.lineHeight) || 20;
      return {
        left: rect.left + Math.min(probeRect.width, textarea.clientWidth - 40),
        top: rect.top + probeRect.height + lineHeight,
      };
    },
    [value],
  );

  const updateMention = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const caret = textarea.selectionStart;
    const text = textarea.value;
    const beforeCursor = text.slice(0, caret);
    const lastAt = beforeCursor.lastIndexOf("@");
    if (lastAt < 0) {
      setMention(null);
      return;
    }
    // @ 前是普通字符(如邮箱 foo@bar)不触发;@ 后出现空白或换行即结束。
    const beforeAt = beforeCursor[lastAt - 1];
    if (beforeAt && /[A-Za-z0-9_.-]/.test(beforeAt)) {
      setMention(null);
      return;
    }
    const tail = beforeCursor.slice(lastAt + 1);
    if (/[\s\n]/.test(tail) || tail.length > 40) {
      setMention(null);
      return;
    }
    if (!tail.trim()) {
      setMention(null);
      return;
    }
    const position = caretPosition(lastAt);
    setMention((current) =>
      current && current.start === lastAt
        ? { ...current, caret, query: tail, top: position.top, left: position.left }
        : { start: lastAt, caret, query: tail, top: position.top, left: position.left, suggestions: [], activeIndex: 0 },
    );
  }, [caretPosition]);

  // query 变化时远程搜索。
  useEffect(() => {
    if (!mention || !mention.query.trim()) return;
    const controller = new AbortController();
    const sequence = ++sequenceRef.current;
    const timer = window.setTimeout(async () => {
      const suggestions = await searchEntities(mention.query, controller.signal).catch(() => []);
      if (sequence === sequenceRef.current) {
        setMention((current) => (current ? { ...current, suggestions, activeIndex: 0 } : current));
      }
    }, 140);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mention?.query, mention?.start]);

  // 点击弹窗外关闭。
  useEffect(() => {
    if (!mention) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-mention-popup]")) return;
      if (textareaRef.current?.contains(target)) return;
      setMention(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [mention]);

  const insert = useCallback(
    (suggestion: EntityLinkSuggestion) => {
      const textarea = textareaRef.current;
      if (!textarea || !mention) return;
      const insertText = `[${suggestion.title}](${suggestion.href})`;
      const next = value.slice(0, mention.start) + insertText + value.slice(mention.caret);
      onChange(next);
      setMention(null);
      const caret = mention.start + insertText.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
    },
    [mention, onChange, value],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mention) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
      if (mention.suggestions.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMention((current) => (current ? { ...current, activeIndex: (current.activeIndex + 1) % current.suggestions.length } : current));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMention((current) => (current ? { ...current, activeIndex: (current.activeIndex - 1 + current.suggestions.length) % current.suggestions.length } : current));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const suggestion = mention.suggestions[mention.activeIndex];
        if (suggestion) {
          event.preventDefault();
          insert(suggestion);
        }
      }
    },
    [insert, mention],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.target.value);
      updateMention();
    },
    [onChange, updateMention],
  );

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        name={name}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={updateMention}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={className}
        autoFocus={autoFocus}
      />
      {mention && mention.suggestions.length > 0 ? (
        <div
          data-mention-popup
          className="fixed z-40 w-72 overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white py-1 text-sm shadow-lg"
          style={{ top: mention.top, left: mention.left }}
        >
          {mention.suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.id}-${suggestion.href}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(suggestion)}
              onMouseEnter={() => setMention((current) => (current ? { ...current, activeIndex: index } : current))}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${index === mention.activeIndex ? "bg-[var(--surface-selected)]" : ""}`}
            >
              <span className="shrink-0 rounded bg-[var(--surface-hover)] px-1 py-0.5 text-[10px] text-[var(--text-tertiary)]">{suggestion.label}</span>
              <span className="truncate">{suggestion.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
