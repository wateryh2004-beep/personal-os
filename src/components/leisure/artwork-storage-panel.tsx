"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { artworkImportRegistry } from "@/features/leisure/artwork-import-registry";
import { importLeisureArtwork } from "@/features/leisure/artwork-storage-actions";
import { refreshPrivateLeisureArtwork } from "@/features/leisure/use-private-artwork";

export function ArtworkStoragePanel({ configured, initialSources }: { configured: boolean; initialSources: Record<string, string> }) {
  const [running, setRunning] = useState(false);
  const busy = useRef(false);
  const [results, setResults] = useState<Record<string, string>>(() => Object.fromEntries(artworkImportRegistry.map((entry) =>
    [entry.id, initialSources[entry.src] ? "已存储并校验" : "尚未迁移"])));
  async function migrate() {
    if (busy.current || !configured) return;
    busy.current = true; setRunning(true);
    try {
      for (const entry of artworkImportRegistry) {
        setResults((value) => ({ ...value, [entry.id]: "正在复制与校验…" }));
        try {
          const result = await importLeisureArtwork(entry.id);
          setResults((value) => ({ ...value, [entry.id]: result.ok
            ? `已校验 · ${(result.bytes / 1024).toFixed(0)} KB · SHA-256 ${result.sha256}`
            : result.error }));
        } catch { setResults((value) => ({ ...value, [entry.id]: "连接中断，可重试；原图地址保留" })); }
      }
    } finally { busy.current = false; setRunning(false); refreshPrivateLeisureArtwork(); }
  }
  return <section className="mx-auto max-w-3xl space-y-5 px-5 py-8">
    <Link href="/leisure" className="text-sm text-[var(--accent)]">← 返回闲暇</Link>
    <h1 className="text-2xl font-semibold">宣传图片的私有存储</h1>
    <p className="text-sm leading-6 text-[var(--text-secondary)]">复制现有的 16 张公开宣传图至私有 R2，保留原始来源与署名。原件和阅读用缩略图会逐一校验；只有登录后才能读取。其他内容与文件不受影响。</p>
    <p className="text-xs leading-5 text-[var(--text-tertiary)]">图片版权仍归各权利人所有。私人存储不代表取得授权；这里不绕过付费墙、登录要求或下载限制。</p>
    {!configured ? <p role="status" className="text-sm text-[var(--danger)]">现有 R2 服务端配置尚不可用，未进行上传。</p> : null}
    <button type="button" onClick={() => void migrate()} disabled={!configured || running}
      className="min-h-11 rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
      {running ? "正在逐张复制与校验…" : "复制并校验这 16 张图片"}
    </button>
    <p className="text-xs text-[var(--text-tertiary)]">可安全重试；已存在的对象会复核，绝不覆盖或删除。</p>
    <ul className="divide-y divide-[var(--separator)]" aria-live="polite" aria-busy={running}>
      {artworkImportRegistry.map((entry) => <li key={entry.id} className="space-y-1 py-3">
        <p className="text-sm font-medium">{entry.title}</p>
        <p className="break-all text-xs text-[var(--text-secondary)]">{results[entry.id]}</p>
        <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)]">{entry.credit}</a>
      </li>)}
    </ul>
  </section>;
}
