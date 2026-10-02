"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowUpRight, BookOpen, FileText } from "lucide-react";
import { CAREER_CONTINUE_KEY } from "@/components/career/career-continue";
import { lastOpenedNoteSessionKey, recentNoteHref } from "@/features/notes/navigation";
import { loadWorkspaceSession } from "@/lib/workspace-session";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

function getSnapshot() {
  const noteHref = recentNoteHref(loadWorkspaceSession(lastOpenedNoteSessionKey));
  const interview = loadWorkspaceSession<{ href?: string; label?: string }>(CAREER_CONTINUE_KEY);
  const career = interview?.href?.startsWith("/career/interview?") && interview.label
    ? { href: interview.href, label: interview.label }
    : null;
  return JSON.stringify({ noteHref: noteHref === "/notes" ? null : noteHref, career });
}

export function TodayContinue() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "null");
  const recent = JSON.parse(snapshot) as { noteHref: string | null; career: { href: string; label: string } | null } | null;
  if (!recent?.noteHref && !recent?.career) return null;
  return <nav aria-label="继续工作" className="today-continue mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--separator)] pt-3 text-[13px]">
    <span className="text-[12px] text-[var(--text-secondary)]">继续工作</span>
    {recent.noteHref ? <Link href={recent.noteHref} className="inline-flex min-h-11 items-center gap-1.5 text-[var(--accent)] hover:underline"><FileText className="size-3.5" aria-hidden="true" />最近笔记<ArrowUpRight className="size-3" aria-hidden="true" /></Link> : null}
    {recent.career ? <Link href={recent.career.href} title={recent.career.label} className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 text-[var(--accent)] hover:underline"><BookOpen className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">面试准备 · {recent.career.label}</span><ArrowUpRight className="size-3 shrink-0" aria-hidden="true" /></Link> : null}
  </nav>;
}
