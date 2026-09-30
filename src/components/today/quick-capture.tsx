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
      <div className="flex items-center gap-2 rounded-[11px] bg-[var(--surface-control)] px-2 py-[5px] shadow-[inset_0_1px_0_rgba(255,255,255,.28)] ring-1 ring-transparent transition-[background-color,box-shadow] ui-transition hover:bg-[var(--surface-control-hover)] focus-within:bg-[var(--surface-canvas)] focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]">
        <input
          id="now-quick-capture"
          name="content"
          required
          maxLength={10000}
          autoComplete="off"
          placeholder="记下一件事…"
          className="h-8 min-w-0 flex-1 bg-transparent px-2 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        <button
          disabled={pending}
          className="pressable flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_1px_2px_rgba(0,0,0,.07)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-40"
          aria-label="加入 Inbox"
        >
          <ArrowUp className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {state.status !== "idle" ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-1 px-1 text-[10.5px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
