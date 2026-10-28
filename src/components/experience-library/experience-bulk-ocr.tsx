"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { recognizeExperienceImage } from "@/features/experience-library/browser-image-ocr";
import type { ExperienceMedia } from "@/features/experience-library/types";

export function ExperienceBulkOcr({ media }: { media: ExperienceMedia[] }) {
  const router = useRouter();
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const pending = media.filter((item) => item.available && !item.ocrUnavailable && item.documentId && item.originalFilename && item.mimeType && item.fileSize && item.ocrText == null);
  if (!pending.length && !message) return null;
  async function run() {
    if (controller.current) return;
    const active = new AbortController(); controller.current = active; setBusy(true); setMessage("");
    let completed = 0, failed = 0;
    for (const [index, item] of pending.entries()) {
      if (active.signal.aborted) break;
      if (mounted.current) setMessage(`正在识别第 ${index + 1} / ${pending.length} 张，请保持页面打开。`);
      try {
        const file = { name: item.originalFilename!, type: item.mimeType!, size: item.fileSize! } as File;
        const result = await recognizeExperienceImage(file, item.documentId!, active.signal, () => {});
        if (result === "completed") completed += 1; else failed += 1;
      } catch { if (!active.signal.aborted) failed += 1; }
    }
    controller.current = null;
    if (mounted.current) {
      setBusy(false);
      setMessage(`${active.signal.aborted ? "已停止。" : "识别结束。"} ${completed} 张已加入搜索${failed ? `，${failed} 张未完成或格式不支持，可单独检查。` : "。"}`);
      if (completed) router.refresh();
    }
  }
  return <div className="experience-bulk-ocr">
    {pending.length ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>识别本篇未识别图片（{pending.length}）</Button> : null}
    {busy ? <Button type="button" size="sm" variant="ghost" onClick={() => controller.current?.abort()}>停止识别</Button> : null}
    {message ? <span role="status">{message}</span> : null}
  </div>;
}
