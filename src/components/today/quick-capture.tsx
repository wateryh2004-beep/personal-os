"use client";

import { useActionState, useEffect, useRef } from "react";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { ArrowUp } from "lucide-react";
import { captureInboxItem } from "@/features/inbox/actions";
import type { InboxCaptureState } from "@/features/inbox/state";

const initialState: InboxCaptureState = { status: "idle", message: "" };

export function QuickCapture() {
  const [state, action, pending] = useActionState(captureInboxItem, initialState);
  const draft = useWorkflowDraft({ kind: "capture", id: "today", label: "快速记录", resumeHref: "/today", initialValue: "", parse: value => typeof value === "string" && value.length <= 10000 ? value : null });
  const { clear: clearDraft, setValue: setDraftValue } = draft;
  const submitted = useRef("");
  const previousStatus = useRef(state);
  useEffect(() => {
    if (previousStatus.current === state) return;
    previousStatus.current = state;
    if (state.status === "success") {
      clearDraft(submitted.current);
      setDraftValue(current => current === submitted.current ? "" : current);
    }
  }, [state, clearDraft, setDraftValue]);

  return (
    <form action={action} onSubmit={() => { submitted.current = draft.value; }} className="group">
      <label className="sr-only" htmlFor="now-quick-capture">
        快速记录到 Inbox
      </label>
      <div className="flex items-center gap-2 rounded-[11px] bg-[var(--surface-control)] px-1.5 py-1.5 md:px-2 shadow-[inset_0_1px_0_rgba(255,255,255,.28)] ring-1 ring-transparent transition-[background-color,box-shadow] ui-transition hover:bg-[var(--surface-control-hover)] focus-within:bg-[var(--surface-canvas)] focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]">
        <input
          id="now-quick-capture"
          name="content"
          value={draft.value}
          onChange={event => draft.setValue(event.target.value)}
          required
          maxLength={10000}
          autoComplete="off"
          placeholder="记下一件事…"
          className="h-11 min-w-0 md:h-8 flex-1 bg-transparent px-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        <button
          disabled={pending}
          className="pressable flex size-11 md:size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_1px_2px_rgba(0,0,0,.07)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-40"
          aria-label="加入 Inbox"
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </button>
      </div>
      {draft.recoveryUnavailable ? <p role="status" className="mt-1 text-xs text-[var(--warning)]">输入仍保留在此处，暂时无法在切页后恢复。</p> : null}
      {state.status !== "idle" ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-1 px-1 text-[12px] leading-5 ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
