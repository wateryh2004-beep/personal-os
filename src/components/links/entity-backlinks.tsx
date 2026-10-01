"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EntityBacklink } from "@/features/links/queries";
import { publishAssistantContext } from "@/features/assistant/client-context";
import { CopyNoteReference } from "@/components/notes/copy-note-reference";

/**
 * 跨实体“被引用”面板:拉取 entity_links 的 reference 入链并渲染为可跳转列表。
 * 挂载到笔记详情、日程详情、任务详情;无引用时渲染空。
 */
export function EntityBacklinks({ type, id }: { type: string; id: string }) {
  const [result, setResult] = useState<{ key: string; backlinks: EntityBacklink[]; unavailable: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${type}:${id}:${attempt}`;

  useEffect(() => {
    if (type !== "calendar_event" && type !== "todo_task") return;
    const surface = type === "calendar_event" ? "calendar" : "tasks";
    publishAssistantContext({ surface, entity: { type, id } });
    return () => publishAssistantContext({ surface, entity: null });
  }, [id, type]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/links/backlinks?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("backlinks_unavailable");
        return response.json();
      })
      .then((data: { backlinks?: EntityBacklink[]; unavailable?: boolean }) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, backlinks: data.backlinks ?? [], unavailable: Boolean(data.unavailable) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key: requestKey, backlinks: [], unavailable: true });
      });
    return () => controller.abort();
  }, [type, id, requestKey]);

  // type/id 变化瞬间旧结果与当前实体错配，视为加载态，避免旧数据闪现。
  const currentResult = result?.key === requestKey ? result : null;
  if (!currentResult) return <p role="status" className="mt-5 text-[10.5px] text-[var(--text-tertiary)]">正在读取跨模块引用…</p>;
  if (currentResult.unavailable) return <div role="status" className="mt-5 text-[11px] text-[var(--text-secondary)]">
    <p>跨模块引用暂时无法读取，已有内容不受影响。</p>
    <button type="button" onClick={() => setAttempt((value) => value + 1)} className="pressable mt-1 min-h-8 rounded-[7px] px-2 text-[var(--accent)] hover:bg-[var(--surface-hover)]">重新读取引用</button>
  </div>;
  const backlinks = currentResult.backlinks;
  if (!backlinks.length) return null;

  return (
    <section className="mt-7">
      <h2 className="text-xs font-medium text-[var(--text-tertiary)]">跨模块引用 · {backlinks.length}</h2>
      <div className="mt-2 space-y-1.5 text-sm">
        {backlinks.map((link) => (
          <div key={`${link.sourceType}:${link.sourceId}`} className="flex min-w-0 items-center gap-1">
          <Link
            href={link.href}
            className="flex min-w-0 flex-1 items-baseline gap-2 text-[var(--accent)] hover:underline"
            title={link.title}
          >
            <span className="shrink-0 rounded bg-[var(--surface-hover)] px-1 py-0.5 text-[10px] text-[var(--text-tertiary)]">{link.label}</span>
            <span className="truncate">{link.title}</span>
          </Link>
          <CopyNoteReference title={link.title} href={link.href} />
          </div>
        ))}
      </div>
    </section>
  );
}
