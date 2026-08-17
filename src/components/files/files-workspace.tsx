"use client";

import { Archive, Download, File, FilePlus2, Folder, FolderPlus, LoaderCircle, MoreHorizontal, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { archiveFile, createFileFolder, moveFile, renameFile } from "@/features/files/actions";
import { directUploadFailureMessage } from "@/features/files/r2-errors";
import type { FileFolder, FileRecord } from "@/features/files/queries";

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

export function FilesWorkspace({ folders, files, initialUpload = false }: { folders: FileFolder[]; files: FileRecord[]; initialUpload?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileRows, setFileRows] = useState(files);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => folderDepth(a, folders) - folderDepth(b, folders) || a.name.localeCompare(b.name, "zh-CN")), [folders]);
  const visibleFiles = fileRows.filter((file) => file.folder_id === folderId);
  const activeFolder = folders.find((folder) => folder.id === folderId);
  useEffect(() => { if (initialUpload) inputRef.current?.click(); }, [initialUpload]);

  async function upload(filesToUpload: FileList | null) {
    if (!filesToUpload?.length || ["preparing", "uploading", "verifying", "extracting"].includes(stage)) return;
    setStage("preparing"); setProgress(0); setMessage("");
    try {
      for (const file of Array.from(filesToUpload)) {
        const created = await fetch("/api/files/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, folderId }) });
        let payload: { documentId?: string; uploadUrl?: string; error?: string; file?: { id: string; title: string; originalFilename: string; mimeType: string; fileSize: number; folderId: string | null; textExtractionStatus: FileRecord["text_extraction_status"] } };
        try { payload = await created.json() as typeof payload; } catch { throw new Error("上传准备服务返回无效响应，请稍后重试。"); }
        if (!created.ok || !payload.documentId || !payload.uploadUrl) throw new Error(payload.error || "上传准备失败。");
        setStage("uploading"); setProgress(0);
        const status = await uploadToR2(payload.uploadUrl, file, setProgress);
        if (status === null) { void fetch(`/api/files/upload-url?documentId=${encodeURIComponent(payload.documentId)}`, { method: "DELETE" }); throw new Error(await browserR2NetworkMessage()); }
        if (status < 200 || status >= 300) { void fetch(`/api/files/upload-url?documentId=${encodeURIComponent(payload.documentId)}`, { method: "DELETE" }); throw new Error(directUploadFailureMessage(status)); }
        setStage("verifying");
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
            text_extraction_status: verification.extractionStatus ?? payload.file.textExtractionStatus,
            extracted_character_count: 0,
          };
          setFileRows((current) => [localFile, ...current.filter((item) => item.id !== localFile.id)]);
        }
        if (verification.extractionStatus === "pending") {
          setStage("extracting");
          const extracted = await fetch(`/api/files/${payload.documentId}/extract`, { method: "POST" });
          const extraction = await extracted.json().catch(() => null) as { status?: FileRecord["text_extraction_status"]; characterCount?: number } | null;
          if (extraction?.status) setFileRows((current) => current.map((item) => item.id === payload.documentId ? { ...item, text_extraction_status: extraction.status!, extracted_character_count: extraction.characterCount ?? item.extracted_character_count } : item));
          if (!extracted.ok && extracted.status !== 422)
            setMessage("文件已上传，文本解析将由后台继续处理。");
        }
      }
      setStage("complete"); setProgress(100); setMessage(`已上传 ${filesToUpload.length} 个文件。`);
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

  return <div className="grid h-[calc(var(--app-viewport-height)-var(--toolbar-height))] min-h-0 gap-0 bg-[var(--surface-canvas)] md:min-h-[540px] md:grid-cols-[var(--context-sidebar-width)_minmax(0,1fr)]">
    <aside className="border-b bg-[var(--surface-sidebar)] p-4 md:border-r md:border-b-0">
      <div className="flex items-center justify-between"><p className="text-xs font-medium tracking-wide text-zinc-500">文件夹</p><button type="button" onClick={() => setCreatingFolder((value) => !value)} aria-label="新建文件夹" className="rounded p-1.5 text-[#365f78] hover:bg-[#edf3f6]"><FolderPlus size={17} /></button></div>
      {creatingFolder ? <form action={createFileFolder} className="mt-3 flex gap-1"><Input name="name" required maxLength={160} autoFocus placeholder="文件夹名称" className="min-w-0 flex-1 text-xs" /><input type="hidden" name="parent_id" value={folderId ?? ""} /><Button size="xs">创建</Button></form> : null}
      <button onClick={() => setFolderId(null)} className={`mt-3 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${folderId === null ? "bg-[#edf3f6] text-[#365f78]" : "text-zinc-700 hover:bg-zinc-50"}`}><Folder size={16} />全部文件 <span className="ml-auto font-mono text-xs text-zinc-400">{fileRows.length}</span></button>
      <div className="mt-1 space-y-0.5">{sortedFolders.map((folder) => <button key={folder.id} onClick={() => setFolderId(folder.id)} style={{ paddingLeft: `${8 + folderDepth(folder, folders) * 14}px` }} className={`flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left text-sm ${folder.id === folderId ? "bg-[#edf3f6] text-[#365f78]" : "text-zinc-700 hover:bg-zinc-50"}`}><Folder size={15} />{folder.name}</button>)}</div>
      <p className="mt-5 text-xs leading-5 text-zinc-400">在当前文件夹中新建子文件夹，或将文件移动至任意文件夹。</p>
    </aside>
    <section className="min-w-0 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><h1 className="text-xl font-semibold text-[var(--text-primary)]">{activeFolder?.name ?? "全部文件"}</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">{activeFolder ? `${visibleFiles.length} 个文件` : `${fileRows.length} 个文件`}</p></div><div><input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => void upload(event.target.files)} /><Button disabled={uploadBusy} onClick={() => inputRef.current?.click()}>{uploadBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}{stage === "preparing" ? "正在准备…" : stage === "uploading" ? `正在上传… ${progress}%` : stage === "verifying" ? "正在确认…" : stage === "extracting" ? "正在解析文本…" : "上传文件"}</Button></div></div>
      {message ? <p role="status" className={`mt-3 text-sm ${message.startsWith("已") ? "text-[#365f78]" : "text-red-700"}`}>{message}</p> : null}
      {!visibleFiles.length ? <div className="flex min-h-64 flex-col items-center justify-center text-center"><FilePlus2 size={28} className="text-[#365f78]" /><h2 className="mt-3 font-medium text-zinc-900">这里还没有文件</h2><p className="mt-1 text-sm text-zinc-500">上传文件，或切换到其他文件夹。</p></div> : <ul className="divide-y divide-[#eceae6]">{visibleFiles.map((file) => <li className="flex items-center gap-3 py-3" key={file.id}><File size={18} className="shrink-0 text-zinc-400" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-800">{file.title}</p><p className="mt-0.5 font-mono text-xs text-zinc-400">{formatBytes(file.file_size)} · {new Date(file.uploaded_at).toLocaleDateString("zh-CN")}{file.text_extraction_status === "completed" ? ` · 已索引 ${file.extracted_character_count.toLocaleString("zh-CN")} 字` : file.text_extraction_status === "processing" || file.text_extraction_status === "pending" ? " · 正在建立全文索引" : file.text_extraction_status === "too_large" ? " · 文件过大，暂不解析" : file.text_extraction_status === "unsupported" ? " · 此类型暂不解析" : file.text_extraction_status === "failed" ? " · 文本解析失败" : ""}</p></div>{["failed", "pending", "not_requested"].includes(file.text_extraction_status) ? <button type="button" disabled={extractingId === file.id} onClick={() => void retryExtraction(file.id)} className="rounded px-2 py-1 text-xs text-[#365f78] hover:bg-[#edf3f6] disabled:opacity-50">{extractingId === file.id ? "解析中…" : "解析文本"}</button> : null}<a href={`/api/files/${file.id}/download`} className="rounded p-1.5 text-zinc-500 hover:bg-[#edf3f6] hover:text-[#365f78]" aria-label={`下载 ${file.title}`}><Download size={16} /></a><details className="relative"><summary aria-label={`操作 ${file.title}`} className="list-none rounded p-1.5 text-zinc-500 hover:bg-zinc-100"><MoreHorizontal size={16} /></summary><div className="absolute right-0 z-10 mt-1 w-52 border border-[#e7e5e4] bg-white p-2 shadow-lg"><form action={renameFile} className="space-y-2"><input name="title" defaultValue={file.title} className="w-full border border-[#d8d6d0] px-2 py-1 text-xs" /><input type="hidden" name="document_id" value={file.id} /><button className="text-xs text-[#365f78]">重命名</button></form><form action={moveFile} className="mt-2 border-t pt-2"><input type="hidden" name="document_id" value={file.id} /><select name="folder_id" defaultValue={file.folder_id ?? ""} className="w-full border border-[#d8d6d0] px-2 py-1 text-xs"><option value="">根目录</option>{sortedFolders.map((folder) => <option key={folder.id} value={folder.id}>{"　".repeat(folderDepth(folder, folders))}{folder.name}</option>)}</select><button className="mt-2 text-xs text-[#365f78]">移动文件</button></form><form action={archiveFile} className="mt-2 border-t pt-2"><input type="hidden" name="document_id" value={file.id} /><button className="inline-flex items-center gap-1 text-xs text-red-700"><Archive size={13} />归档</button></form></div></details></li>)}</ul>}
    </section>
  </div>;
}
