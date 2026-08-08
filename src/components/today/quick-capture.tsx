"use client";

import { useActionState } from "react";
import { ArrowUp } from "lucide-react";
import { captureInboxItem } from "@/features/inbox/actions";
import type { InboxCaptureState } from "@/features/inbox/state";

const initialState: InboxCaptureState = { status: "idle", message: "" };

export function QuickCapture() {
  const [state, action, pending] = useActionState(captureInboxItem, initialState);
  return <form action={action} className="group"><label className="sr-only" htmlFor="now-quick-capture">快速记录到 Inbox</label><div className="flex items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] p-1.5 focus-within:border-[var(--accent)]"><input id="now-quick-capture" name="content" required maxLength={10000} autoComplete="off" placeholder="快速记录，稍后再决定去向…" className="h-8 min-w-0 flex-1 bg-transparent px-2 text-sm placeholder:text-[var(--text-tertiary)]" /><button disabled={pending} className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-white disabled:opacity-50" aria-label="加入 Inbox"><ArrowUp className="size-4" aria-hidden="true" /></button></div>{state.status !== "idle" ? <p role="status" aria-live="polite" className={`mt-1.5 text-xs ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{state.message}</p> : null}</form>;
}
