"use client";

import { useState } from "react";
import { Check, Copy, LoaderCircle } from "lucide-react";
import { copyReferenceText, noteReferenceMarkdown } from "@/features/notes/links/reference";

export function CopyNoteReference({ title, href, showLabel = false }: { title: string; href: string; showLabel?: boolean }) {
  const target = `${href}:${title}`;
  const [result, setResult] = useState<{ target: string; state: "copying" | "copied" | "error" } | null>(null);
  const state = result?.target === target ? result.state : "idle";
  const copy = async () => {
    setResult({ target, state: "copying" });
    try {
      await copyReferenceText(noteReferenceMarkdown(title, href));
      setResult({ target, state: "copied" });
    } catch {
      setResult({ target, state: "error" });
    }
  };
  return <span className="inline-flex shrink-0 flex-col items-end">
    <button
      type="button"
      disabled={state === "copying"}
      onClick={() => void copy()}
      aria-label={`复制引用：${title || "无标题笔记"}`}
      title="复制 Markdown 引用，粘贴到笔记、任务或日程"
      className="pressable inline-flex min-h-8 items-center justify-center gap-1 rounded-[7px] px-2 text-[10.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] disabled:opacity-50"
    >
      {state === "copying" ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : state === "copied" ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
      {showLabel ? <span>{state === "copied" ? "已复制引用" : "复制引用"}</span> : null}
    </button>
    {state === "copied" ? <span role="status" className="sr-only">已复制引用，可粘贴到笔记、任务或日程</span> : null}
    {state === "error" ? <span role="alert" className="max-w-36 text-[10px] text-[var(--danger)]">复制失败，请重试或检查浏览器权限</span> : null}
  </span>;
}
