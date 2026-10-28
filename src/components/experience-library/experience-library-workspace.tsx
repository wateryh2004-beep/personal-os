"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  ImagePlus,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import {
  appendExperienceCapture,
  attachExperienceMedia,
  createImageOnlyExperience,
  removeExperienceAiSettings,
  saveExperienceAiSettings,
  testExperienceAiSettings,
} from "@/features/experience-library/actions";
import {
  extractExperienceTags,
  normalizeExperienceSourceUrl,
  suggestExperienceTitle,
} from "@/features/experience-library/parsing";
import type {
  AppendExperienceResult,
  ExperienceAiConfig,
  ExperienceCaptureChoice,
  ExperienceEntrySummary,
} from "@/features/experience-library/types";
import { cn } from "@/lib/utils";

type WorkspaceData = {
  available: boolean;
  query: string;
  entries: ExperienceEntrySummary[];
  total: number;
  captureTotal: number;
  mediaTotal: number;
};

type InitialEntry = {
  id: string;
  title: string;
  sourceUrl: string | null;
} | null;

type PendingImage = {
  localId: string;
  file: File;
  previewUrl: string;
  documentId: string | null;
  caption: string;
  sourceKind: "clipboard" | "drop" | "file";
  associationInitialized: boolean;
  entryId: string | null;
  captureId: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionQuote: string | null;
  status: "queued" | "uploading" | "verifying" | "saved" | "failed";
  message: string | null;
};

