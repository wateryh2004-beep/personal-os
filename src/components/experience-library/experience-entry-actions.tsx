"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { ExperienceBulkOcr } from "./experience-bulk-ocr";
import { ExperienceImageText } from "./experience-image-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  archiveExperienceMedia,
  moveExperienceMedia,
  updateExperienceMedia,
} from "@/features/experience-library/actions";
import type { ExperienceCapture, ExperienceMedia } from "@/features/experience-library/types";

const MediaContext = createContext<{ managing: boolean; open: (id: string) => void } | null>(null);

export function ExperienceMediaProvider({ media, children }: { media: ExperienceMedia[]; children: ReactNode }) {
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const available = media.filter((item) => item.available && item.documentId);
  const index = available.findIndex((item) => item.id === selected);
  const current = index >= 0 ? available[index] : null;
  function move(direction: number) {
    if (!available.length || index < 0) return;
    const next = Math.max(0, Math.min(available.length - 1, index + direction));
    setSelected(available[next].id);
  }
  return <MediaContext.Provider value={{ managing, open: setSelected }}>
    {media.length ? <div className="experience-media-toolbar"><span>{media.length} 张图片</span><Button type="button" variant={managing ? "default" : "outline"} onClick={() => setManaging(!managing)} aria-pressed={managing}>{managing ? "完成管理" : "管理图片"}</Button></div> : null}
    <ExperienceBulkOcr media={media} />
    {children}
    <Dialog open={Boolean(current)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="experience-lightbox sm:max-w-5xl" onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); } if (event.key === "ArrowRight") { event.preventDefault(); move(1); } }}>
        <DialogHeader><DialogTitle>图片预览</DialogTitle><DialogDescription>{current ? `${index + 1} / ${available.length}${current.caption ? ` · ${current.caption}` : ""}` : ""}</DialogDescription></DialogHeader>
        {current?.documentId ? <img // eslint-disable-line @next/next/no-img-element
          src={`/api/files/${current.documentId}/download?inline=1`} alt={current.caption || current.originalFilename || "经验图片"} className="experience-lightbox-image" /> : null}
        <div className="experience-lightbox-controls"><Button type="button" variant="outline" disabled={index <= 0} onClick={() => move(-1)}><ChevronLeft aria-hidden="true" />上一张</Button><Button type="button" variant="outline" disabled={index >= available.length - 1} onClick={() => move(1)}>下一张<ChevronRight aria-hidden="true" /></Button></div>
      </DialogContent>
    </Dialog>
  </MediaContext.Provider>;
}

export function ExperienceAiAnalyzeButton({
  entryId,
  configured,
  previouslyFailed,
}: {
  entryId: string;
  configured: boolean;
  previouslyFailed: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function analyze() {
    if (!configured || pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/experience-library/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "AI 整理未完成。");
      if (payload.truncated) setNotice("内容较长，本次仅整理了各来源的部分文字；请结合原文核对。");
      router.refresh();
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "AI 整理未完成。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="experience-ai-action">
      <Button type="button" variant="outline" onClick={() => void analyze()} disabled={!configured || pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
        {pending ? "正在整理…" : "AI 整理"}
      </Button>
      {!configured ? <span>先在资料库首页配置模型。未配置时原文与图片照常使用。</span> : null}
      {configured && previouslyFailed ? <span role="alert">上次 AI 整理未完成，原文与图片仍完整保留。</span> : null}
      {configured && !previouslyFailed ? <span>发送当前经验原文和已允许 AI 使用的图片识别文字；不发送图片原件。</span> : null}
      {notice ? <span role="status">{notice}</span> : null}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}

export function ExperienceMediaManager({
  media,
  captures,
  order,
}: {
  media: ExperienceMedia;
  captures: ExperienceCapture[];
  order: number;
}) {
  const router = useRouter();
  const mediaContext = useContext(MediaContext);
  const [pending, startTransition] = useTransition();
  const [caption, setCaption] = useState(media.caption ?? "");
  const [captureId, setCaptureId] = useState(media.captureId ?? "");
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<void | string>, success: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        const outcome = await action();
        setMessage(typeof outcome === "string" ? outcome : success);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "操作未完成。");
      }
    });
  }

  return (
    <figure className="experience-media-card" id={`experience-media-${media.id}`}>
      <div className="experience-media-frame">
        {media.documentId && media.available ? (
          // Authenticated same-origin private original; never a public object URL.
          <button type="button" className="experience-media-open" aria-label={`放大查看图片 ${order}`} onClick={() => mediaContext?.open(media.id)}><img // eslint-disable-line @next/next/no-img-element
            src={`/api/files/${media.documentId}/download?inline=1`}
            alt={media.caption || media.originalFilename || "经验图片"}
            loading="lazy"
            decoding="async"
          /></button>
        ) : (
          <p>图片原件暂时不可用。记录关联仍保留，请检查文件是否已归档。</p>
        )}
        <span className="experience-media-order">{String(order).padStart(2, "0")}</span>
      </div>
      <figcaption>
        <ExperienceImageText media={media} />
        {!mediaContext?.managing ? <>
          {media.caption ? <p className="experience-media-caption">{media.caption}</p> : null}
          {media.selectionQuote ? <blockquote>“{media.selectionQuote}”</blockquote> : null}
        </> : <>
        <label>
          <span className="sr-only">图片说明</span>
          <Input
            value={caption}
            maxLength={500}
            placeholder="填写图片说明"
            disabled={pending}
            onChange={(event) => setCaption(event.target.value)}
          />
        </label>
        <Select value={captureId || "whole"} onValueChange={(value) => setCaptureId(value === "whole" ? "" : value)} disabled={pending}>
          <SelectTrigger aria-label="关联原文" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="whole">整篇 / 其他图片</SelectItem>
            {captures.map((capture, index) => (
              <SelectItem key={capture.id} value={capture.id}>
                {capture.captureType === "comment" ? "评论" : capture.captureType === "post" ? "正文" : "原文"} {index + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {media.selectionQuote ? <blockquote>“{media.selectionQuote}”</blockquote> : null}
        <div className="experience-media-actions">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(
              () => updateExperienceMedia({
                mediaId: media.id,
                captureId: captureId || null,
                caption: caption || null,
              }),
              "关联和说明已更新。",
            )}
          >
            保存关联
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="图片上移"
            disabled={pending}
            onClick={() => run(async () => {
              const result = await moveExperienceMedia({ mediaId: media.id, direction: "up" });
              return result.moved ? undefined : "已经在最前。";
            }, "顺序已更新。")}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="图片下移"
            disabled={pending}
            onClick={() => run(async () => {
              const result = await moveExperienceMedia({ mediaId: media.id, direction: "down" });
              return result.moved ? undefined : "已经在最后。";
            }, "顺序已更新。")}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(async () => {
              await archiveExperienceMedia({ mediaId: media.id });
            }, "已移除关联；私有原件仍保留。")}
          >
            <Trash2 aria-hidden="true" />移除关联
          </Button>
        </div>
        {message ? <p className="experience-media-message" role="status">{message}</p> : null}
        </>}
      </figcaption>
    </figure>
  );
}
