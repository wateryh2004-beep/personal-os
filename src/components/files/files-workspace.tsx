"use client";

import Link from "next/link";
import { FileOcrControl } from "./file-ocr-control";
import { WorkspaceReadyMetric } from "@/components/performance/workspace-ready-metric";
import { FileResumableUploads } from "./file-resumable-uploads";
import { uploadMultipartFile, completeMultipartSession } from "@/features/files/multipart-client";
import { multipartThreshold, type MultipartSnapshot } from "@/features/files/multipart-upload";
import { checksumFile } from "@/features/files/file-checksum";
import { FilePdfCover } from "./file-pdf-cover";
import { FilePdfPreview } from "./file-pdf-preview";
import { isPdfFile } from "@/features/files/preview-format";
import { FilePhoto } from "./file-photo";
import { classifyFile, defaultFileBrowserState, fileBrowserUrl, filesPerPage, revealFileState, fileSortLabels, fileSorts, fileTypeLabels, fileTypes, parseFileBrowserState, selectFiles, type FileBrowserState } from "@/features/files/browser-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileRecoveryPanel } from "./file-recovery-panel";
import { FileMutationForm } from "./file-mutation-form";
import { useFileRows } from "./use-file-rows";
import { createUploadProgress } from "@/features/files/upload-progress";
import { completeFileUpload } from "@/features/files/complete-upload";
import { canUpload, maxFileSize } from "@/features/files/schemas";
import { runUploadBatch } from "@/features/files/upload-batch";

import { Archive, Download, Eye, File, FilePlus2, Folder, FolderPlus, LoaderCircle, MoreHorizontal, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { archiveFile, createFileFolder, moveFile, renameFile, restoreFile, setFileAiVisibility } from "@/features/files/actions";
import { directUploadFailureMessage } from "@/features/files/r2-errors";
import type { FileFolder, FileRecord } from "@/features/files/queries";
import { useMobileBackLayer } from "@/lib/mobile/use-mobile-back-layer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActionFeedback } from "@/components/shared/action-feedback";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function folderDepth(folder: FileFolder, all: FileFolder[]) {
  let cursor = folder; let depth = 0; const seen = new Set<string>();
  while (cursor.parent_id && !seen.has(cursor.parent_id)) { seen.add(cursor.parent_id); const next = all.find((item) => item.id === cursor.parent_id); if (!next) break; cursor = next; depth += 1; }
  return depth;
}

type UploadStage = "idle" | "preparing" | "uploading" | "verifying" | "extracting" | "complete" | "error";
type ApiError = { error?: string };
const emptyFiles: FileRecord[] = [];

async function responseError(response: Response, fallback: string) {
  try { const value = await response.json() as ApiError; return value.error || fallback; } catch { return fallback; }
}

function uploadToR2(url: string, file: File, onProgress: (value: number) => void, signal: AbortSignal) {
  return new Promise<number | null>((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url); request.timeout = 300_000; request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    request.onloadend = () => signal.removeEventListener("abort", abort);
    request.onload = () => resolve(request.status);
    request.onerror = () => resolve(null);
    request.onabort = () => resolve(null);
    request.ontimeout = () => resolve(null);
    if (signal.aborted) { resolve(null); signal.removeEventListener("abort", abort); return; }
    request.send(file);
  });
}

