"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ExportPlan } from "@/features/files/export/contract";

function bytes(value: number) {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

/** Native downloads remain streamed; initiating one never marks a backup verified. */
export function FileRecoveryPanel({ disabled = false }: { disabled?: boolean }) {
  const frameName = `files-export-${useId().replace(/:/g, "")}`;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [plan, setPlan] = useState<ExportPlan | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [started, setStarted] = useState<number[]>([]);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function preparePlan() {
    if (pending || disabled) return;
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/files/export/plan", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(240_000)]) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "暂时无法准备导出，请稍后重试。");
      if (controller.signal.aborted || requestRef.current !== controller) return;
      if (value.format !== "personal-os-files-plan/v1" || typeof value.planId !== "string" || !Array.isArray(value.parts) ||
          !value.counts || !value.storage || ![value.counts.documents, value.counts.objectBytes, value.counts.pending, value.storage.availableBytes, value.storage.archivedBytes, value.storage.possibleDuplicateBytes].every(number => Number.isFinite(number) && number >= 0) ||
          !value.parts.every((part: { partIndex?: number; documentCount?: number; estimatedBytes?: number }) => Number.isInteger(part.partIndex) && part.partIndex! >= 1 && Number.isInteger(part.documentCount) && part.documentCount! >= 0 && Number.isFinite(part.estimatedBytes) && part.estimatedBytes! >= 0)) throw new Error("导出计划响应无效，请重试。");
      setPlan(value); setStarted([]);
      setMessage("计划已准备。下载各分包后，请一起校验，才算完整副本。");
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "暂时无法准备导出。");
    } finally { if (requestRef.current === controller) { requestRef.current = null; setPending(false); } }
  }
  function submitted(event: FormEvent, part?: number) {
    if (disabled || pending) { event.preventDefault(); return; }
    setError("");
    if (part !== undefined) setStarted(current => current.includes(part) ? current : [...current, part]);
    setMessage("下载已发起，尚未验证完成。请保留下载的文件，并运行离线校验。");
  }
  function downloadResponse() {
    // Successful attachment responses are handled by the browser download UI.
    // A same-origin JSON error loads here instead of replacing the Files page.
    try {
      const text = frameRef.current?.contentDocument?.body?.textContent?.trim();
      if (!text) return;
      const value = JSON.parse(text) as { error?: string; code?: string };
      if (value.error) { setError(value.error); setMessage(""); }
      if (value.code === "files_export_plan_changed") { setPlan(null); setStarted([]); }
    } catch { /* Browser attachment handling need not expose a document. */ }
  }
  return <details className="mt-3 rounded-[9px] border border-[var(--separator)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
    <summary className="cursor-pointer font-medium">导出与恢复副本</summary>
    <p className="mt-2 leading-5">包含 Files 原件、归档中的文件、笔记附件及目录关系，可能含敏感资料。仅保存到你控制的位置。未完成上传只列入清单，不算已备份。</p>
    <p className="mt-1 leading-5">大文件集合可分包下载，失败时重试相同分包。单文件仍限 100 MiB；这不是完整数据库备份，也不会自动清理原件。</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={disabled || pending} onClick={() => void preparePlan()} className="pressable rounded-[8px] bg-[var(--surface-control)] px-3 py-2 font-medium text-[var(--accent)] disabled:opacity-50">{pending ? "正在读取清单…" : plan ? "重新生成分包计划" : "准备分包导出"}</button>
      <form action="/api/files/export" method="post" target={frameName} onSubmit={event => submitted(event)}>
        <button disabled={disabled || pending} className="pressable rounded-[8px] bg-[var(--surface-control)] px-3 py-2 disabled:opacity-50">单包下载（≤512 MiB）</button>
      </form>
    </div>
    {plan ? <section aria-label="文件恢复包计划" className="mt-3 space-y-2">
      <p>{plan.counts.documents} 个文件记录 · {plan.parts.length} 个分包 · 原件 {bytes(plan.counts.objectBytes)} · 未完成上传 {plan.counts.pending} 个</p>
      <p className="leading-5">已保存 {bytes(plan.storage.availableBytes)}，归档 {bytes(plan.storage.archivedBytes)}。相同记录哈希的潜在重复 {bytes(plan.storage.possibleDuplicateBytes)}；只供核对，不代表可安全删除。</p>
      <p className="leading-5">以上是文件记录的逻辑容量，未计入暂存或其他 R2 对象，不是供应商账单用量。新上传暂存副本仍保留。</p>
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {plan.parts.map(part => <li key={part.partIndex} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-[var(--surface-control)] px-2 py-2">
          <span>第 {part.partIndex} / {plan.parts.length} 包 · {part.documentCount} 个记录 · 预计 {bytes(part.estimatedBytes)}</span>
          <form action="/api/files/export/part" method="post" target={frameName} onSubmit={event => submitted(event, part.partIndex)}>
            <input type="hidden" name="planId" value={plan.planId} /><input type="hidden" name="partIndex" value={part.partIndex} />
            <button disabled={disabled || pending} className="pressable rounded px-2 py-1 font-medium text-[var(--accent)] disabled:opacity-50">{started.includes(part.partIndex) ? `重试第 ${part.partIndex} 包（未校验）` : `下载第 ${part.partIndex} 包`}</button>
          </form>
        </li>)}
      </ul>
      <p className="leading-5">不要混用不同计划的分包。导出期间暂停整理文件；若清单变化，请重新生成计划。最终以离线校验器确认全部分包齐全为准。</p>
    </section> : null}
    {message ? <p role="status" className="mt-2 leading-5">{message}</p> : null}
    {error ? <p role="alert" className="mt-2 leading-5 text-[var(--danger)]">{error}</p> : null}
    <p className="mt-2 leading-5">校验方法见仓库 docs/files/portable-export.md。离线工具只在新的本地目录演练恢复，不连接生产数据库。</p>
    <iframe ref={frameRef} title="文件下载结果" name={frameName} onLoad={downloadResponse} hidden />
  </details>;
}
