"use client";

import { runUploadBatch } from "@/features/files/upload-batch";

import { Archive, Download, File, FilePlus2, Folder, FolderPlus, LoaderCircle, MoreHorizontal, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { archiveFile, createFileFolder, moveFile, renameFile, restoreFile, setFileAiVisibility } from "@/features/files/actions";
import { directUploadFailureMessage } from "@/features/files/r2-errors";
import type { FileFolder, FileRecord } from "@/features/files/queries";
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

async function responseError(response: Response, fallback: string) {
  try { const value = await response.json() as ApiError; return value.error || fallback; } catch { return fallback; }
}

function uploadToR2(url: string, file: File, onProgress: (value: number) => void) {
  return new Promise<number | null>((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url); request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onload = () => resolve(request.status);
    request.onerror = () => resolve(null);
    request.onabort = () => resolve(null);
    request.send(file);
  });
}

async function browserR2NetworkMessage() {
  try {
    const response = await fetch("/api/files/storage-health", { cache: "no-store" });
    const health = await response.json() as { credentialsReachR2?: boolean };
    if (response.ok && health.credentialsReachR2) return "无法连接 Cloudflare R2。服务器可以访问 R2，但浏览器直传失败，请检查 R2 Bucket CORS 是否允许当前网站 Origin。";
  } catch { /* The primary CORS diagnosis remains useful even if diagnostics are unavailable. */ }
  return directUploadFailureMessage(null);
}

