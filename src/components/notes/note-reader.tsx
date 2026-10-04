"use client";

import { useState } from "react";
import Link from "next/link";
import { EntityMarkdown } from "@/components/links/entity-markdown";

export type NoteReaderData = {
  id: string; title: string; bodyMarkdown: string; revision: number;
  sources: { source: string; sourceUrl: string | null; savedAt: string }[];
  historyUnavailable?: boolean;
  versions: { id: string; versionNumber: number; title: string; bodyMarkdown: string }[];
};

export function NoteReader({ note }: { note: NoteReaderData }) {
  const [openVersions, setOpenVersions] = useState<Set<string>>(() => new Set());
  return <section aria-label="笔记正文" className="workspace-scroll h-full overflow-y-auto px-4 pb-24 pt-16 sm:px-8 md:pb-10 md:pt-8">
    <article className="mx-auto max-w-[748px] min-w-0">
      <nav aria-label="笔记阅读导航" className="mb-7 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--accent)]">
        <Link href="/notes" className="inline-flex min-h-11 items-center">← 笔记</Link>
        <Link href={`/notes/${note.id}`} className="inline-flex min-h-11 items-center">版本恢复与文档操作</Link>
      </nav>
      <h1 className="break-words text-2xl font-semibold tracking-tight">{note.title}</h1>
      <p className="mb-8 mt-2 text-xs text-[var(--text-tertiary)]">修订 {note.revision} · 保存内容原文</p>
      <EntityMarkdown body={note.bodyMarkdown} className="min-w-0 text-[15px] leading-7 [overflow-wrap:anywhere] [&_img]:max-w-full [&_p]:leading-7 [&_li]:leading-7" />
      {note.historyUnavailable ? <p role="status" className="mt-6 text-sm text-[var(--text-secondary)]">正文已加载；来源或历史记录暂时不可用，请稍后刷新。</p> : null}
      {note.sources.length ? <details className="mt-8 border-t border-[var(--separator)] py-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">来源与保存记录</summary>
        <ul className="space-y-3 py-2 text-sm text-[var(--text-secondary)]">{note.sources.map((source, index) => <li key={`${source.savedAt}-${index}`}>
          <span>{source.source} · {source.savedAt.slice(0, 10)}</span>
          {source.sourceUrl && /^https?:\/\//i.test(source.sourceUrl) ? <a href={source.sourceUrl} target="_blank" rel="noreferrer noopener" className="ml-3 inline-flex min-h-11 items-center text-[var(--accent)]">查看原始来源</a> : null}
        </li>)}</ul>
        <p className="text-xs leading-5 text-[var(--text-tertiary)]">来源记录说明内容从哪里保存，不代表其中的事实已经核验。</p>
      </details> : null}
      {note.versions.length ? <details className="mt-3 border-t border-[var(--separator)] py-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">历史快照（{note.versions.length}）</summary>
        {note.versions.map((version) => <details key={version.id} onToggle={(event) => { const open = event.currentTarget.open; setOpenVersions((previous) => { const next = new Set(previous); if (open) next.add(version.id); else next.delete(version.id); return next; }); }} className="border-t border-[var(--separator)] py-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm">V{version.versionNumber} · {version.title}</summary>
          {openVersions.has(version.id) ? <EntityMarkdown body={version.bodyMarkdown} className="min-w-0 py-4 text-sm [overflow-wrap:anywhere]" /> : null}
        </details>)}
      </details> : null}
    </article>
  </section>;
}
