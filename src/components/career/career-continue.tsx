"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { loadWorkspaceSession } from "@/lib/workspace-session";

export const CAREER_CONTINUE_KEY = "career:last-interview";
const subscribe = () => () => {};
const serverSnapshot = () => null;
function getSnapshot() {
  const value = loadWorkspaceSession<{ href?: string; label?: string }>(CAREER_CONTINUE_KEY);
  if (!value?.href?.startsWith("/career/interview?") || !value.label) return null;
  return JSON.stringify(value);
}

export function CareerContinue() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  if (!raw) return null;
  const value = JSON.parse(raw) as { href: string; label: string };
  return <Link href={value.href} className="mb-8 flex min-h-16 items-center justify-between gap-4 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] px-4 py-3 text-[var(--text-primary)] hover:bg-[var(--surface-selected)]"><span className="min-w-0"><span className="block text-[12px] text-[var(--text-secondary)]">继续上次准备</span><span className="mt-1 block truncate text-[14px] font-medium">{value.label}</span></span><span aria-hidden="true" className="text-[var(--accent)]">→</span></Link>;
}
