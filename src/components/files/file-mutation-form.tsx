"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";

/** Catch action failures locally and retain the user's input for another attempt. */
export function FileMutationForm({ action, children, className, onSuccess }: {
  action: (data: FormData) => Promise<void>; children?: ReactNode; className?: string; onSuccess?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    inFlight.current = true;
    setPending(true); setError("");
    try {
      await action(data);
      onSuccess?.();
    } catch (reason) {
      unstable_rethrow(reason);
      setError(reason instanceof Error ? reason.message : "未能保存，请检查网络后重试。");
    } finally { inFlight.current = false; setPending(false); }
  };
  return <form onSubmit={(event) => { void submit(event); }} className={className} aria-busy={pending}>
    <fieldset disabled={pending} className="contents">{children}</fieldset>
    {pending ? <p role="status" className="text-[12px] text-[var(--text-secondary)]">正在保存…</p> : null}
    {error ? <p role="alert" className="w-full break-words text-[12px] text-[var(--danger)]">{error}</p> : null}
  </form>;
}