async function browserR2NetworkMessage() {
  try {
    const response = await fetch("/api/files/storage-health", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const health = await response.json() as { credentialsReachR2?: boolean };
    if (response.ok && health.credentialsReachR2) return "无法连接 Cloudflare R2。服务器可以访问 R2，但浏览器直传失败，请检查 R2 Bucket CORS 是否允许当前网站 Origin。";
  } catch { /* The primary CORS diagnosis remains useful even if diagnostics are unavailable. */ }
  return directUploadFailureMessage(null);
}

function FileOperations({ file, folders, onArchive }: { file: FileRecord; folders: FileFolder[]; onArchive: (file: FileRecord) => void }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  useMobileBackLayer(open, close, `file-operations:${file.id}`);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label={`操作 ${file.title}`} className="pressable flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><MoreHorizontal size={15} /></button></PopoverTrigger>
    <PopoverContent aria-label={`操作 ${file.title}`} align="end" collisionPadding={12} onOpenAutoFocus={(event) => { if (window.matchMedia("(pointer: coarse)").matches) event.preventDefault(); }} className="files-actions-popover w-60 max-h-[min(65dvh,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain">
      <FileMutationForm action={renameFile} onSuccess={close} className="space-y-2"><input aria-label="文件名称" name="title" required maxLength={240} defaultValue={file.title} className="h-8 w-full rounded-[8px] bg-[var(--surface-control)] px-2.5 text-[11.5px] outline-none" /><input type="hidden" name="document_id" value={file.id} /><button className="text-[10.5px] font-medium text-[var(--accent)]">重命名</button></FileMutationForm>
      <FileMutationForm action={moveFile} onSuccess={close} className="mt-2 border-t border-[var(--separator)] pt-2"><input type="hidden" name="document_id" value={file.id} /><select aria-label="目标文件夹" name="folder_id" defaultValue={file.folder_id ?? ""} className="h-8 w-full rounded-[8px] bg-[var(--surface-control)] px-2 text-[11.5px] outline-none"><option value="">根目录</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{"　".repeat(folderDepth(folder, folders))}{folder.name}</option>)}</select><button className="mt-1.5 text-[10.5px] font-medium text-[var(--accent)]">移动文件</button></FileMutationForm>
      <FileMutationForm action={setFileAiVisibility} onSuccess={close} className="mt-2 border-t border-[var(--separator)] pt-2"><input type="hidden" name="document_id" value={file.id}/><select aria-label="文件 AI 可见性" name="ai_visibility" defaultValue={file.ai_visibility} className="h-8 w-full rounded-[8px] bg-[var(--surface-control)] px-2 text-[11.5px] outline-none"><option value="normal">AI 可正常使用</option><option value="sensitive">敏感：默认不发送</option><option value="never">永不发送给 AI</option></select><button className="mt-1.5 text-[10.5px] font-medium text-[var(--accent)]">保存隐私设置</button></FileMutationForm>
      <button type="button" onClick={() => { close(); onArchive(file); }} className="mt-2 inline-flex items-center gap-1 border-t border-[var(--separator)] pt-2 text-[10.5px] text-[var(--danger)]"><Archive size={12} />归档</button>

    </PopoverContent>
  </Popover>;
}

