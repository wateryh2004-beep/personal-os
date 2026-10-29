"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  findExistingExperience,
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
import { mapWithConcurrency } from "@/features/experience-library/parallel-upload";
import { recognizeExperienceImage } from "@/features/experience-library/browser-image-ocr";
import { uploadExperienceChunks } from "@/features/experience-library/chunks-client";
import { experienceDraftSchema, type ExperienceDraft } from "@/features/experience-library/draft";
import { loadWorkspaceSession, removeWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

type WorkspaceData = {
  available: boolean;
  readingUnavailable?: boolean;
  query: string;
  entries: ExperienceEntrySummary[];
  total: number;
  captureTotal: number;
  mediaTotal: number;
  page?: number;
  hasMore?: boolean;
  tags?: string[];
  filters?: { tag?: string; status?: string; hasMedia?: boolean; analyzed?: boolean; sort?: string };
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

function experiencePageHref(data: WorkspaceData, page: number, remove?: string) {
  const query = new URLSearchParams();
  if (data.query) query.set("q", data.query);
  if (data.filters?.tag) query.set("tag", data.filters.tag);
  if (data.filters?.status) query.set("status", data.filters.status);
  if (data.filters?.hasMedia) query.set("media", "1");
  if (data.filters?.analyzed) query.set("analyzed", "1");
  if (data.filters?.sort === "created") query.set("sort", "created");
  if (page > 1) query.set("page", String(page));
  if (remove) query.delete(remove);
  return `/experience-library${query.size ? `?${query}` : ""}`;
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
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [cancelController, setCancelController] = useState<AbortController | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppendExperienceResult | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [targetEntry, setTargetEntry] = useState(initialEntry);
  const [duplicate, setDuplicate] = useState<InitialEntry>(null);
  const [reselectCount, setReselectCount] = useState(0);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const textSavedRef = useRef<{ entryId: string; captureId: string | null } | null>(null);
  const previewUrlsRef = useRef(new Set<string>());
  const lookupSequence = useRef(0);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const ocrControllerRef = useRef<AbortController | null>(null);
  const ocrQueueRef = useRef<{ file: File; documentId: string }[]>([]);
  const draftKey = `experience-library:${initialEntry?.id ?? "new"}`;

  const suggestedTitle = useMemo(() => suggestExperienceTitle(content), [content]);
  const tags = useMemo(() => extractExperienceTags(content), [content]);
  const unsavedCount = images.filter((image) => image.status !== "saved").length;
  const visibleCompareIds = selectedCompareIds.filter((id) => data.entries.some((entry) => entry.id === id));
  const hasUnsaved = Boolean(content || unsavedCount || reselectCount || saving || (sourceUrl && sourceUrl !== targetEntry?.sourceUrl) || (title && title !== targetEntry?.title));

  useEffect(() => () => { cancelController?.abort(); }, [cancelController]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; ocrControllerRef.current?.abort(); ocrQueueRef.current = []; };
  }, []);

  function queueRecognition(jobs: { file: File; documentId: string }[]) {
    ocrQueueRef.current.push(...jobs);
    if (ocrControllerRef.current || !ocrQueueRef.current.length) return;
    const controller = new AbortController();
    ocrControllerRef.current = controller;
    setOcrRunning(true);
    void (async () => {
      let completed = 0, failed = 0, unsupported = 0;
      while (ocrQueueRef.current.length && !controller.signal.aborted) {
        const job = ocrQueueRef.current.shift()!;
        if (mountedRef.current) setOcrNotice(`图片已保存，正在识别文字（已完成 ${completed} 张，剩余 ${ocrQueueRef.current.length + 1} 张）。你可以继续收录；离开页面会停止识别，之后可在详情页重试。`);
        try {
          const result = await recognizeExperienceImage(job.file, job.documentId, controller.signal, () => {});
          if (result === "completed") completed += 1; else unsupported += 1;
        } catch { if (!controller.signal.aborted) failed += 1; }
      }
      const stopped = controller.signal.aborted;
      ocrControllerRef.current = null;
      if (mountedRef.current) {
        setOcrRunning(false);
        setOcrNotice(stopped ? `已停止识别；${completed} 张已识别，其余图片可在详情页识别。` : `图片已保存；${completed} 张的文字已加入搜索。${failed ? `${failed} 张识别未完成，可在详情页重试。` : ""}${unsupported ? `${unsupported} 张格式暂不支持文字识别。` : ""}`);
        if (completed) router.refresh();
        // A later save may have queued new images while an earlier run stopped.
        if (ocrQueueRef.current.length) queueRecognition([]);
      }
    })();
  }
  useEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    const saved = experienceDraftSchema.safeParse(loadWorkspaceSession<unknown>(draftKey));
    if (saved.success) {
      const draft = saved.data;
      // The owner-scoped shell clears these same-tab snapshots on identity change.
      setTitle(draft.title); setSourceUrl(draft.sourceUrl); setContent(draft.content); setCaptureType(draft.captureType);
      setReselectCount(draft.pendingImages); requestIdRef.current = draft.requestId;
      if (draft.savedTarget) {
        textSavedRef.current = { entryId: draft.savedTarget.entryId, captureId: draft.savedTarget.captureId };
        setResult({ ...draft.savedTarget, createdEntry: false, appended: Boolean(draft.savedTarget.captureId) });
        setTargetEntry({ id: draft.savedTarget.entryId, title: draft.savedTarget.title, sourceUrl: draft.sourceUrl || null });
      }
      setNotice(draft.pendingImages ? `已恢复未完成的文字；请重新选择此前的 ${draft.pendingImages} 张图片，并核对图片关联。` : "已恢复未完成的文字。");
    }
    setRecoveryReady(true);
  }, [draftKey]);

  useEffect(() => {
    if (!recoveryReady) return;
    if (!hasUnsaved) { removeWorkspaceSession(draftKey); return; }
    const target = textSavedRef.current;
    const draft: ExperienceDraft = {
      title, sourceUrl, content, captureType,
      pendingImages: Math.min(200, unsavedCount + reselectCount),
      savedTarget: target ? { ...target, title: (result?.title ?? title) || "未命名经验" } : null,
      requestId: requestIdRef.current,
    };
    const timer = window.setTimeout(() => saveWorkspaceSession(draftKey, draft), 350);
    return () => window.clearTimeout(timer);
  }, [captureType, content, draftKey, hasUnsaved, recoveryReady, reselectCount, result, sourceUrl, title, unsavedCount, saving]);

  useEffect(() => {
    if (!hasUnsaved) return;
    const persist = () => {
      const target = textSavedRef.current;
      saveWorkspaceSession(draftKey, {
        title, sourceUrl, content, captureType, pendingImages: Math.min(200, unsavedCount + reselectCount),
        savedTarget: target ? { ...target, title: (result?.title ?? title) || "未命名经验" } : null,
        requestId: requestIdRef.current,
      } satisfies ExperienceDraft);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { persist(); event.preventDefault(); event.returnValue = ""; };
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.download) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin === window.location.origin && destination.href === window.location.href) return;
      persist();
      if (!window.confirm(saving ? "图片仍在保存，离开会中断上传。确定离开吗？" : "有未完成的内容。离开后文字会暂时保留，图片需重新选择。确定离开吗？")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardLink, true); };
  }, [captureType, content, draftKey, hasUnsaved, reselectCount, result, saving, sourceUrl, title, unsavedCount]);

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
    const seen = new Set(images.map((image) => fileKey(image.file)));
    const newCount = imageFiles.filter((file) => {
      const key = fileKey(file);
      if (file.size > 15 * 1024 * 1024 || seen.has(key)) return false;
      seen.add(key); return true;
    }).length;
    setReselectCount((remaining) => Math.max(0, remaining - newCount));
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

  async function uploadImage(
    image: PendingImage,
    signal: AbortSignal,
    onDocumentPrepared: (documentId: string) => void,
    onProgress: (message: string) => void,
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
      const throughApp = image.file.size <= 4 * 1024 * 1024;
      if (throughApp) {
        const sent = await fetch("/api/experience-library/upload-bytes", {
          method: "POST", headers: { "Content-Type": image.file.type, "X-Experience-Document-Id": documentId }, body: image.file, signal,
        });
        if (!sent.ok) { const payload = await json(sent); throw new Error(typeof payload.error === "string" ? payload.error : "图片未传入私有存储，请重试。"); }
      } else {
        await uploadExperienceChunks(image.file, documentId, signal, (done, total) => onProgress(`正在上传图片 ${done}/${total}`));
        onProgress("正在核验图片原件");
        const assembled = await fetch("/api/experience-library/upload-chunks", { method: "PATCH", headers: { "X-Experience-Document-Id": documentId }, signal });
        if (!assembled.ok) { const payload = await json(assembled); throw new Error(typeof payload.error === "string" ? payload.error : "图片原件校验未完成，请重试。"); }
      }
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
    return documentId;
  }

  async function save() {
    if (savingRef.current) return;
    const pending = images.filter((image) => image.status !== "saved");
    if (!content.trim() && !pending.length) {
      setError("请先粘贴文字、评论或图片。");
      return;
    }
    if (reselectCount > 0) {
      setError(`还有 ${reselectCount} 张此前的图片需要重新选择，或明确选择暂不恢复。`);
      return;
    }
    let normalizedSourceUrl: string | null;
    try {
      normalizedSourceUrl = normalizeExperienceSourceUrl(sourceUrl);
    } catch {
      setError("来源链接格式不正确。请填写以 http:// 或 https:// 开头的完整链接，或清空后保存。");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    setCancelController(controller);
    let saved = content.trim() ? null : textSavedRef.current;
    let failedImageCount = 0;
    const recognitionJobs: { file: File; documentId: string }[] = [];
    try {
      if (!targetEntry && !saved && normalizedSourceUrl) {
        const existing = await findExistingExperience(normalizedSourceUrl).catch(() => null);
        if (existing) {
          setDuplicate(existing);
          setNotice("这篇已收录。请选择“补充到这篇”后继续保存，原文和图片仍保留在本页。");
          return;
        }
      }
      if (content.trim() && !saved) {
        requestIdRef.current ??= crypto.randomUUID();
        const appended = await appendExperienceCapture({
          requestId: requestIdRef.current,
          entryId: targetEntry?.id ?? null,
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
          entryId: targetEntry?.id ?? null,
          sourceUrl: normalizedSourceUrl,
          title: title.trim() || "未命名经验",
        });
        saved = { entryId: imageOnly.entryId, captureId: null };
        textSavedRef.current = saved;
        setResult(imageOnly);
        requestIdRef.current = null;
      }
      if (!saved) throw new Error("经验记录尚未建立。");

      // Upload originals concurrently, while attaching ready images in the
      // user's selection order. Never dispatch two position writes at once.
      const currentTarget = saved;
      type UploadResult = { original: PendingImage; target: { entryId: string; captureId: string | null }; documentId: string | null; error: string | null };
      const ready = new Map<number, UploadResult>();
      let nextAttachment = 0;
      let attachmentQueue = Promise.resolve();
      async function attach(item: UploadResult) {
        if (controller.signal.aborted) return;
        try {
          if (!item.documentId) throw new Error(item.error || "图片保存失败，可重试。");
          await attachExperienceMedia({
            entryId: item.target.entryId, captureId: item.target.captureId, documentId: item.documentId,
            selectionStart: item.original.selectionStart, selectionEnd: item.original.selectionEnd,
            selectionQuote: item.original.selectionQuote, caption: item.original.caption || null, sourceKind: item.original.sourceKind,
          });
          if (item.original.file.size > 4 * 1024 * 1024) {
            void fetch("/api/experience-library/upload-chunks", { method: "DELETE", headers: { "X-Experience-Document-Id": item.documentId } }).catch(() => {});
          }
          recognitionJobs.push({ file: item.original.file, documentId: item.documentId });
          setImages((current) => current.map((image) => image.localId === item.original.localId
            ? { ...image, status: "saved", documentId: item.documentId, message: "图片已保存并关联" } : image));
        } catch (error) {
          if (controller.signal.aborted) return;
          failedImageCount += 1;
          setImages((current) => current.map((image) => image.localId === item.original.localId
            ? { ...image, status: "failed", associationInitialized: true, entryId: item.target.entryId,
              captureId: item.target.captureId, message: error instanceof Error ? error.message : "图片关联未完成，可重试。" } : image));
        }
      }
      const imageConcurrency = pending.every((image) => image.file.size <= 4 * 1024 * 1024) ? 4 : 3;
      await mapWithConcurrency(pending, imageConcurrency, async (original): Promise<UploadResult> => {
        const target = {
          entryId: original.entryId ?? currentTarget.entryId,
          captureId: original.associationInitialized ? original.captureId : currentTarget.captureId,
        };
        if (controller.signal.aborted) return { original, target, documentId: null, error: "保存已取消，可重试。" };
        setImages((current) => current.map((image) => image.localId === original.localId
          ? { ...image, status: "uploading", message: "正在上传原件", associationInitialized: true, entryId: target.entryId, captureId: target.captureId }
          : image));
        try {
          const documentId = await uploadImage(original, controller.signal,
            (id) => setImages((current) => current.map((image) => image.localId === original.localId ? { ...image, documentId: id } : image)),
            (message) => setImages((current) => current.map((image) => image.localId === original.localId ? { ...image, message } : image)));
          return { original, target, documentId, error: null };
        } catch (error) {
          return { original, target, documentId: null, error: error instanceof Error ? error.message : "图片保存失败，可重试。" };
        }
      }, (item, index) => {
        ready.set(index, item);
        while (ready.has(nextAttachment)) {
          const next = ready.get(nextAttachment)!;
          ready.delete(nextAttachment++);
          attachmentQueue = attachmentQueue.then(() => attach(next));
        }
      });
      await attachmentQueue;
      controller.signal.throwIfAborted();
      setNotice(failedImageCount
        ? `文字已保存；${failedImageCount} 张图片未完成，失败项已保留，可再次点击保存重试。`
        : pending.length ? "文字和图片均已保存并关联。图片文字会在本机继续识别。" : "原文已保存。");
      queueRecognition(recognitionJobs);
      if (failedImageCount === 0) {
        textSavedRef.current = null;
        setTitle(""); setSourceUrl(""); setTargetEntry(null); setDuplicate(null); setReselectCount(0);
        removeWorkspaceSession(draftKey);
        if (initialEntry) router.replace("/experience-library");
      }
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
        setNotice("保存已取消。已经确认写入的文字和图片不会回滚；未完成项保留在本页，已保存图片可在详情页识别文字。");
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
      savingRef.current = false;
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

      {targetEntry ? (
        <div className="experience-library-resume mt-5">
          <div>
            <span>正在补充</span>
            <strong>{targetEntry.title}</strong>
          </div>
          <Button type="button" variant="ghost" disabled={Boolean(initialEntry && hasUnsaved)} title={initialEntry && hasUnsaved ? "请先保存当前内容，再新建经验" : undefined} onClick={() => { setTargetEntry(null); setSourceUrl(""); setTitle(""); setDuplicate(null); if (initialEntry) router.replace("/experience-library"); }}>改为新建</Button>
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
              onChange={(event) => { lookupSequence.current += 1; setDuplicate(null); setSourceUrl(event.target.value); }}
              onBlur={() => {
                const current = sourceUrl; const sequence = ++lookupSequence.current;
                if (!current.trim() || targetEntry) return;
                void findExistingExperience(current).then((found) => { if (lookupSequence.current === sequence) setDuplicate(found); }).catch(() => {});
              }}
              placeholder="https://www.xiaohongshu.com/…"
              disabled={saving || Boolean(targetEntry)}
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

        {duplicate && !targetEntry ? <div className="experience-library-resume mt-3" role="status"><div><span>这篇已收录</span><strong>{duplicate.title}</strong></div><Button type="button" variant="outline" onClick={() => { setTargetEntry(duplicate); setTitle(duplicate.title); setSourceUrl(duplicate.sourceUrl ?? ""); setDuplicate(null); }}>补充到这篇</Button></div> : null}

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
        {ocrNotice ? <div className="experience-message" role="status">{ocrNotice} {ocrRunning ? <Button type="button" variant="ghost" size="sm" onClick={() => { ocrQueueRef.current = []; ocrControllerRef.current?.abort(); }}>停止识别</Button> : null}</div> : null}
        {reselectCount > 0 ? <div className="experience-message" role="status">还有 {reselectCount} 张图片需要重新选择；请重新核对图片关联的位置。<Button type="button" variant="ghost" size="sm" onClick={() => setReselectCount(0)}>暂不恢复这些图片</Button></div> : null}
        {result ? (
          <div className="experience-saved-link flex flex-wrap items-center gap-3">
            <span>已保存到《{result.title}》</span>
            <Link href={`/experience-library/${result.entryId}`} className="ui-link">查看刚保存的内容</Link>
            {!unsavedCount && !reselectCount ? <Button type="button" variant="outline" size="sm" onClick={() => { setResult(null); setNotice(null); textareaRef.current?.focus(); }}>继续收录下一篇</Button> : null}
          </div>
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
        </header>
          <form key={JSON.stringify([data.query, data.filters])} action="/experience-library" role="search" className="experience-filters">
          <div className="experience-search">
            <Search aria-hidden="true" />
            <Input
              name="q"
              defaultValue={data.query}
              placeholder="搜索标题、正文、评论或标签"
              aria-label="搜索经验资料"
            />
            <Button type="submit" variant="outline">搜索</Button>
          </div>
          <div className="experience-filter-controls">
            <label>标签 <select name="tag" defaultValue={data.filters?.tag ?? ""}><option value="">全部标签</option>{(data.tags ?? []).map((tag) => <option value={tag} key={tag}>{tag}</option>)}</select></label>
            <label>标记 <select name="status" defaultValue={data.filters?.status ?? ""}><option value="">全部标记</option><option value="unmarked">未标记</option><option value="to_read">待看</option><option value="useful">值得参考</option><option value="outdated">已过时</option></select></label>
            <label>排序 <select name="sort" defaultValue={data.filters?.sort === "created" ? "created" : "updated"}><option value="updated">最近更新</option><option value="created">最近收录</option></select></label>
            <label><input type="checkbox" name="media" value="1" defaultChecked={data.filters?.hasMedia} /> 有图片</label>
            <label><input type="checkbox" name="analyzed" value="1" defaultChecked={data.filters?.analyzed} /> 已 AI 整理</label>
            <Button type="submit" variant="outline" size="sm">应用筛选</Button>
            <Link href="/experience-library" className="ui-link">清除</Link>
          </div></form>

        {data.readingUnavailable ? <p className="experience-message" role="status">阅读版状态暂时无法读取，原文收录仍可使用。</p> : null}
        {data.query || data.filters?.tag || data.filters?.status || data.filters?.hasMedia || data.filters?.analyzed ? <div className="experience-applied-filters" aria-label="当前搜索和筛选">
          {data.query ? <Link href={experiencePageHref(data, 1, "q")}>关键词：{data.query} ×</Link> : null}
          {data.filters?.tag ? <Link href={experiencePageHref(data, 1, "tag")}>#{data.filters.tag} ×</Link> : null}
          {data.filters?.status ? <Link href={experiencePageHref(data, 1, "status")}>标记：{data.filters.status} ×</Link> : null}
          {data.filters?.hasMedia ? <Link href={experiencePageHref(data, 1, "media")}>有图片 ×</Link> : null}
          {data.filters?.analyzed ? <Link href={experiencePageHref(data, 1, "analyzed")}>已 AI 整理 ×</Link> : null}
        </div> : null}

        {!data.available ? (
          <p className="experience-empty">经验资料暂时无法读取。请确认 migration 已应用并稍后刷新。</p>
        ) : data.entries.length === 0 ? (
          <p className="experience-empty">
            {data.readingUnavailable ? <p className="experience-message" role="status">阅读版状态暂时无法读取，原文收录仍可使用。</p> : null}
        {data.query || data.filters?.tag || data.filters?.status || data.filters?.hasMedia || data.filters?.analyzed ? "没有找到符合条件的经验，请调整搜索或筛选。" : "还没有保存经验。粘贴第一篇正文或截图即可开始。"}
          </p>
        ) : (
          <div className="experience-recent-list">
            {data.entries.map((entry) => (
              <article key={entry.id} className="experience-recent-row">
                <label className="experience-compare-checkbox"><input type="checkbox" checked={visibleCompareIds.includes(entry.id)} aria-label={`对照《${entry.title}》`} disabled={!visibleCompareIds.includes(entry.id) && visibleCompareIds.length >= 3} onChange={(event) => setSelectedCompareIds((current) => event.target.checked ? [...current, entry.id].slice(0, 3) : current.filter((id) => id !== entry.id))} /></label>
                <Link href={`/experience-library/${entry.id}${data.query ? `?q=${encodeURIComponent(data.query)}` : ""}`} className="experience-recent-main">
                  <span className="experience-entry-title">{entry.title}</span>
                  <span className="experience-entry-excerpt">{entry.matchExcerpt || entry.summary || entry.tags.map((tag) => `#${tag}`).join(" ")}</span>
                  <span className="experience-entry-meta">
                    {entry.reviewStatus && entry.reviewStatus !== "unmarked" ? `${{ to_read: "待看", useful: "值得参考", outdated: "已过时" }[entry.reviewStatus]} · ` : ""}{entry.readingCount ? `${entry.readingCount} 篇阅读版 · ` : ""}{entry.pendingDeleteCount ? `${entry.pendingDeleteCount === entry.readingCount ? "整条待删除" : `${entry.pendingDeleteCount} 篇待删除`} · ` : ""}{entry.captureCount} 次原文 · {entry.mediaCount} 张图片 · {formatDate(entry.updatedAt)}
                  </span>
                </Link>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/experience-library?entry=${entry.id}`}>补充</Link>
                </Button>
              </article>
            ))}
          </div>
        )}
        {visibleCompareIds.length ? <div className="experience-compare-selection"><span>已选 {visibleCompareIds.length} 篇（最多 3 篇）</span>{visibleCompareIds.length >= 2 ? <Link className="ui-action-secondary" href={`/experience-library/compare?ids=${visibleCompareIds.join(",")}`}>并排对照</Link> : <span>再选一篇即可对照</span>}<Button type="button" variant="ghost" size="sm" onClick={() => setSelectedCompareIds([])}>清除选择</Button></div> : null}
        {data.page && (data.page > 1 || data.hasMore) ? <nav className="experience-pagination" aria-label="经验资料翻页">
          {data.page > 1 ? <Link className="ui-link" href={experiencePageHref(data, data.page - 1)}>上一页</Link> : <span />}
          <span>第 {data.page} 页</span>
          {data.hasMore ? <Link className="ui-link" href={experiencePageHref(data, data.page + 1)}>下一页</Link> : <span />}
        </nav> : null}
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
