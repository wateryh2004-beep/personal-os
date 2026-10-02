"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

type WorkspaceSyncStatusProps = {
  error?: Error;
  resource: { revalidate: (options: { force: boolean }) => Promise<unknown> };
};

/** A failed refresh must never replace usable cached content or its local drafts. */
export function WorkspaceSyncStatus({ error, resource }: WorkspaceSyncStatusProps) {
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);
  if (!error && !retrying) return null;

  const retry = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRetrying(true);
    try { await resource.revalidate({ force: true }); }
    catch { /* The resource keeps the failure and the last successful data. */ }
    finally { inFlight.current = false; setRetrying(false); }
  };

  return <div className="workspace-sync-status flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--border-subtle)] bg-[var(--surface-app)] px-4 py-1 text-[12px] leading-5 text-[var(--text-secondary)] sm:px-6">
    <p role="status" aria-live="polite">{retrying ? "正在重新同步，已有内容仍可查看。" : "暂未同步，当前显示上次读取的内容。"}</p>
    <button type="button" disabled={retrying} onClick={() => { void retry(); }} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[var(--accent)] disabled:opacity-60 md:min-h-8">
      <RefreshCw aria-hidden="true" className={`size-3.5 ${retrying ? "animate-spin motion-reduce:animate-none" : ""}`} />
      {retrying ? "同步中…" : "重新同步"}
    </button>
  </div>;
}