export function FilesWorkspace({ folders, files, archivedFiles = emptyFiles, initialUpload = false, initialFileId, initialBrowserState = defaultFileBrowserState }: { folders: FileFolder[]; files: FileRecord[]; archivedFiles?: FileRecord[]; initialUpload?: boolean; initialFileId?: string; initialBrowserState?: FileBrowserState }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadInFlight = useRef(false);
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => uploadController.current?.abort(), []);
  const [browser, setBrowser] = useState<FileBrowserState>(() => initialFileId ? revealFileState(files, initialBrowserState, initialFileId) : initialBrowserState);
  const [folderId, setFolderId] = useState<string | null>(browser.folderId);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [archivedLimit, setArchivedLimit] = useState(filesPerPage);
  const [highlightId, setHighlightId] = useState<string | null>(initialFileId && files.some((item) => item.id === initialFileId) ? initialFileId : null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewLauncher = useRef<HTMLElement | null>(null);
  function changeBrowser(patch: Partial<FileBrowserState>, replace = false) {
    const resetPage = patch.folderId !== undefined || patch.query !== undefined || patch.type !== undefined || patch.sort !== undefined;
    const next = { ...browser, folderId, ...(resetPage ? { page: 1 } : {}), ...patch };
    setBrowser(next); setFolderId(next.folderId);
    const url = fileBrowserUrl(window.location.href, next);
    if (replace) window.history.replaceState(window.history.state, "", url);
    else window.history.pushState(window.history.state, "", url);
    if (patch.page !== undefined) sectionRef.current?.scrollTo?.({ top: 0 });
  }
  const [stage, setStage] = useState<UploadStage>("idle");
  const uploadBusy = ["preparing", "uploading", "verifying", "extracting"].includes(stage);
  const [fileRows, setFileRows] = useFileRows(files, uploadBusy);
  const [archivedRows, setArchivedRows] = useFileRows(archivedFiles);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const { show } = useActionFeedback();
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => folderDepth(a, folders) - folderDepth(b, folders) || a.name.localeCompare(b.name, "zh-CN")), [folders]);
  const selection = useMemo(() => selectFiles(fileRows, { ...browser, folderId }), [fileRows, browser, folderId]);
  const visibleFiles = selection.visible;
  const totalPages = Math.max(1, Math.ceil(visibleFiles.length / filesPerPage));
  const currentPage = Math.min(browser.page, totalPages);
  const displayedFiles = visibleFiles.slice((currentPage - 1) * filesPerPage, currentPage * filesPerPage);
  const visibleArchived = useMemo(() => selectFiles(archivedRows, { ...browser, folderId: null }).visible, [archivedRows, browser]);
  const previewFile = fileRows.find(file => file.id === previewId) ?? null;
  const filtering = Boolean(browser.query || browser.type !== "all");
  useEffect(() => {
    const restoreBrowser = () => {
      const params = new URLSearchParams(window.location.search);
      let next = parseFileBrowserState(params);
      const linked = fileRows.find(file => file.id === params.get("file"));
      if (linked) next = revealFileState(fileRows, next, linked.id);
      setBrowser(next); setFolderId(next.folderId);
      if (linked) setHighlightId(linked.id);
    };
    window.addEventListener("popstate", restoreBrowser);
    return () => window.removeEventListener("popstate", restoreBrowser);
  }, [fileRows]);
  const activeFolder = folders.find((folder) => folder.id === folderId);
  useEffect(() => { if (initialUpload) inputRef.current?.click(); }, [initialUpload]);
  useEffect(() => {
    if (!uploadBusy) return;
    const protectUpload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectUpload);
    return () => window.removeEventListener("beforeunload", protectUpload);
  }, [uploadBusy]);
  // 跨实体内链跳转：/files?file={id}。初始即切到文件所在文件夹，短暂高亮定位。
  const [selectionSource, setSelectionSource] = useState(initialFileId);
  if (selectionSource !== initialFileId) {
    setSelectionSource(initialFileId);
    const selected = files.find((file) => file.id === initialFileId);
    if (selected) { setFolderId(selected.folder_id); setBrowser(revealFileState(files, browser, selected.id)); setHighlightId(selected.id); }
  }
  useEffect(() => {
    if (!highlightId) return;
    const frame = requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(`file-${highlightId}`)?.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    });
    const timer = window.setTimeout(() => setHighlightId(null), 2600);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [highlightId]);

  async function upload(filesToUpload: FileList | File[] | null, resume?: MultipartSnapshot) {
    if (!filesToUpload?.length || uploadInFlight.current) return;
    uploadInFlight.current = true;
    const controller = new AbortController(); uploadController.current = controller;
    setStage("preparing"); setProgress(0); setMessage(""); setMessageTone("neutral");
    const batch = Array.from(filesToUpload);
    const calculateProgress = createUploadProgress(batch.map((file) => file.size));
    let uploadedCount = 0;
    let extractionDeferred = false;
    let auditWarning = false;
    const updateProgress = (index: number, value: number) => {
      // Uploaded bytes still need a successful server confirmation.
      setProgress(Math.min(99, calculateProgress(index, value)));
    };
    try {
      const result = await runUploadBatch(batch, async (file, index) => {
        if (!canUpload(file.name, file.type || "application/octet-stream", file.size)) {
          throw new Error(file.size > maxFileSize ? `${file.name} 超过 100 MB，请选择较小的文件。` : `${file.name} 为空或不支持上传，请检查文件类型。`);
        }
        controller.signal.throwIfAborted();
        let payload: { documentId?: string; uploadUrl?: string; resumed?: boolean; error?: string; file?: { id: string; title: string; originalFilename: string; mimeType: string; fileSize: number; folderId: string | null; textExtractionStatus: FileRecord["text_extraction_status"] } };
        if (file.size >= multipartThreshold || resume) {
          setStage("uploading");
          payload = await uploadMultipartFile(file, { folderId, resume, signal: controller.signal, onProgress: value => updateProgress(index, value) });
        } else {
          const checksum = await checksumFile(file, controller.signal);
          const created = await fetch("/api/files/upload-url", { method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, folderId, checksum }) });
          try { payload = await created.json() as typeof payload; } catch { throw new Error("上传准备服务返回无效响应，请稍后重试。"); }
          if (!created.ok || !payload.documentId || !payload.uploadUrl) throw new Error(payload.error || "上传准备失败。");
          setStage("uploading");
          const status = await uploadToR2(payload.uploadUrl, file, (value) => updateProgress(index, value), controller.signal);
          if (status === null) throw new Error(controller.signal.aborted ? "上传已暂停，可重新选择原文件重试。" : await browserR2NetworkMessage());
          if (status < 200 || status >= 300) throw new Error(directUploadFailureMessage(status));
        }
        if (!payload.documentId) throw new Error("上传标识缺失，请刷新检查。");
        if (batch.length === 1) setStage("verifying");
        const completed = await completeFileUpload(payload.documentId);
        if (!completed.ok) throw new Error(await responseError(completed, "文件上传后未能确认。"));
        const verification = await completed.json() as { extractionStatus?: FileRecord["text_extraction_status"]; warning?: string };
        if (verification.warning) auditWarning = true;
        if (payload.file) {
          const now = new Date().toISOString();
          const localFile: FileRecord = {
            id: payload.file.id,
            title: payload.file.title,
            original_filename: payload.file.originalFilename,
            mime_type: payload.file.mimeType,
            file_size: payload.file.fileSize,
            folder_id: payload.file.folderId,
            uploaded_at: now,
            created_at: now,
            archived_at: null,
            ai_visibility: "normal",
            text_extraction_status: verification.extractionStatus ?? payload.file.textExtractionStatus,
            extracted_character_count: 0,
          };
          setFileRows((current) => [localFile, ...current.filter((item) => item.id !== localFile.id)]);
        }
        if (verification.extractionStatus === "pending" && batch.length === 1) {
          setStage("extracting");
          try {
            const extracted = await fetch(`/api/files/${payload.documentId}/extract`, { method: "POST", signal: AbortSignal.timeout(60_000) });
            const extraction = await extracted.json().catch(() => null) as { status?: FileRecord["text_extraction_status"]; characterCount?: number } | null;
            if (extraction?.status) setFileRows((current) => current.map((item) => item.id === payload.documentId ? { ...item, text_extraction_status: extraction.status!, extracted_character_count: extraction.characterCount ?? item.extracted_character_count } : item));
            if (!extracted.ok && extracted.status !== 422) extractionDeferred = true;
          } catch {
            // A confirmed upload remains successful even if indexing times out.
            extractionDeferred = true;
          }
        }
        uploadedCount++;
        updateProgress(index, 100);
        setMessage(`已完成 ${uploadedCount} / ${batch.length} 个文件。请保持此页面打开。`);
      }, 2);
      setStage(result.errors.length ? "error" : "complete");
      setMessageTone(result.errors.length || auditWarning ? "error" : "success");
      if (!result.errors.length) setProgress(100);
      const errorMessage = controller.signal.aborted ? "上传已暂停；已完成的分片会保留，重新选择原文件即可继续。" : result.errors[0]?.message;
      setMessage(result.errors.length ? `已上传 ${result.uploaded} 个，${result.errors.length} 个未完成。${errorMessage}` : `已上传 ${result.uploaded} 个文件。${auditWarning ? "部分操作日志未记录，请刷新确认。" : ""}${batch.length > 1 || extractionDeferred ? "文本索引将由后台逐步完成，也可点击解析文本重试。" : ""}`);
    } catch (error) { setMessageTone("error"); const raw = error instanceof Error ? error.message : "上传失败，请重试。"; setStage("error"); setMessage(/failed to fetch/i.test(raw) ? "无法连接应用服务器，暂时无法准备上传。请检查网络后重试。" : raw); }
    finally { uploadInFlight.current = false; uploadController.current = null; if (inputRef.current) inputRef.current.value = ""; }
  }

  async function finishPending(session: MultipartSnapshot) {
    if (uploadInFlight.current) return;
    uploadInFlight.current = true; setStage("verifying"); setMessage("");
    try {
      const snapshot = await completeMultipartSession(session.sessionId);
      const response = await completeFileUpload(snapshot.documentId);
      if (!response.ok) throw new Error(await responseError(response, "保存状态未确认，请稍后重试。"));
      const result = await response.json() as { warning?: string; extractionStatus?: FileRecord["text_extraction_status"] };
      const now = new Date().toISOString();
      setFileRows(rows => [{ id: snapshot.file.id, title: snapshot.file.title, original_filename: snapshot.file.originalFilename,
        mime_type: snapshot.file.mimeType, file_size: snapshot.file.fileSize, folder_id: snapshot.file.folderId,
        uploaded_at: now, created_at: now, archived_at: null, ai_visibility: "normal",
        text_extraction_status: result.extractionStatus ?? snapshot.file.textExtractionStatus, extracted_character_count: 0 }, ...rows.filter(row => row.id !== snapshot.documentId)]);
      setStage("complete"); setMessageTone(result.warning ? "error" : "success"); setMessage(result.warning ?? "文件已完成保存。");
    } catch (error) { setStage("error"); setMessageTone("error"); setMessage(error instanceof Error ? error.message : "保存暂未完成，可稍后重试。"); }
    finally { uploadInFlight.current = false; }
  }

  async function retryExtraction(documentId: string) {
    setExtractingId(documentId); setMessage(""); setMessageTone("neutral");
    try {
      const response = await fetch(`/api/files/${documentId}/extract`, { method: "POST", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(await responseError(response, "文本解析失败，请稍后重试。"));
      const extraction = await response.json() as { status?: FileRecord["text_extraction_status"]; characterCount?: number };
      setFileRows((current) => current.map((file) => file.id === documentId ? { ...file, text_extraction_status: extraction.status ?? "completed", extracted_character_count: extraction.characterCount ?? file.extracted_character_count } : file));
      setMessage("已完成文件文本解析。"); setMessageTone("success");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "文本解析失败，请稍后重试。");
    } finally { setExtractingId(null); }
  }

  const archive = (file: FileRecord) => {
    if (previewId === file.id) setPreviewId(null);
    const archived = { ...file, archived_at: new Date().toISOString() };
    setFileRows((current) => current.filter((item) => item.id !== file.id));
    setArchivedRows((current) => [archived, ...current.filter((item) => item.id !== file.id)]);
    const form = new FormData(); form.set("document_id", file.id);
    void archiveFile(form).then((result) => show({ message: result?.warning ?? "文件已归档", tone: result?.warning ? "error" : "success", undo: () => {
      const restore = new FormData(); restore.set("document_id", file.id);
      void restoreFile(restore).then((result) => { if (result?.warning) show({ message: result.warning, tone: "error" }); setArchivedRows((current) => current.filter((item) => item.id !== file.id)); setFileRows((current) => [file, ...current]); }).catch(() => show({ message: "恢复结果未确认，请刷新后检查文件状态。", tone: "error" }));
    } })).catch(() => { setArchivedRows((current) => current.filter((item) => item.id !== file.id)); setFileRows((current) => [file, ...current]); show({ message: "归档结果未确认，请刷新后检查文件状态。", tone: "error" }); });
  };

  return (
    <div className="files-workspace grid grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1 h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 bg-[var(--surface-canvas)] md:min-h-[540px] md:grid-cols-[216px_minmax(0,1fr)]">
      <aside className="workspace-scroll min-h-0 max-h-48 overflow-y-auto md:max-h-none border-b border-white/55 bg-[var(--material-sidebar)] p-3 md:border-b-0 md:border-r">
        <div className="flex h-8 items-center justify-between px-1">
          <p className="text-[10.5px] font-semibold tracking-[.04em] text-[var(--text-tertiary)]">文件夹</p>
          <button type="button" onClick={() => setCreatingFolder((value) => !value)} aria-label="新建文件夹" className="pressable flex size-7 items-center justify-center rounded-[7px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"><FolderPlus size={15} /></button>
        </div>

        {creatingFolder ? (
          <FileMutationForm action={createFileFolder} onSuccess={() => setCreatingFolder(false)} className="mt-2 flex flex-wrap gap-1.5">
            <input aria-label="文件夹名称" name="name" required maxLength={160} autoFocus placeholder="文件夹名称" className="h-8 min-w-0 flex-1 rounded-[8px] border border-transparent bg-[var(--surface-control)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
            <input type="hidden" name="parent_id" value={folderId ?? ""} />
            <button className="pressable h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-[11px] font-medium text-white">创建</button>
          </FileMutationForm>
        ) : null}

        <button onClick={() => changeBrowser({ folderId: null })} className={`pressable mt-2 flex h-[30px] w-full items-center gap-2 rounded-[8px] px-2 text-left text-[12.5px] ${folderId === null ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}>
          <Folder size={14} />
          <span className="truncate">全部文件</span>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">{fileRows.length}</span>
        </button>
        <div className="mt-px space-y-px">
          {sortedFolders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => changeBrowser({ folderId: folder.id })}
              style={{ paddingLeft: `${8 + folderDepth(folder, folders) * 14}px` }}
              className={`pressable flex h-[30px] w-full items-center gap-2 rounded-[8px] pr-2 text-left text-[12.5px] ${folder.id === folderId ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}
            >
              <Folder size={14} /><span className="truncate">{folder.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 px-1 text-[10.5px] leading-5 text-[var(--text-tertiary)]">可在当前文件夹中新建子文件夹，或移动已有文件。</p>
      </aside>

      <WorkspaceReadyMetric workspace="files" />
      <section ref={sectionRef} className="workspace-scroll min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-h-12 flex-wrap items-start justify-between gap-3 border-b border-[var(--separator)] pb-3.5">
          <div>
            <h1 className="text-[27px] font-semibold leading-[1.08] tracking-[-0.042em] text-[var(--text-primary)]">{activeFolder?.name ?? "全部文件"}</h1>
            <p className="mt-0.5 text-[10.5px] tabular-nums text-[var(--text-tertiary)]">{`${visibleFiles.length} 个文件${filtering ? ` · 当前目录共 ${fileRows.filter(file => folderId === null || file.folder_id === folderId).length} 个` : ""}`}</p>
          </div>
          <div>
            <input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => void upload(event.target.files)} />
            <button disabled={uploadBusy} onClick={() => inputRef.current?.click()} className="pressable inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-60">
              {uploadBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
              {stage === "preparing" ? "正在准备…" : stage === "uploading" ? `上传 ${progress}%` : stage === "verifying" ? "正在确认…" : stage === "extracting" ? "正在解析…" : "上传文件"}
            </button>
          </div>
        </div>

        <Link href="/files/materials" className="inline-flex min-h-11 items-center text-[12px] text-[var(--text-tertiary)] hover:text-[var(--accent)]">证明材料目录 →</Link>
        <div className="my-3 space-y-2" role="region" aria-label="文件筛选与排序">
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="搜索文件名称" type="search" maxLength={200} value={browser.query} onChange={event => changeBrowser({ query: event.target.value }, true)} placeholder="搜索名称或原始文件名" className="h-10 w-full min-w-0 rounded-[9px] sm:w-auto sm:flex-1 border border-[var(--separator)] bg-[var(--surface-control)] px-3 text-[13px] outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            <select aria-label="文件排序" value={browser.sort} onChange={event => changeBrowser({ sort: event.target.value as FileBrowserState["sort"] })} className="h-10 max-w-full rounded-[9px] border border-[var(--separator)] bg-[var(--surface-control)] px-2 text-[12px]">{fileSorts.map(sort => <option key={sort} value={sort}>{fileSortLabels[sort]}</option>)}</select>
            <div role="group" aria-label="文件显示方式" className="flex rounded-[9px] bg-[var(--surface-control)] p-1">{(["list", "grid"] as const).map(view => <button type="button" key={view} aria-pressed={browser.view === view} onClick={() => changeBrowser({ view })} className={`pressable min-h-8 rounded-[7px] px-2 text-[12px] ${browser.view === view ? "bg-[var(--surface-selected)] text-[var(--accent)]" : ""}`}>{view === "list" ? "列表" : "网格"}</button>)}</div>
          </div>
          <div role="group" aria-label="文件类型" className="flex flex-wrap gap-1.5">{fileTypes.map(type => <button type="button" key={type} aria-pressed={browser.type === type} onClick={() => changeBrowser({ type, ...(type === "photo" ? { view: "grid" as const } : {}) })} className={`pressable min-h-9 rounded-full border px-3 text-[12px] ${browser.type === type ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--separator)] text-[var(--text-secondary)]"}`}>{fileTypeLabels[type]} <span className="font-mono text-[10px]">{selection.counts[type]}</span></button>)}</div>
          {browser.type === "photo" ? <p className="text-[11px] leading-5 text-[var(--text-tertiary)]">按上传时间管理；不是拍摄时间。预览仅生成受限缩略图，不会自动下载原件。</p> : null}
        </div>

        <FileResumableUploads busy={uploadBusy} refresh={stage} onResume={(file, session) => void upload([file], session)} onFinish={session => void finishPending(session)} />
        {uploadBusy && ["preparing", "uploading"].includes(stage) ? <button type="button" className="mb-2 min-h-9 text-[12px] text-[var(--accent)]" onClick={() => uploadController.current?.abort()}>暂停上传，保留分片</button> : null}
        <FileRecoveryPanel disabled={uploadBusy} />

        {message ? <p role="status" className={`mt-2.5 text-[11px] ${messageTone === "error" ? "text-[var(--danger)]" : messageTone === "success" ? "text-[var(--success)]" : "text-[var(--text-secondary)]"}`}>{message}</p> : null}

        {!visibleFiles.length ? (
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <FilePlus2 size={24} className="text-[var(--text-tertiary)]" />
            <h2 className="mt-3 text-[13.5px] font-medium text-[var(--text-primary)]">{filtering ? "没有符合条件的文件" : "这里还没有文件"}</h2>
            <p className="mt-1 text-[11.5px] text-[var(--text-secondary)]">{filtering ? "调整类型或搜索条件，不会删除任何文件。" : "上传文件，或切换到其他文件夹。"}</p>
            {filtering ? <button type="button" onClick={() => changeBrowser({ query: "", type: "all" })} className="mt-3 min-h-9 px-3 text-[12px] text-[var(--accent)]">清除筛选</button> : null}
          </div>
        ) : browser.view === "grid" ? (
          <ul aria-label="文件网格" className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {displayedFiles.map(file => <li id={`file-${file.id}`} key={file.id} className={`min-w-0 overflow-hidden rounded-[12px] border border-[var(--separator)] bg-[var(--surface-canvas)] ${file.id === highlightId ? "ring-2 ring-[var(--accent)]" : ""}`}>
              {classifyFile(file) === "photo" ? <button type="button" aria-label={`预览 ${file.title}`} onClick={event => { previewLauncher.current = event.currentTarget; setPreviewId(file.id); }} className="block w-full"><FilePhoto file={file} className="aspect-square w-full" /></button> : isPdfFile(file) ? <button type="button" aria-label={`预览 ${file.title}`} onClick={event => { previewLauncher.current = event.currentTarget; setPreviewId(file.id); }} className="block w-full"><FilePdfCover file={file} /></button> : <div className="flex aspect-square items-center justify-center bg-[var(--surface-control)] text-[var(--text-tertiary)]"><File size={36} /></div>}
              <div className="min-w-0 p-2.5">{classifyFile(file) === "photo" || isPdfFile(file) ? <button type="button" onClick={event => { previewLauncher.current = event.currentTarget; setPreviewId(file.id); }} aria-label={`打开预览：${file.title}`} title={file.title} className="block w-full truncate text-left text-[12.5px] font-medium hover:text-[var(--accent)]">{file.title}</button> : <p className="truncate text-[12.5px] font-medium" title={file.title}>{file.title}</p>}<p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{fileTypeLabels[classifyFile(file)]} · {formatBytes(file.file_size)}</p><p className="mt-1 text-[10px] text-[var(--text-tertiary)]">上传于 {new Date(file.uploaded_at).toLocaleDateString("zh-CN")}</p>
                <div className="mt-1 flex justify-end gap-1"><a href={`/api/files/${file.id}/download`} aria-label={`下载 ${file.title}`} className="pressable flex size-9 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><Download size={14} /></a><FileOcrControl file={file} onComplete={count => setFileRows(current => current.map(item => item.id === file.id ? { ...item, text_extraction_status: "completed", extracted_character_count: count } : item))} /><FileOperations file={file} folders={sortedFolders} onArchive={archive} /></div>
              </div>
            </li>)}
          </ul>
        ) : (
          <ul aria-label="文件列表" className="divide-y divide-[var(--separator)]">
            {displayedFiles.map((file) => (
              <li id={`file-${file.id}`} className={`flex min-h-[52px] items-center gap-2.5 px-2 py-2.5 transition-colors ui-transition ${file.id === highlightId ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]"}`} key={file.id}>
                <File size={16} className="shrink-0 text-[var(--text-tertiary)]" />
                <div className="min-w-0 flex-1">
                  {classifyFile(file) === "photo" || isPdfFile(file) ? <button type="button" onClick={event => { previewLauncher.current = event.currentTarget; setPreviewId(file.id); }} aria-label={`打开预览：${file.title}`} className="block max-w-full truncate text-left text-[13px] font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">{file.title}</button> : <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{file.title}</p>}
                  <p className="mt-0.5 font-mono text-[10px] leading-4 tabular-nums text-[var(--text-tertiary)]">
                    {fileTypeLabels[classifyFile(file)]} · {formatBytes(file.file_size)} · 上传于 {new Date(file.uploaded_at).toLocaleDateString("zh-CN")}
                    {file.text_extraction_status === "completed" ? ` · 已索引 ${file.extracted_character_count.toLocaleString("zh-CN")} 字` : file.text_extraction_status === "processing" || file.text_extraction_status === "pending" ? " · 正在建立全文索引" : file.text_extraction_status === "too_large" ? " · 文件过大，暂不解析" : file.text_extraction_status === "unsupported" ? " · 此类型暂不解析" : file.text_extraction_status === "failed" ? " · 文本解析失败" : ""}
                  </p>
                </div>
                {classifyFile(file) === "photo" || isPdfFile(file) ? <button type="button" aria-label={`预览 ${file.title}`} onClick={event => { previewLauncher.current = event.currentTarget; setPreviewId(file.id); }} className="pressable flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--accent)] hover:bg-[var(--surface-hover)]"><Eye size={15} /></button> : null}
                {["failed", "pending", "not_requested"].includes(file.text_extraction_status) ? <button type="button" disabled={extractingId === file.id} onClick={() => void retryExtraction(file.id)} className="pressable h-8 rounded-[8px] px-2 text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50">{extractingId === file.id ? "解析中…" : "解析文本"}</button> : null}
                <a href={`/api/files/${file.id}/download`} className="pressable flex size-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]" aria-label={`下载 ${file.title}`}><Download size={14} /></a>
                <FileOcrControl file={file} onComplete={count => setFileRows(current => current.map(item => item.id === file.id ? { ...item, text_extraction_status: "completed", extracted_character_count: count } : item))} />
                <FileOperations file={file} folders={sortedFolders} onArchive={archive} />
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 ? <nav aria-label="文件分页" className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--separator)] pt-3 text-[12px]">
          <span>第 {currentPage} / {totalPages} 页 · 本页 {displayedFiles.length} 个</span>
          <div className="flex gap-2"><button type="button" disabled={currentPage <= 1} onClick={() => changeBrowser({ page: currentPage - 1 })} className="pressable min-h-9 rounded-[8px] bg-[var(--surface-control)] px-3 disabled:opacity-40">上一页</button><button type="button" disabled={currentPage >= totalPages} onClick={() => changeBrowser({ page: currentPage + 1 })} className="pressable min-h-9 rounded-[8px] bg-[var(--surface-control)] px-3 disabled:opacity-40">下一页</button></div>
        </nav> : null}

        {visibleArchived.length > 0 ? (
          <details className="mt-5 border-t border-[var(--separator)] pt-3">
            <summary className="pressable inline-flex cursor-pointer list-none items-center gap-2 rounded-[7px] px-1 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
              <Archive size={13} />已归档（全部文件夹） <span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">{visibleArchived.length}</span>
            </summary>
            <ul className="mt-2 divide-y divide-[var(--separator)]">
              {visibleArchived.slice(0, archivedLimit).map((file) => (
                <li className="flex min-h-11 items-center gap-2.5 px-2 py-2" key={file.id}>
                  <File size={14} className="shrink-0 text-[var(--text-tertiary)]" />
                  <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] text-[var(--text-primary)]">{file.title}</p><p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">{formatBytes(file.file_size)} · 归档于 {new Date(file.archived_at ?? file.uploaded_at).toLocaleDateString("zh-CN")}</p></div>
                  <span className="text-[10px] text-[var(--text-tertiary)]">恢复后下载</span>
                  <FileMutationForm action={restoreFile}><input type="hidden" name="document_id" value={file.id} /><button className="pressable h-8 rounded-[8px] px-2 text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">恢复</button></FileMutationForm>
                </li>
              ))}
            </ul>
            {visibleArchived.length > archivedLimit ? <button type="button" onClick={() => setArchivedLimit(limit => limit + filesPerPage)} className="mt-2 min-h-10 px-3 text-[12px] text-[var(--accent)]">显示更多归档（{archivedLimit} / {visibleArchived.length}）</button> : null}
          </details>
        ) : null}
      </section>
      <Dialog open={Boolean(previewFile)} onOpenChange={open => { if (!open) setPreviewId(null); }}>
        {previewFile ? <DialogContent className={isPdfFile(previewFile) ? "sm:max-w-4xl" : "sm:max-w-2xl"} onCloseAutoFocus={event => { event.preventDefault(); if (previewLauncher.current?.isConnected) previewLauncher.current.focus(); else sectionRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(); }}>
          <DialogHeader><DialogTitle className="break-words pr-8">{previewFile.title}</DialogTitle><DialogDescription>{isPdfFile(previewFile) ? "PDF 预览" : "受限缩略图预览"} · 上传于 {new Date(previewFile.uploaded_at).toLocaleDateString("zh-CN")} · {formatBytes(previewFile.file_size)}</DialogDescription></DialogHeader>
          {isPdfFile(previewFile) ? <FilePdfPreview key={previewFile.id} documentId={previewFile.id} title={previewFile.title} /> : <FilePhoto file={previewFile} className="max-h-[50dvh] min-h-40 w-full rounded-[10px]" />}
          <p className="break-all text-[12px] text-[var(--text-secondary)]">原始文件名：{previewFile.original_filename}</p>
          <a href={`/api/files/${previewFile.id}/download`} className="pressable inline-flex min-h-10 items-center justify-center gap-2 rounded-[9px] bg-[var(--accent)] px-3 text-[13px] text-white"><Download size={15} />下载原件</a>
        </DialogContent> : null}
      </Dialog>
    </div>
  );
}
