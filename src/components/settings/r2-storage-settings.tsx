"use client";

import { useEffect, useRef, useState } from "react";
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
  const buttonClass = "rounded-[8px] border border-[var(--separator)] px-3 py-2 text-[11.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-control)] disabled:opacity-50";
  return <section aria-labelledby="r2-storage-title" className="border-t border-[var(--separator)] pt-4.5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="r2-storage-title" className="text-[13px] font-semibold text-[var(--text-primary)]">Cloudflare R2 存储</h2>
        <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">手动检查私有存储的连接、文件记录与实际对象用量。</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={Boolean(busy)} onClick={() => void inspect(false)} className={buttonClass}>{busy === "health" ? "检查中…" : "检查连接"}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void inspect(true)} className={buttonClass}>{busy === "scan" ? "统计中…" : "检查并统计用量"}</button>
      </div>
    </div>
    <p className="mt-2 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">仅点击时请求；用量统计最多列举 20,000 个对象 / 20 页，检测限时 45 秒。同一服务实例内 60 秒复用结果。不会下载内容、写入或清理文件。</p>
    {error ? <p role="alert" className="mt-2 text-[11.5px] text-[var(--danger)]">{error}{snapshot ? " 下方保留上次快照，不代表本次检测成功。" : ""}</p> : null}
    <div aria-live="polite" aria-busy={Boolean(busy)}>
      {!snapshot ? <p className="mt-3 text-[12px] text-[var(--text-tertiary)]">尚未检查。打开设置不会自动扫描存储桶。</p> : <>
        <p className="mt-3 text-[10.5px] text-[var(--text-secondary)]">快照时间：{new Date(snapshot.checkedAt).toLocaleString("zh-CN")}{stale ? " · 超过 5 分钟，建议重新检查" : " · 非实时数据"}</p>
        <div className="mt-2 grid gap-2.5 md:grid-cols-3">
          <div className="rounded-[10px] bg-[var(--surface-control)] p-3">
            <h3 className="text-[10.5px] font-medium text-[var(--text-tertiary)]">连接健康</h3>
            <p className={`mt-1 text-[12px] font-medium ${snapshot.health.status === "ok" ? "text-[var(--success)]" : "text-[var(--warning)]"}`}>{healthSummary(snapshot.health)}</p>
            <p className="mt-1 break-all text-[10.5px] leading-4.5 text-[var(--text-secondary)]">桶：{snapshot.health.bucket ?? "未能读取"}</p>
            <p className="mt-1 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">配置：{snapshot.health.configured ? "完整" : "缺失或无效"} · S3 端点：{snapshot.health.endpointValid ? "格式有效" : "格式无效或缺失"}</p>
            <p className="mt-1 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">基于 HeadBucket；对象内容读写、浏览器跨域与每个文件完整性未检测。</p>
          </div>
          <div className="rounded-[10px] bg-[var(--surface-control)] p-3">
            <h3 className="text-[10.5px] font-medium text-[var(--text-tertiary)]">Files 文件记录（逻辑用量）</h3>
            {logical?.status === "complete" ? <><p className="mt-1 text-[12px] font-medium">可用文件 {storageBytes(logical.activeBytes)}</p><p className="mt-1 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">已归档 {storageBytes(logical.archivedBytes)} · 待完成 {storageBytes(logical.pendingBytes)}<br />共 {logical.records.toLocaleString("zh-CN")} 条记录</p></> : <p className="mt-1 text-[12px] text-[var(--warning)]">记录暂不可用，未取得总量</p>}
            <p className="mt-1 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">当前用户、当前桶的数据库记录；待完成大小不代表已存储，归档不删除对象。</p>
          </div>
          <div className="rounded-[10px] bg-[var(--surface-control)] p-3">
            <h3 className="text-[10.5px] font-medium text-[var(--text-tertiary)]">当前桶实际对象（列举快照）</h3>
            {!usage ? <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">尚未统计，点击「检查并统计用量」</p> : usage.status === "unavailable" ? <p className="mt-1 text-[12px] text-[var(--warning)]">{usage.reason === "access_denied" ? "列举权限被拒绝，实际用量未知" : "未能取得实际用量"}</p> : <>
              <p className="mt-1 text-[12px] font-medium">{usage.status === "partial" ? "已统计部分：" : "合计："}{storageBytes(usage.objectBytes)}</p>
              <p className="mt-1 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">{usage.objectCount.toLocaleString("zh-CN")} 个对象 · {usage.pagesScanned} 页 · {usage.status === "complete" ? "列举完成" : "未完成，不是总量"}</p>
              {usage.status === "partial" ? <p className="mt-1 text-[10.5px] text-[var(--warning)]">{usage.reason === "limit" ? "达到本次扫描上限" : usage.reason === "access_denied" ? "后续页面权限被拒绝" : "后续页面读取中断"}</p> : null}
            </>}
            <p className="mt-1 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">包含桶内其他模块、归档与临时对象；列举期间的变化可能影响结果。</p>
          </div>
        </div>
        <p className="mt-2 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">上述用量不是 Cloudflare 账单或账户总用量，也不包含未完成的分段上传。未读取账户配额，不展示占比或预计费用。数量差异不等于孤立文件，不会自动删除。</p>
      </>}
    </div>
  </section>;
}
