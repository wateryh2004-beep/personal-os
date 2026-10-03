"use client";

import { useRef, useState } from "react";

export function WorkspaceReadError({ resource }: { resource: { revalidate: (options: { force: boolean }) => Promise<unknown> } }) {
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);
  const retry = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setRetrying(true);
    try { await resource.revalidate({ force: true }); }
    catch { /* The resource publishes the next recoverable error. */ }
    finally { inFlight.current = false; setRetrying(false); }
  };
  return <section role="alert" className="mx-auto max-w-[760px] px-5 py-8 text-[13px] text-[var(--text-secondary)]">
    <p>工作区暂时无法读取，请检查网络后重试。</p>
    <button type="button" disabled={retrying} className="pressable mt-3 min-h-11 rounded-[var(--radius-sm)] px-2 text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-60" onClick={() => { void retry(); }}>{retrying ? "正在重新读取…" : "重新读取"}</button>
    {retrying ? <p role="status" className="sr-only">正在重新读取工作区</p> : null}
  </section>;
}