export function FilesWorkspace({ folders, files, archivedFiles = [], initialUpload = false, initialFileId }: { folders: FileFolder[]; files: FileRecord[]; archivedFiles?: FileRecord[]; initialUpload?: boolean; initialFileId?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileRows, setFileRows] = useState(files);
  const [archivedRows, setArchivedRows] = useState(archivedFiles);
  const [folderId, setFolderId] = useState<string | null>(() => initialFileId ? files.find((item) => item.id === initialFileId)?.folder_id ?? null : null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const { show } = useActionFeedback();
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => folderDepth(a, folders) - folderDepth(b, folders) || a.name.localeCompare(b.name, "zh-CN")), [folders]);
  const visibleFiles = fileRows.filter((file) => file.folder_id === folderId);
  const activeFolder = folders.find((folder) => folder.id === folderId);
  useEffect(() => { if (initialUpload) inputRef.current?.click(); }, [initialUpload]);
  // 跨实体内链跳转：/files?file={id}。初始即切到文件所在文件夹，短暂高亮定位。
  const [highlightId, setHighlightId] = useState<string | null>(initialFileId && files.some((item) => item.id === initialFileId) ? initialFileId : null);
  useEffect(() => {
    if (!highlightId) return;
    requestAnimationFrame(() => {
      document.getElementById(`file-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const timer = window.setTimeout(() => setHighlightId(null), 2600);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  async function upload(filesToUpload: FileList | null) {
    if (!filesToUpload?.length || ["preparing", "uploading", "verifying", "extracting"].includes(stage)) return;
    setStage("preparing"); setProgress(0); setMessage("");
    const batch = Array.from(filesToUpload);
    const fileProgress = batch.map(() => 0);
    let uploadedCount = 0;
    const totalBytes = batch.reduce((total, file) => total + file.size, 0);
    const updateProgress = (index: number, value: number) => {
      fileProgress[index] = value;
      setProgress(Math.round(batch.reduce((total, file, i) => total + file.size * fileProgress[i], 0) / totalBytes));
    };
    try {
      const result = await runUploadBatch(batch, async (file, index) => {
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const created = await fetch("/api/files/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, folderId, checksum }) });
        let payload: { documentId?: string; uploadUrl?: string; resumed?: boolean; error?: string; file?: { id: string; title: string; originalFilename: string; mimeType: string; fileSize: number; folderId: string | null; textExtractionStatus: FileRecord["text_extraction_status"] } };
        try { payload = await created.json() as typeof payload; } catch { throw new Error("上传准备服务返回无效响应，请稍后重试。"); }
        if (!created.ok || !payload.documentId || !payload.uploadUrl) throw new Error(payload.error || "上传准备失败。");
        setStage("uploading");
        const status = await uploadToR2(payload.uploadUrl, file, (value) => updateProgress(index, value));
        if (status === null) { if (!payload.resumed) void fetch(`/api/files/upload-url?documentId=${encodeURIComponent(payload.documentId)}`, { method: "DELETE" }); throw new Error(await browserR2NetworkMessage()); }
        if (status < 200 || status >= 300) { if (!payload.resumed) void fetch(`/api/files/upload-url?documentId=${encodeURIComponent(payload.documentId)}`, { method: "DELETE" }); throw new Error(directUploadFailureMessage(status)); }
        if (batch.length === 1) setStage("verifying");
        const completed = await fetch("/api/files/upload-url", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: payload.documentId }) });
        if (!completed.ok) throw new Error(await responseError(completed, "文件上传后未能确认。"));
        const verification = await completed.json() as { extractionStatus?: FileRecord["text_extraction_status"] };
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
          const extracted = await fetch(`/api/files/${payload.documentId}/extract`, { method: "POST" });
          const extraction = await extracted.json().catch(() => null) as { status?: FileRecord["text_extraction_status"]; characterCount?: number } | null;
          if (extraction?.status) setFileRows((current) => current.map((item) => item.id === payload.documentId ? { ...item, text_extraction_status: extraction.status!, extracted_character_count: extraction.characterCount ?? item.extracted_character_count } : item));
          if (!extracted.ok && extracted.status !== 422)
            setMessage("文件已上传，文本解析将由后台继续处理。");
        }
        uploadedCount++;
        updateProgress(index, 100);
        setMessage(`已完成 ${uploadedCount} / ${batch.length} 个文件。请保持此页面打开。`);
      });
      setStage(result.errors.length ? "error" : "complete");
      if (!result.errors.length) setProgress(100);
      const errorMessage = result.errors[0]?.message;
      setMessage(result.errors.length ? `已上传 ${result.uploaded} 个，${result.errors.length} 个未完成。${errorMessage}` : `已上传 ${result.uploaded} 个文件。${batch.length > 1 ? "文本索引将由后台逐步完成。" : ""}`);
    } catch (error) { const raw = error instanceof Error ? error.message : "上传失败，请重试。"; setStage("error"); setMessage(/failed to fetch/i.test(raw) ? "无法连接应用服务器，暂时无法准备上传。请检查网络后重试。" : raw); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  }

  async function retryExtraction(documentId: string) {
    setExtractingId(documentId); setMessage("");
    try {
      const response = await fetch(`/api/files/${documentId}/extract`, { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response, "文本解析失败，请稍后重试。"));
      const extraction = await response.json() as { status?: FileRecord["text_extraction_status"]; characterCount?: number };
      setFileRows((current) => current.map((file) => file.id === documentId ? { ...file, text_extraction_status: extraction.status ?? "completed", extracted_character_count: extraction.characterCount ?? file.extracted_character_count } : file));
      setMessage("已完成文件文本解析。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文本解析失败，请稍后重试。");
    } finally { setExtractingId(null); }
  }

  const uploadBusy = ["preparing", "uploading", "verifying", "extracting"].includes(stage);
  const archive = (file: FileRecord) => {
    const archived = { ...file, archived_at: new Date().toISOString() };
    setFileRows((current) => current.filter((item) => item.id !== file.id));
    setArchivedRows((current) => [archived, ...current.filter((item) => item.id !== file.id)]);
    const form = new FormData(); form.set("document_id", file.id);
    void archiveFile(form).then(() => show({ message: "文件已归档", tone: "success", undo: () => {
      const restore = new FormData(); restore.set("document_id", file.id);
      void restoreFile(restore).then(() => { setArchivedRows((current) => current.filter((item) => item.id !== file.id)); setFileRows((current) => [file, ...current]); }).catch(() => show({ message: "恢复失败，文件仍在归档区。", tone: "error" }));
    } })).catch(() => { setArchivedRows((current) => current.filter((item) => item.id !== file.id)); setFileRows((current) => [file, ...current]); show({ message: "归档失败，文件仍保留在原位置。", tone: "error" }); });
  };

  return (
    <div className="grid h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 bg-[var(--surface-canvas)] md:min-h-[540px] md:grid-cols-[216px_minmax(0,1fr)]">
      <aside className="border-b border-white/55 bg-[var(--material-sidebar)] p-3 md:border-b-0 md:border-r">
        <div className="flex h-8 items-center justify-between px-1">
          <p className="text-[10.5px] font-semibold tracking-[.04em] text-[var(--text-tertiary)]">文件夹</p>
          <button type="button" onClick={() => setCreatingFolder((value) => !value)} aria-label="新建文件夹" className="pressable flex size-7 items-center justify-center rounded-[7px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"><FolderPlus size={15} /></button>
        </div>

        {creatingFolder ? (
          <form action={createFileFolder} className="mt-2 flex gap-1.5">
            <input name="name" required maxLength={160} autoFocus placeholder="文件夹名称" className="h-8 min-w-0 flex-1 rounded-[8px] border border-transparent bg-[var(--surface-control)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
            <input type="hidden" name="parent_id" value={folderId ?? ""} />
            <button className="pressable h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-[11px] font-medium text-white">创建</button>
          </form>
        ) : null}

        <button onClick={() => setFolderId(null)} className={`pressable mt-2 flex h-[30px] w-full items-center gap-2 rounded-[8px] px-2 text-left text-[12.5px] ${folderId === null ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}>
          <Folder size={14} />
          <span className="truncate">全部文件</span>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">{fileRows.length}</span>
        </button>
        <div className="mt-px space-y-px">
          {sortedFolders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setFolderId(folder.id)}
              style={{ paddingLeft: `${8 + folderDepth(folder, folders) * 14}px` }}
              className={`pressable flex h-[30px] w-full items-center gap-2 rounded-[8px] pr-2 text-left text-[12.5px] ${folder.id === folderId ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}
            >
              <Folder size={14} /><span className="truncate">{folder.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 px-1 text-[10.5px] leading-5 text-[var(--text-tertiary)]">可在当前文件夹中新建子文件夹，或移动已有文件。</p>
      </aside>

      <section className="min-w-0 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-h-12 flex-wrap items-start justify-between gap-3 border-b border-[var(--separator)] pb-3.5">
          <div>
            <h1 className="text-[27px] font-semibold leading-[1.08] tracking-[-0.042em] text-[var(--text-primary)]">{activeFolder?.name ?? "全部文件"}</h1>
            <p className="mt-0.5 text-[10.5px] tabular-nums text-[var(--text-tertiary)]">{activeFolder ? `${visibleFiles.length} 个文件` : `${fileRows.length} 个文件`}</p>
          </div>
          <div>
            <input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => void upload(event.target.files)} />
            <button disabled={uploadBusy} onClick={() => inputRef.current?.click()} className="pressable inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-60">
              {uploadBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
              {stage === "preparing" ? "正在准备…" : stage === "uploading" ? `上传 ${progress}%` : stage === "verifying" ? "正在确认…" : stage === "extracting" ? "正在解析…" : "上传文件"}
            </button>
          </div>
        </div>

        {message ? <p role="status" className={`mt-2.5 text-[11px] ${message.startsWith("已") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{message}</p> : null}

        {!visibleFiles.length ? (
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <FilePlus2 size={24} className="text-[var(--text-tertiary)]" />
            <h2 className="mt-3 text-[13.5px] font-medium text-[var(--text-primary)]">这里还没有文件</h2>
            <p className="mt-1 text-[11.5px] text-[var(--text-secondary)]">上传文件，或切换到其他文件夹。</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--separator)]">
            {visibleFiles.map((file) => (
              <li id={`file-${file.id}`} className={`flex min-h-[52px] items-center gap-2.5 px-2 py-2.5 transition-colors ui-transition ${file.id === highlightId ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]"}`} key={file.id}>
                <File size={16} className="shrink-0 text-[var(--text-tertiary)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{file.title}</p>
                  <p className="mt-0.5 font-mono text-[10px] leading-4 tabular-nums text-[var(--text-tertiary)]">
                    {formatBytes(file.file_size)} · {new Date(file.uploaded_at).toLocaleDateString("zh-CN")}
                    {file.text_extraction_status === "completed" ? ` · 已索引 ${file.extracted_character_count.toLocaleString("zh-CN")} 字` : file.text_extraction_status === "processing" || file.text_extraction_status === "pending" ? " · 正在建立全文索引" : file.text_extraction_status === "too_large" ? " · 文件过大，暂不解析" : file.text_extraction_status === "unsupported" ? " · 此类型暂不解析" : file.text_extraction_status === "failed" ? " · 文本解析失败" : ""}
                  </p>
                </div>
                {["failed", "pending", "not_requested"].includes(file.text_extraction_status) ? <button type="button" disabled={extractingId === file.id} onClick={() => void retryExtraction(file.id)} className="pressable h-8 rounded-[8px] px-2 text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50">{extractingId === file.id ? "解析中…" : "解析文本"}</button> : null}
                <a href={`/api/files/${file.id}/download`} className="pressable flex size-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]" aria-label={`下载 ${file.title}`}><Download size={14} /></a>
                <details className="relative">
                  <summary aria-label={`操作 ${file.title}`} className="pressable flex size-8 cursor-pointer list-none items-center justify-center rounded-[8px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><MoreHorizontal size={15} /></summary>
                  <div className="absolute right-0 z-20 mt-1 w-52 rounded-[12px] border border-[var(--separator)] bg-[var(--material-popover)] p-2 shadow-[var(--shadow-popover)] backdrop-blur-2xl">
                    <form action={renameFile} className="space-y-2"><input name="title" defaultValue={file.title} className="h-8 w-full rounded-[8px] bg-[var(--surface-control)] px-2.5 text-[11.5px] outline-none" /><input type="hidden" name="document_id" value={file.id} /><button className="text-[10.5px] font-medium text-[var(--accent)]">重命名</button></form>
                    <form action={moveFile} className="mt-2 border-t border-[var(--separator)] pt-2"><input type="hidden" name="document_id" value={file.id} /><select name="folder_id" defaultValue={file.folder_id ?? ""} className="h-8 w-full rounded-[8px] bg-[var(--surface-control)] px-2 text-[11.5px] outline-none"><option value="">根目录</option>{sortedFolders.map((folder) => <option key={folder.id} value={folder.id}>{"　".repeat(folderDepth(folder, folders))}{folder.name}</option>)}</select><button className="mt-1.5 text-[10.5px] font-medium text-[var(--accent)]">移动文件</button></form>
                    <form action={setFileAiVisibility} className="mt-2 border-t border-[var(--separator)] pt-2"><input type="hidden" name="document_id" value={file.id}/><select name="ai_visibility" defaultValue={file.ai_visibility} className="h-8 w-full rounded-[8px] bg-[var(--surface-control)] px-2 text-[11.5px] outline-none"><option value="normal">AI 可正常使用</option><option value="sensitive">敏感：默认不发送</option><option value="never">永不发送给 AI</option></select><button className="mt-1.5 text-[10.5px] font-medium text-[var(--accent)]">保存隐私设置</button></form>
                    <button type="button" onClick={() => archive(file)} className="mt-2 inline-flex items-center gap-1 border-t border-[var(--separator)] pt-2 text-[10.5px] text-[var(--danger)]"><Archive size={12} />归档</button>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}

        {archivedRows.length > 0 ? (
          <details className="mt-5 border-t border-[var(--separator)] pt-3">
            <summary className="pressable inline-flex cursor-pointer list-none items-center gap-2 rounded-[7px] px-1 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
              <Archive size={13} />已归档 <span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">{archivedRows.length}</span>
            </summary>
            <ul className="mt-2 divide-y divide-[var(--separator)]">
              {archivedRows.map((file) => (
                <li className="flex min-h-11 items-center gap-2.5 px-2 py-2" key={file.id}>
                  <File size={14} className="shrink-0 text-[var(--text-tertiary)]" />
                  <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] text-[var(--text-primary)]">{file.title}</p><p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">{formatBytes(file.file_size)} · 归档于 {new Date(file.archived_at ?? file.uploaded_at).toLocaleDateString("zh-CN")}</p></div>
                  <a href={`/api/files/${file.id}/download`} className="pressable flex size-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)]" aria-label={`下载 ${file.title}`}><Download size={14} /></a>
                  <form action={restoreFile}><input type="hidden" name="document_id" value={file.id} /><button className="pressable h-8 rounded-[8px] px-2 text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">恢复</button></form>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