const captureChoices: { value: ExperienceCaptureChoice; label: string }[] = [
  { value: "auto", label: "自动区分" },
  { value: "post", label: "主帖正文" },
  { value: "comment", label: "评论" },
  { value: "document", label: "其他原文" },
];

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function json(response: Response) {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ExperienceLibraryWorkspace({
  data,
  aiConfig,
  initialEntry,
}: {
  data: WorkspaceData;
  aiConfig: ExperienceAiConfig;
  initialEntry: InitialEntry;
}) {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState(initialEntry?.sourceUrl ?? "");
  const [title, setTitle] = useState(initialEntry?.title ?? "");
  const [content, setContent] = useState("");
  const [captureType, setCaptureType] = useState<ExperienceCaptureChoice>("auto");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [cancelController, setCancelController] = useState<AbortController | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppendExperienceResult | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const textSavedRef = useRef<{ entryId: string; captureId: string | null } | null>(null);
  const previewUrlsRef = useRef(new Set<string>());

  const suggestedTitle = useMemo(() => suggestExperienceTitle(content), [content]);
  const tags = useMemo(() => extractExperienceTags(content), [content]);
  const unsavedCount = images.filter((image) => image.status !== "saved").length;

  function currentSelection() {
    const textarea = textareaRef.current;
    if (!textarea || !content.trim()) return { start: null, end: null, quote: null };
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (end <= start || !content.slice(start, end).trim()) {
      return {
        start: null,
        end: null,
        quote: null,
      };
    }
    return { start, end, quote: content.slice(start, end) };
  }

  function addFiles(
    files: File[],
    sourceKind: PendingImage["sourceKind"],
    selection = currentSelection(),
  ) {
    const imageFiles = files.filter((file) => /^image\/(png|jpeg|webp|gif|avif)$/.test(file.type));
    if (!imageFiles.length) {
      setError("剪贴板或拖拽内容中没有可保存的安全图片格式。");
      return;
    }
    const unsupported = imageFiles.filter((file) => file.size > 15 * 1024 * 1024);
    if (unsupported.length) {
      setError(`有 ${unsupported.length} 张图片超过 15MB，未加入保存队列。`);
    }
    setImages((current) => {
      const existing = new Set(current.map((image) => fileKey(image.file)));
      const additions = imageFiles
        .filter((file) => file.size <= 15 * 1024 * 1024)
        .flatMap((file) => {
          const key = fileKey(file);
          if (existing.has(key)) return [];
          existing.add(key);
          const previewUrl = URL.createObjectURL(file);
          previewUrlsRef.current.add(previewUrl);
          return [{
            localId: crypto.randomUUID(),
            file,
            previewUrl,
            documentId: null,
            caption: "",
            sourceKind,
            associationInitialized: false,
            entryId: null,
            captureId: null,
            selectionStart: selection.start,
            selectionEnd: selection.end,
            selectionQuote: selection.quote,
            status: "queued" as const,
            message: "等待保存",
          }];
        });
      if (additions.length < imageFiles.filter((file) => file.size <= 15 * 1024 * 1024).length) {
        setNotice("重复粘贴的图片已跳过。");
      }
      return [...current, ...additions];
    });
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const allFiles = [...(event.clipboardData.files ?? [])];
    const files = allFiles.filter((file) => file.type.startsWith("image/"));
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (files.length) {
      const mixed = Boolean(text.trim());
      addFiles(files, "clipboard", mixed ? { start: null, end: null, quote: null } : currentSelection());
      if (!text.trim()) event.preventDefault();
      else setNotice("文字会正常保留，图片也会加入保存队列。");
      return;
    }
    if (allFiles.length) {
      setError("剪贴板中的文件不是受支持的图片格式。");
    }
    if (!files.length && /<img\b/i.test(html)) {
      setNotice("这次剪贴板只提供了网页图片链接，没有图片字节。请单独复制图片、截图或上传，链接本身不会冒充已保存原图。");
    }
  }

  function handleDrop(event: React.DragEvent<HTMLTextAreaElement>) {
    const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    addFiles(files, "drop");
  }

  function removeImage(localId: string) {
    setImages((current) => {
      const image = current.find((item) => item.localId === localId);
      if (image) {
        URL.revokeObjectURL(image.previewUrl);
        previewUrlsRef.current.delete(image.previewUrl);
      }
      return current.filter((item) => item.localId !== localId);
    });
  }

  function bindToCurrentSelection(localId: string) {
    const selection = currentSelection();
    setImages((current) => current.map((image) => image.localId === localId
      ? {
        ...image,
        selectionStart: selection.start,
        selectionEnd: selection.end,
        selectionQuote: selection.quote,
      }
      : image));
    setNotice(selection.quote ? "图片已改绑到当前选中的原文。" : "图片已改绑到整次粘贴。");
  }

  async function uploadAndAttach(
    image: PendingImage,
    saved: { entryId: string; captureId: string | null },
    signal: AbortSignal,
    onDocumentPrepared: (documentId: string) => void,
  ) {
    let documentId = image.documentId;
    let uploadUrl: string | null = null;
    if (!documentId) {
      const checksum = await sha256(image.file);
      signal.throwIfAborted();
      const created = await fetch("/api/experience-library/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: image.file.name || `screenshot-${Date.now()}.png`,
          contentType: image.file.type,
          size: image.file.size,
          checksum,
        }),
        signal,
      });
      const prepared = await json(created);
      if (!created.ok || typeof prepared.documentId !== "string" || typeof prepared.uploadUrl !== "string") {
        throw new Error(String(prepared.error || "图片上传准备失败。"));
      }
      documentId = prepared.documentId;
      onDocumentPrepared(documentId);
      uploadUrl = prepared.uploadUrl;
    } else {
      const response = await fetch(`/api/experience-library/upload-url?documentId=${encodeURIComponent(documentId)}`, { cache: "no-store", signal });
      const current = await json(response);
      if (!response.ok || current.documentId !== documentId || !["pending", "available"].includes(String(current.state))) {
        throw new Error(String(current.error || "图片上传状态未确认，请重试。"));
      }
      if (current.state === "pending") {
        if (typeof current.uploadUrl !== "string") throw new Error("图片续传地址未确认，请重试。");
        uploadUrl = current.uploadUrl;
      }
    }
    if (uploadUrl) {
      const sent = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": image.file.type },
        body: image.file,
        signal,
      });
      if (!sent.ok) throw new Error("图片未传入私有存储。");
    }
    {
      const completed = await fetch("/api/files/upload-url", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
        signal,
      });
      const completion = await json(completed);
      if (!completed.ok) throw new Error(String(completion.error || "图片原件尚未确认入库。"));
    }
    signal.throwIfAborted();
    await attachExperienceMedia({
      entryId: image.entryId ?? saved.entryId,
      captureId: image.associationInitialized ? image.captureId : saved.captureId,
      documentId,
      selectionStart: image.selectionStart,
      selectionEnd: image.selectionEnd,
      selectionQuote: image.selectionQuote,
      caption: image.caption || null,
      sourceKind: image.sourceKind,
    });
    return documentId;
  }

  async function save() {
    if (saving) return;
    const pending = images.filter((image) => image.status !== "saved");
    if (!content.trim() && !pending.length) {
      setError("请先粘贴文字、评论或图片。");
      return;
    }
    let normalizedSourceUrl: string | null;
    try {
      normalizedSourceUrl = normalizeExperienceSourceUrl(sourceUrl);
    } catch {
      setError("来源链接格式不正确。请填写以 http:// 或 https:// 开头的完整链接，或清空后保存。");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    setCancelController(controller);
    let saved = content.trim() ? null : textSavedRef.current;
    let failedImageCount = 0;
    try {
      if (content.trim() && !saved) {
        requestIdRef.current ??= crypto.randomUUID();
        const appended = await appendExperienceCapture({
          requestId: requestIdRef.current,
          entryId: initialEntry?.id ?? result?.entryId ?? null,
          sourceUrl: normalizedSourceUrl,
          title: title.trim() || suggestedTitle,
          captureType,
          content,
        });
        saved = { entryId: appended.entryId, captureId: appended.captureId };
        textSavedRef.current = saved;
        setResult(appended);
        requestIdRef.current = null;
        setContent("");
      } else if (!saved) {
        requestIdRef.current ??= crypto.randomUUID();
        const imageOnly = await createImageOnlyExperience({
          requestId: requestIdRef.current,
          entryId: initialEntry?.id ?? result?.entryId ?? null,
          sourceUrl: normalizedSourceUrl,
          title: title.trim() || "未命名经验",
        });
        saved = { entryId: imageOnly.entryId, captureId: null };
        textSavedRef.current = saved;
        setResult(imageOnly);
        requestIdRef.current = null;
      }
      if (!saved) throw new Error("经验记录尚未建立。");

      for (const original of pending) {
        controller.signal.throwIfAborted();
        setImages((current) => current.map((image) => image.localId === original.localId
          ? { ...image, status: "uploading", message: "正在上传原件" }
          : image));
        const target = {
          entryId: original.entryId ?? saved.entryId,
          captureId: original.associationInitialized ? original.captureId : saved.captureId,
        };
        try {
          const completedDocumentId = await uploadAndAttach(
            original,
            target,
            controller.signal,
            (documentId) => {
              setImages((current) => current.map((image) => image.localId === original.localId
                ? { ...image, documentId }
                : image));
            },
          );
          setImages((current) => current.map((image) => image.localId === original.localId
            ? { ...image, status: "saved", documentId: completedDocumentId, message: "图片已保存并关联" }
            : image));
        } catch (uploadError) {
          if (controller.signal.aborted) throw uploadError;
          failedImageCount += 1;
          setImages((current) => current.map((image) => image.localId === original.localId
            ? {
              ...image,
              status: "failed",
              associationInitialized: true,
              entryId: target.entryId,
              captureId: target.captureId,
              message: uploadError instanceof Error ? uploadError.message : "图片保存失败，可重试。",
            }
            : image));
        }
      }

      setNotice(failedImageCount
        ? `文字已保存；${failedImageCount} 张图片未完成，失败项已保留，可再次点击保存重试。`
        : "文字和图片均已保存并关联。");
      setTitle("");
      if (failedImageCount === 0) textSavedRef.current = null;
      setImages((current) => {
        for (const image of current) {
          if (image.status === "saved") {
            URL.revokeObjectURL(image.previewUrl);
            previewUrlsRef.current.delete(image.previewUrl);
          }
        }
        return current.filter((image) => image.status !== "saved");
      });
      router.refresh();
    } catch (saveError) {
      if (controller.signal.aborted) {
        setNotice("保存已取消。已经确认写入的文字和图片不会回滚；未完成项保留在本页。");
        setImages((current) => {
          for (const image of current) {
            if (image.status === "saved") {
              URL.revokeObjectURL(image.previewUrl);
              previewUrlsRef.current.delete(image.previewUrl);
            }
          }
          return current
            .filter((image) => image.status !== "saved")
            .map((image) => image.status === "uploading"
              ? { ...image, status: "failed" as const, message: "保存已取消，可重试。" }
              : image);
        });
      } else {
        const message = saveError instanceof Error ? saveError.message : "";
        setError(message.includes("Minified React error")
          ? "服务器未能完成保存。文字和待上传图片仍在本页，请稍后重试。"
          : message || "保存未完成，请重试。");
      }
    } finally {
      setSaving(false);
      setCancelController(null);
    }
  }

  const saveLabel = saving ? "正在保存…" : images.some((image) => image.status === "failed") ? "重试未完成项" : "保存经验";

  return (
    <div className="experience-library-workspace">
      <PageHeader
        title="经验资料库"
        description="保存你亲手筛选的留学、面试与实习经验。原文只追加，图片与选中文字保持对应。"
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 aria-hidden="true" />AI 设置
            </Button>
            <Button variant="outline" asChild>
              <a href="/api/experience-library/export" download>
                <Download aria-hidden="true" />导出记录
              </a>
            </Button>
          </div>
        )}
      />

      {initialEntry ? (
        <div className="experience-library-resume mt-5">
          <div>
            <span>正在补充</span>
            <strong>{initialEntry.title}</strong>
          </div>
          <Link href="/experience-library" className="ui-link">改为新建</Link>
        </div>
      ) : null}

      <section className="experience-capture-card mt-6" aria-labelledby="experience-capture-title">
        <div className="experience-capture-heading">
          <div>
            <p className="experience-kicker">快速收录</p>
            <h2 id="experience-capture-title">粘贴文字或截图</h2>
          </div>
          <div className="experience-counts" aria-live="polite">
            <span>{content.length.toLocaleString("zh-CN")} 字</span>
            <span>{unsavedCount} 张待处理图片</span>
          </div>
        </div>

        <div className="experience-fields">
          <label>
            <span>来源链接 <small>可选</small></span>
            <Input
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://www.xiaohongshu.com/…"
              disabled={saving || Boolean(initialEntry)}
            />
          </label>
          <label>
            <span>标题 <small>留空则从首行生成</small></span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={240}
              placeholder={suggestedTitle}
              disabled={saving}
            />
          </label>
        </div>

        <div className="experience-text-shell">
          <div className="experience-text-tools">
            <Select
              value={captureType}
              onValueChange={(value) => setCaptureType(value as ExperienceCaptureChoice)}
              disabled={saving}
            >
              <SelectTrigger size="sm" aria-label="内容类型" className="experience-capture-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {captureChoices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>选中一句原文后粘贴图片，可建立精确关联</span>
          </div>
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(event) => {
              if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
            }}
            aria-label="粘贴经验正文或评论"
            placeholder="在这里粘贴正文、评论或图文内容。文字太长也可以直接保存。"
            className="experience-capture-textarea"
            disabled={saving}
          />
        </div>

        <div className="experience-capture-meta">
          <div className="experience-tag-preview">
            {tags.length ? tags.map((tag) => <span key={tag}>#{tag}</span>) : <span>正文中的 #标签 会自动收录</span>}
          </div>
          <label className={cn("experience-file-picker", saving && "is-disabled")}>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              multiple
              disabled={saving}
              className="sr-only"
              onChange={(event) => {
                addFiles([...(event.target.files ?? [])], "file");
                event.currentTarget.value = "";
              }}
            />
            <ImagePlus aria-hidden="true" />选择图片
          </label>
        </div>

        {images.length ? (
          <div className="experience-pending-grid" aria-label="待保存图片">
            {images.map((image, index) => (
              <article key={image.localId} className="experience-pending-image" data-status={image.status}>
                <div className="experience-image-preview">
                  {/* Protected same-origin preview of a local synthetic/user-selected image. */}
                  <img // eslint-disable-line @next/next/no-img-element
                    src={image.previewUrl}
                    alt={image.file.name || `待保存图片 ${index + 1}`}
                  />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="experience-image-caption">
                  <Input
                    value={image.caption}
                    onChange={(event) => {
                      const caption = event.target.value;
                      setImages((current) => current.map((item) => item.localId === image.localId ? { ...item, caption } : item));
                    }}
                    placeholder="按需填写图片说明"
                    maxLength={500}
                    disabled={saving || image.status === "saved"}
                  />
                  <p>{image.message}</p>
                  {image.selectionQuote ? (
                    <blockquote>关联原文：{image.selectionQuote.slice(0, 100)}</blockquote>
                  ) : (
                    <p className="experience-whole-capture">关联到整次粘贴</p>
                  )}
                  <div className="experience-image-actions">
                    <Button type="button" size="sm" variant="ghost" disabled={saving || image.status === "saved"} onClick={() => bindToCurrentSelection(image.localId)}>
                      <Link2 aria-hidden="true" />改绑当前选区
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={saving || image.status === "saved"} onClick={() => removeImage(image.localId)}>
                      <Trash2 aria-hidden="true" />移除
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="experience-drop-hint">
            <Upload aria-hidden="true" />
            <span>Ctrl+V 粘贴截图，或拖入多张图片。只收到链接时不会假装原图已保存。</span>
          </div>
        )}

        {error ? <p className="experience-message is-error" role="alert">{error}</p> : null}
        {notice ? <p className="experience-message" role="status">{notice}</p> : null}
        {result ? (
          <p className="experience-saved-link">
            已保存到 <Link href={`/experience-library/${result.entryId}`} className="ui-link">《{result.title}》</Link>
          </p>
        ) : null}

        <div className="experience-submit-row">
          <p>先保存原文，再上传并关联图片。任何一步失败都不会删除已保存文字。</p>
          <div>
            {saving && cancelController ? (
              <Button type="button" variant="outline" onClick={() => cancelController.abort()}>取消未完成项</Button>
            ) : null}
            <Button type="button" size="lg" onClick={() => void save()} disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {saveLabel}
            </Button>
          </div>
        </div>
      </section>

      <section className="experience-recent mt-8" aria-labelledby="experience-recent-title">
        <header>
          <div>
            <p className="experience-kicker">已收录</p>
            <h2 id="experience-recent-title">最近经验</h2>
          </div>
          <form action="/experience-library" role="search" className="experience-search">
            <Search aria-hidden="true" />
            <Input
              name="q"
              defaultValue={data.query}
              placeholder="搜索标题、正文、评论或标签"
              aria-label="搜索经验资料"
            />
            <Button type="submit" variant="outline">搜索</Button>
          </form>
        </header>

        {!data.available ? (
          <p className="experience-empty">经验资料暂时无法读取。请确认 migration 已应用并稍后刷新。</p>
        ) : data.entries.length === 0 ? (
          <p className="experience-empty">
            {data.query ? `没有找到包含“${data.query}”的经验。` : "还没有保存经验。粘贴第一篇正文或截图即可开始。"}
          </p>
        ) : (
          <div className="experience-recent-list">
            {data.entries.map((entry) => (
              <article key={entry.id} className="experience-recent-row">
                <Link href={`/experience-library/${entry.id}`} className="experience-recent-main">
                  <span className="experience-entry-title">{entry.title}</span>
                  <span className="experience-entry-excerpt">{entry.summary || entry.tags.map((tag) => `#${tag}`).join(" ")}</span>
                  <span className="experience-entry-meta">
                    {entry.captureCount} 次原文 · {entry.mediaCount} 张图片 · {formatDate(entry.updatedAt)}
                  </span>
                </Link>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/experience-library?entry=${entry.id}`}>补充</Link>
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <ExperienceAiSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={aiConfig}
      />
    </div>
  );
}

function ExperienceAiSettingsDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ExperienceAiConfig;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function run(action: (form: FormData) => Promise<void>, success: string) {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await action(form);
        const keyInput = formRef.current?.elements.namedItem("api_key");
        if (keyInput instanceof HTMLInputElement) keyInput.value = "";
        setMessage(success);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "操作未完成。");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>经验资料库 AI</DialogTitle>
          <DialogDescription>
            只在你主动点击“AI 整理”时发送当前经验的原始文字；不发送图片。Key 仅在服务端加密保存。
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} className="grid gap-4">
          <div className="experience-settings-field">
            <span>Provider</span>
            <Select name="provider" defaultValue={config.provider ?? "deepseek"} disabled={pending}>
              <SelectTrigger aria-label="Provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek">DeepSeek</SelectItem>
                <SelectItem value="qwen">Qwen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="experience-settings-field">
            <span>模型 ID</span>
            <Input
              name="model_id"
              defaultValue={config.modelId ?? "deepseek-chat"}
              placeholder="例如 deepseek-chat 或 qwen-plus"
              disabled={pending}
            />
          </label>
          <label className="experience-settings-field">
            <span>API Key</span>
            <Input
              name="api_key"
              type="password"
              autoComplete="off"
              placeholder={config.configured ? "留空则保留当前 Key" : "粘贴 API Key"}
              disabled={pending}
            />
          </label>
          {config.configured ? (
            <p className="text-xs text-[var(--text-tertiary)]">
              已配置 {config.provider} · {config.modelId}
              {config.lastTestedAt ? ` · 上次测试 ${formatDate(config.lastTestedAt)}` : ""}
            </p>
          ) : null}
          {message ? <p className="experience-message" role="status">{message}</p> : null}
          {error ? <p className="experience-message is-error" role="alert">{error}</p> : null}
          <DialogFooter className="-mx-5 -mb-5">
            {config.configured ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => startTransition(async () => {
                  try {
                    await removeExperienceAiSettings();
                    setMessage("已移除 AI 设置。");
                  } catch (removeError) {
                    setError(removeError instanceof Error ? removeError.message : "移除失败。");
                  }
                })}
              >
                移除 Key
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(testExperienceAiSettings, "连接测试成功。")}>
              测试连接
            </Button>
            <Button type="button" disabled={pending} onClick={() => run(saveExperienceAiSettings, "AI 设置已保存。")}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              保存设置
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
