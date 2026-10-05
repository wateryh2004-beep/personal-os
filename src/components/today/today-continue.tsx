"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowUpRight } from "lucide-react";
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
  return <nav aria-label="继续工作" className="today-continue">
    <span>继续上次</span>
    {recent.noteHref ? <Link href={recent.noteHref} className="ui-link"><span className="today-continue-title">最近笔记</span><ArrowUpRight className="size-3.5" aria-hidden="true" /></Link> : null}
    {recent.career ? <Link href={recent.career.href} className="ui-link"><span className="today-continue-title">{recent.career.label}</span><ArrowUpRight className="size-3.5" aria-hidden="true" /></Link> : null}
  </nav>;
}
