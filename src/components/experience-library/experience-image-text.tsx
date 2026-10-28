"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileOcrControl } from "@/components/files/file-ocr-control";
import { correctExperienceImageText, setExperienceImageAiVisibility } from "@/features/experience-library/actions";
import type { ExperienceMedia } from "@/features/experience-library/types";

export function ExperienceImageText({ media }: { media: ExperienceMedia }) {
  const router = useRouter();
  const [text, setText] = useState(media.ocrText ?? "");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  if (!media.documentId || !media.available || !media.originalFilename || !media.mimeType) return null;
  if (media.ocrUnavailable) return <p role="status">图片文字暂时无法读取，原图仍可查看；请稍后刷新。</p>;
  const file = { id: media.documentId, title: media.caption || media.originalFilename, original_filename: media.originalFilename, mime_type: media.mimeType, file_size: media.fileSize ?? 0 };
  function perform(action: () => Promise<void>, success: string) {
    setMessage("");
    startTransition(async () => { try { await action(); setEditing(false); setMessage(success); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "操作未完成，请重试。"); } });
  }
  return <details className="experience-image-text" id={`experience-image-text-${media.id}`}>
    <summary>{media.ocrText !== null && media.ocrText !== undefined ? "查看图片识别文字" : "识别图片文字"}</summary>
    <p>识别文字可能有误，请对照原图；修订会保留原识别结果及历史。</p>
    {media.ocrText !== null && media.ocrText !== undefined ? <>
      {editing ? <Textarea aria-label="修订图片识别文字" value={text} maxLength={300000} rows={6} disabled={pending} onChange={(event) => setText(event.target.value)} /> : <p className="experience-ocr-content">{media.ocrText || "没有识别到文字。"}</p>}
      {editing ? <div className="experience-media-actions"><Button type="button" size="sm" disabled={pending || !media.ocrSourceSha256} onClick={() => perform(() => correctExperienceImageText({ mediaId: media.id, documentId: media.documentId!, sourceSha256: media.ocrSourceSha256!, text, expectedCorrectionId: media.ocrCorrectionId ?? null, expectedExtractedAt: media.ocrExtractedAt ?? null }), "修订已保存，可用于搜索。")}>保存修订</Button><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setText(media.ocrText ?? ""); setEditing(false); }}>取消</Button></div> : <Button type="button" size="sm" variant="ghost" onClick={() => { setText(media.ocrText ?? ""); setEditing(true); }}>修订文字</Button>}
      <div><p>{media.aiVisibility === "normal" ? "此文件已允许 AI 使用，其识别文字可用于 AI 整理。" : "此文件的内容目前不会发送给 AI。"}</p>
      {media.aiVisibility !== "never" ? <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => perform(() => setExperienceImageAiVisibility({ mediaId: media.id, allow: media.aiVisibility !== "normal" }), "图片的 AI 使用设置已更新。")}>{media.aiVisibility === "normal" ? "禁止 AI 使用" : "允许 AI 使用此文件"}</Button> : <p>此文件已设置为禁止 AI 使用，请在文件设置中调整。</p>}</div>
    </> : null}
    <FileOcrControl file={file} onComplete={() => router.refresh()} />
    {message ? <p role="status">{message}</p> : null}
  </details>;
}
