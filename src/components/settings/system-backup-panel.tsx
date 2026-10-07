"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";

/** Download initiation is never reported as a verified backup. */
export function SystemBackupPanel() {
  const frame = useRef<HTMLIFrameElement>(null);
  const frameName = `system-backup-${useId().replace(/:/g, "")}`;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  function responseLoaded() {
    try {
      const value = JSON.parse(frame.current?.contentDocument?.body?.textContent ?? "") as { error?: string };
      if (value.error) { setError(value.error); setMessage(""); }
    } catch { /* Attachment downloads do not expose a document. */ }
  }
  return <section aria-labelledby="system-backup-title" className="mt-8 border-t border-[var(--separator)] pt-7">
    <h2 id="system-backup-title" className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={19} aria-hidden="true" />系统数据快照与恢复演练</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">一起保存笔记正文、业务记录、版本历史与跨板块关系，包含归档与回收站。认证密钥不导出，休闲私有图片原件与变体一并保存，Files 原文件需另下载恢复包。</p>
    <ol className="mt-4 list-inside list-decimal space-y-2 text-xs leading-5 text-[var(--text-secondary)]">
      <li>暂停编辑，下载系统数据快照，再到 <Link href="/files" className="text-[var(--accent)] underline underline-offset-4">Files 下载原件恢复包</Link></li>
      <li>使用离线校验器核对清单、SHA-256、关系与原件。下载完成不等于校验通过</li>
      <li>先在全新本地目录查看 SQLite、笔记和图片，再用无网络的全新 PostgreSQL 容器演练完整业务表恢复</li>
    </ol>
    <form action="/api/exports/system" method="post" target={frameName} onSubmit={event => {
      if (!acknowledged) { event.preventDefault(); return; }
      setError(""); setMessage("下载已发起，尚未校验。若下载中断或缺少末尾清单，请重新下载。当前不会创建任何新的云端备份位置。");
    }} className="mt-4">
      <label className="flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-1" />我了解快照未加密，可能包含个人及财务资料，仅保存到自己控制的位置</label>
      <button disabled={!acknowledged} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"><Download size={15} aria-hidden="true" />下载系统数据快照</button>
    </form>
    {message ? <p role="status" className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{message}</p> : null}
    {error ? <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{error}</p> : null}
    <iframe ref={frame} name={frameName} title="系统快照下载响应" hidden onLoad={responseLoaded} />
    <details className="mt-4 text-xs leading-5 text-[var(--text-secondary)]"><summary className="cursor-pointer font-medium">离线演练命令与范围</summary>
      <p className="mt-2 break-words font-mono">python3 scripts/verify-system-backup.py system.ndjson --files files.tar --restore-to /你的安全目录/新演练目录</p>
      <p className="mt-2 font-medium">原生 PostgreSQL 恢复（需要 Docker；只创建并销毁无网络的新容器）</p>
      <p className="mt-1 break-words font-mono">python3 scripts/rehearse-system-backup-postgres.py --snapshot system.ndjson --files files.tar</p>
      <p className="mt-2">校验器与说明见仓库 docs/system-backup.md。分包可通过 --files 一次传入全部 tar 文件；不带原件时只能验证数据层，报告会明确列出缺口。</p>
      <p className="mt-2">双次读取会检查变更，但不是数据库事务快照。旧版 Supabase 文件若存在，会逐项列出缺失原件；外部服务、登录与部署配置仍需单独恢复。演练不等于生产恢复认证。</p>
    </details>
  </section>;
}
