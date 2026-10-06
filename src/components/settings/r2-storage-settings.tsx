"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Database, HardDrive, RefreshCw, ShieldCheck } from "lucide-react";
import { storageBudget } from "@/features/files/storage-inspection/presentation";
import { isStorageInspection, type StorageInspection } from "@/features/files/storage-inspection/contract";

export function storageBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ${units[unit]}`;
}

function healthSummary(health: StorageInspection["health"]) {
  if (!health.configured) return "服务端配置缺失或无效";
  if (health.status === "ok") return "桶连接与身份验证通过";
  if (health.reason === "access_denied") return "身份或桶访问权限被拒绝";
  if (health.reason === "not_found") return "未找到配置的桶";
  return "网络或服务异常，暂无法确认连接";
}

export function R2StorageSettings() {
  const [snapshot, setSnapshot] = useState<StorageInspection | null>(null);
  const [busy, setBusy] = useState<"health" | "scan" | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [budgetGiB, setBudgetGiB] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { window.clearInterval(timer); active.current?.abort(); };
  }, []);
  async function inspect(scan: boolean) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(scan ? "scan" : "health"); setError("");
    try {
      const response = await fetch("/api/files/storage-inspection", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]),
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "会话已失效或无权访问，请重新登录后检查。" : "本次检测未完成，请稍后重试。");
      const result: unknown = await response.json();
      if (!isStorageInspection(result)) throw new Error("检测响应无效，请稍后重试。");
      if (!controller.signal.aborted) { setSnapshot(result); setNow(Date.now()); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "检测超时，请稍后重试。");
    } finally {
      if (!controller.signal.aborted) setBusy(null);
      if (active.current === controller) active.current = null;
    }
  }
  const stale = snapshot && now - Date.parse(snapshot.checkedAt) > 5 * 60_000;
  const logical = snapshot?.logical;
  const usage = snapshot?.usage;

  const availableUsage = usage && usage.status !== "unavailable" ? usage : null;
  const budget = storageBudget(availableUsage?.objectBytes ?? null, budgetGiB, usage?.status === "complete");
  const logicalTotal = logical?.status === "complete" ? logical.activeBytes + logical.archivedBytes : 0;
  const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--separator)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-control)] disabled:opacity-50";
  return <section aria-labelledby="r2-storage-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <header><p className="text-xs font-medium tracking-wide text-[var(--accent)]">STORAGE</p><h2 id="r2-storage-title" className="mt-2 text-xl font-semibold tracking-tight">存储空间</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">Cloudflare R2 · 私有文件与容量规划</p></header>
      <button type="button" disabled={Boolean(busy)} onClick={() => void inspect(true)} className={buttonClass + " bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"}><RefreshCw size={14} aria-hidden="true" className={busy === "scan" ? "animate-spin motion-reduce:animate-none" : ""} />{busy === "scan" ? "统计中…" : "检查并统计用量"}</button>
    </div>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-[var(--danger-soft)] p-3 text-xs leading-5 text-[var(--danger)]">{error}{snapshot ? " 下方保留上次快照，不代表本次检测成功。" : ""}</p> : null}
    <div aria-live="polite" aria-busy={Boolean(busy)}>
      <div className="mt-7 grid gap-6 border-b border-[var(--separator)] pb-7 sm:grid-cols-[1.3fr_1fr]">
        <div><p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><HardDrive aria-hidden="true" size={15} />当前桶实际存量 · 快照</p>
          <p className="mt-3 break-words text-[34px] font-semibold leading-tight tracking-tight tabular-nums">{availableUsage ? storageBytes(availableUsage.objectBytes) : "—"}</p>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">{availableUsage ? <>{usage?.status === "partial" ? "已统计部分：" : "合计："}{storageBytes(availableUsage.objectBytes)} · {availableUsage.objectCount.toLocaleString("zh-CN")} 个对象</> : usage?.reason === "access_denied" ? "列举权限被拒绝，实际用量未知" : snapshot ? "尚未取得实际用量" : "尚未检查 · 点击上方按钮获取快照"}</p>
          {usage?.status === "partial" ? <p className="mt-2 text-xs text-[var(--warning)]">未完成，不是总量 · {usage.reason === "limit" ? "达到本次扫描上限" : usage.reason === "access_denied" ? "后续页面权限被拒绝" : "后续页面读取中断"}</p> : null}
        </div>
        <div className="rounded-xl bg-[var(--surface-control)] p-4"><p className="text-xs text-[var(--text-secondary)]">账户免费额度余量</p><p className="mt-2 text-lg font-semibold">暂无法确认</p><p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">当前只读取一个桶的瞬时存量；账户本月 GB-month 用量尚未接入。</p><a href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)]">在 Cloudflare 查看账户用量<ArrowUpRight size={13} aria-hidden="true" /></a></div>
      </div>
      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">容量规划</h3><p className="mt-1 text-xs text-[var(--text-tertiary)]">设置当前桶的个人预算，查看可用空间</p></div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><span>预算</span><input type="number" min="0.001" step="any" inputMode="decimal" value={budgetGiB} onChange={event => setBudgetGiB(event.target.value)} placeholder="未设置" aria-label="当前桶个人容量预算（GiB）" className="h-9 w-24 rounded-lg border border-[var(--separator)] bg-[var(--surface-canvas)] px-2 text-sm outline-offset-2 focus:outline-[var(--accent)]" /><span>GiB</span></label>
        </div>
        {budget ? <div className="mt-5"><div className="flex flex-wrap justify-between gap-2 text-xs"><span className="text-[var(--text-secondary)]">已用 {storageBytes(availableUsage!.objectBytes)}</span><span className={budget.excess ? "font-medium text-[var(--danger)]" : "font-medium text-[var(--accent)]"}>{budget.excess ? "超出预算 " + storageBytes(budget.excess) : "预算内余量 " + storageBytes(budget.remaining)}</span></div><div role="meter" aria-label="当前桶个人容量预算使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={budget.percent} aria-valuetext={budget.excess ? "超出个人预算 " + storageBytes(budget.excess) : "预算内余量 " + storageBytes(budget.remaining)} className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--surface-control)]"><div className={budget.excess ? "h-full bg-[var(--danger)]" : "h-full bg-[var(--accent)]"} style={{ width: budget.percent + "%" }} /></div><p className="mt-2 text-right text-xs tabular-nums text-[var(--text-tertiary)]">个人预算 {storageBytes(budget.total)} · 基于完整列举快照</p></div> : <div className="mt-4 rounded-lg border border-dashed border-[var(--separator-strong)] px-4 py-5 text-xs leading-5 text-[var(--text-tertiary)]">{budgetGiB && usage?.status !== "complete" ? "取得完整桶快照后才能计算预算内余量。" : budgetGiB ? "请输入有效的正数容量预算。" : "尚未设置个人预算，不推算剩余容量。R2 按量计费，没有固定的 10 GB 硬容量。"}</div>}
        <p className="mt-3 text-[11px] leading-5 text-[var(--text-tertiary)]">预算仅用于本页规划，离开或刷新页面后重置；不是账户配额、免费额度或费用预测。</p>
      </div>
      <section className="mt-7 border-t border-[var(--separator)] pt-6" aria-labelledby="logical-storage-title">
        <div className="flex items-center justify-between gap-3"><h3 id="logical-storage-title" className="flex items-center gap-2 text-sm font-semibold"><Database size={16} aria-hidden="true" />Files 文件构成</h3><span className="text-[11px] text-[var(--text-tertiary)]">逻辑用量</span></div>
        {logical?.status === "complete" ? <>
          <div aria-label={"可用文件 " + storageBytes(logical.activeBytes) + "，已归档 " + storageBytes(logical.archivedBytes)} role="img" className="mt-4 flex h-3 overflow-hidden rounded-full bg-[var(--surface-control)]">{logicalTotal > 0 ? <><div className="h-full bg-[var(--accent)]" style={{ width: logical.activeBytes / logicalTotal * 100 + "%" }} /><div className="h-full bg-amber-500" style={{ width: logical.archivedBytes / logicalTotal * 100 + "%" }} /></> : null}</div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">{[{ label: "可用文件", value: logical.activeBytes, dot: "bg-[var(--accent)]" }, { label: "已归档", value: logical.archivedBytes, dot: "bg-amber-500" }, { label: "待完成（不计入图表）", value: logical.pendingBytes, dot: "bg-[var(--separator-strong)]" }].map(item => <div key={item.label}><dt className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><span className={"h-2 w-2 rounded-full " + item.dot} />{item.label}</dt><dd className="mt-2 text-lg font-semibold tabular-nums"><span className="sr-only">{item.label} </span>{storageBytes(item.value)}</dd></div>)}</dl><p className="mt-3 text-[11px] text-[var(--text-tertiary)]">共 {logical.records.toLocaleString("zh-CN")} 条记录 · 当前用户、当前桶</p>
        </> : <p className="mt-4 text-xs text-[var(--text-tertiary)]">{snapshot ? "记录暂不可用，未取得总量" : "完成检查后展示可用与归档文件的逻辑构成"}</p>}
      </section>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--separator)] pt-5">
        <div><p className={"flex items-center gap-2 text-xs font-medium " + (snapshot?.health.status === "ok" && !error && !stale ? "text-[var(--success)]" : "text-[var(--text-secondary)]")}><ShieldCheck aria-hidden="true" size={15} />{snapshot ? (error ? "上次连接检查：" : "") + healthSummary(snapshot.health) : "连接尚未检查"}</p><p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{snapshot ? new Date(snapshot.checkedAt).toLocaleString("zh-CN") + (stale ? " · 超过 5 分钟，建议重新检查" : " · 非实时快照") : "打开设置不会自动扫描存储桶"}</p></div>
        <button type="button" disabled={Boolean(busy)} onClick={() => void inspect(false)} className={buttonClass}>{busy === "health" ? "检查中…" : "检查连接"}</button>
      </div>
      <details className="mt-5 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer py-2 font-medium">统计口径与技术详情</summary><div className="mt-2 space-y-3 rounded-lg bg-[var(--surface-control)] p-4 text-[11px] leading-5">
        <p>仅点击时请求；用量统计最多列举 20,000 个对象 / 20 页，检测限时 45 秒。同一服务实例内 60 秒复用结果。不会下载内容、写入或清理文件。</p>
        {snapshot ? <p className="break-all">桶：{snapshot.health.bucket ?? "未能读取"}<br />配置：{snapshot.health.configured ? "完整" : "缺失或无效"} · S3 端点：{snapshot.health.endpointValid ? "格式有效" : "格式无效或缺失"}{availableUsage ? <><br />本次列举 {availableUsage.pagesScanned} 页 · {availableUsage.status === "complete" ? "列举完成" : "未完成"}</> : null}</p> : null}
        <p>连接检查基于 HeadBucket；对象内容读写、浏览器跨域与每个文件完整性未检测。实际对象包含桶内其他模块、归档与临时对象；列举期间的变化可能影响结果。</p>
        <p>文件构成来自数据库记录；待完成大小不代表已存储，归档不删除对象。数量差异不等于孤立文件。</p>
        <p>上述用量不是 Cloudflare 账单或账户总用量，也不包含未完成的分段上传。Standard 免费用量为每月 10 GB-month，按计费周期每日峰值平均计算，不是固定空间上限；不适用于 Infrequent Access。</p>
        <a className="inline-flex items-center gap-1 text-[var(--accent)] underline underline-offset-4" href="https://developers.cloudflare.com/r2/pricing/" target="_blank" rel="noreferrer">Cloudflare 官方计费说明<ArrowUpRight size={12} aria-hidden="true" /></a>
      </div></details>
    </div>
  </section>;
}
