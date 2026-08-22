"use client";

import { useActionState } from "react";
import { ArrowUp } from "lucide-react";
import { captureInboxItem } from "@/features/inbox/actions";
import type { InboxCaptureState } from "@/features/inbox/state";

const initialState: InboxCaptureState = { status: "idle", message: "" };

export function QuickCapture() {
  const [state, action, pending] = useActionState(captureInboxItem, initialState);

  return (
    <form action={action} className="group">
      <label className="sr-only" htmlFor="now-quick-capture">
        快速记录到 Inbox
      </label>
      <div className="flex items-center gap-2 rounded-[12px] bg-[var(--surface-selected)] px-2 py-1.5 ring-1 ring-transparent transition-[background-color,box-shadow] ui-transition focus-within:bg-[var(--surface-canvas)] focus-within:ring-[var(--separator-strong)]">
        <input
          id="now-quick-capture"
          name="content"
          required
          maxLength={10000}
          autoComplete="off"
          placeholder="记下一件事…"
          className="h-8 min-w-0 flex-1 bg-transparent px-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        <button
          disabled={pending}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-[opacity,transform] ui-transition hover:opacity-90 active:scale-[0.96] disabled:opacity-40"
          aria-label="加入 Inbox"
        >
          <ArrowUp className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {state.status !== "idle" ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-1.5 px-1 text-[11px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
