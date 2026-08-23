"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EntityBacklink } from "@/features/links/queries";
import { publishAssistantContext } from "@/features/assistant/client-context";

/**
 * 跨实体“被引用”面板:拉取 entity_links 的 reference 入链并渲染为可跳转列表。
 * 挂载到笔记详情、日程详情、任务详情;无引用时渲染空。
 */
export function EntityBacklinks({ type, id }: { type: string; id: string }) {
  const [result, setResult] = useState<{ backlinks: EntityBacklink[]; unavailable: boolean } | null>(null);

  useEffect(() => {
    if (type !== "calendar_event" && type !== "todo_task") return;
    const surface = type === "calendar_event" ? "calendar" : "tasks";
    publishAssistantContext({ surface, entity: { type, id } });
    return () => publishAssistantContext({ surface, entity: null });
  }, [id, type]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/links/backlinks?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((response) => response.json())
      .then((data: { backlinks?: EntityBacklink[]; unavailable?: boolean }) => {
        if (cancelled) return;
        setResult({ backlinks: data.backlinks ?? [], unavailable: Boolean(data.unavailable) });
      })
      .catch(() => {
        if (!cancelled) setResult({ backlinks: [], unavailable: true });
      });
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  // type/id 变化瞬间旧结果与当前实体错配，视为加载态，避免旧数据闪现。
  const backlinks = result ? result.backlinks : null;
  const unavailable = result ? result.unavailable : false;
  if (unavailable || backlinks === null || backlinks.length === 0) return null;

  return (
    <section className="mt-7">
      <h2 className="text-xs font-medium text-[var(--text-tertiary)]">被引用</h2>
      <div className="mt-2 space-y-1.5 text-sm">
        {backlinks.map((link) => (
          <Link
            key={`${link.sourceType}:${link.sourceId}`}
            href={link.href}
            className="flex items-baseline gap-2 text-[var(--accent)] hover:underline"
            title={link.title}
          >
            <span className="shrink-0 rounded bg-[var(--surface-hover)] px-1 py-0.5 text-[10px] text-[var(--text-tertiary)]">{link.label}</span>
            <span className="truncate">{link.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
