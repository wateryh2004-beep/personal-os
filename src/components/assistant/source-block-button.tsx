"use client";
import { useState, useTransition } from "react";
import { blockAiSource } from "@/features/ai/actions";

export function SourceBlockButton({ entityId, domain }: { entityId: string; domain: "notes" | "files" }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);
  return <span className="inline-flex flex-wrap items-center gap-1">
    <button type="button" disabled={pending || blocked} className="min-h-11 px-1 text-[12px] text-[var(--accent)] underline disabled:opacity-60" onClick={() => startTransition(async () => {
      const form = new FormData(); form.set("source_id", entityId); form.set("domain", domain);
      setMessage("");
      try { await blockAiSource(form); setBlocked(true); setMessage("已禁止以后使用"); }
      catch { setMessage("尚未禁止，请重试"); }
    })}>{pending ? "正在禁止…" : blocked ? "已禁止" : "不再使用"}</button>
    {message ? <span role="status" className={blocked ? "sr-only" : "text-[12px]"}>{message}</span> : null}
  </span>;
}
