"use client";

import { Archive, Download, File, FilePlus2, Folder, FolderPlus, LoaderCircle, MoreHorizontal, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { archiveFile, createFileFolder, moveFile, renameFile } from "@/features/files/actions";
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

export function FilesWorkspace({ folders, files }: { folders: FileFolder[]; files: FileRecord[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => folderDepth(a, folders) - folderDepth(b, folders) || a.name.localeCompare(b.name, "zh-CN")), [folders]);
  const visibleFiles = files.filter((file) => file.folder_id === folderId);
  const activeFolder = folders.find((folder) => folder.id === folderId);

  async function upload(filesToUpload: FileList | null) {
    if (!filesToUpload?.length || uploading) return;
    setUploading(true); setMessage("");
    try {
      for (const file of Array.from(filesToUpload)) {
        const created = await fetch("/api/files/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, folderId }) });
        const payload = await created.json() as { documentId?: string; uploadUrl?: string; error?: string };
        if (!created.ok || !payload.documentId || !payload.uploadUrl) throw new Error(payload.error || "上传准备失败。");
        const sent = await fetch(payload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!sent.ok) throw new Error("文件未能传入云端存储。");
        const completed = await fetch("/api/files/upload-url", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: payload.documentId }) });
        if (!completed.ok) throw new Error("文件上传后未能确认。");
      }
      setMessage(`已上传 ${filesToUpload.length} 个文件。`); window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "上传失败，请重试。"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return <div className="grid min-h-[32rem] gap-0 border border-[#e7e5e4] bg-white lg:grid-cols-[15rem_minmax(0,1fr)]">
    <aside className="border-b border-[#e7e5e4] p-4 lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between"><p className="text-xs font-medium tracking-wide text-zinc-500">文件夹</p><button type="button" onClick={() => setCreatingFolder((value) => !value)} aria-label="新建文件夹" className="rounded p-1.5 text-[#365f78] hover:bg-[#edf3f6]"><FolderPlus size={17} /></button></div>
      {creatingFolder ? <form action={createFileFolder} className="mt-3 flex gap-1"><input name="name" required maxLength={160} autoFocus placeholder="文件夹名称" className="min-w-0 flex-1 border border-[#d8d6d0] bg-white px-2 py-1 text-xs" /><input type="hidden" name="parent_id" value={folderId ?? ""} /><button className="bg-[#365f78] px-2 text-xs text-white">创建</button></form> : null}
      <button onClick={() => setFolderId(null)} className={`mt-3 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${folderId === null ? "bg-[#edf3f6] text-[#365f78]" : "text-zinc-700 hover:bg-zinc-50"}`}><Folder size={16} />全部文件 <span className="ml-auto font-mono text-xs text-zinc-400">{files.length}</span></button>
      <div className="mt-1 space-y-0.5">{sortedFolders.map((folder) => <button key={folder.id} onClick={() => setFolderId(folder.id)} style={{ paddingLeft: `${8 + folderDepth(folder, folders) * 14}px` }} className={`flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left text-sm ${folder.id === folderId ? "bg-[#edf3f6] text-[#365f78]" : "text-zinc-700 hover:bg-zinc-50"}`}><Folder size={15} />{folder.name}</button>)}</div>
      <p className="mt-5 text-xs leading-5 text-zinc-400">在当前文件夹中新建子文件夹，或将文件移动至任意文件夹。</p>
    </aside>
    <section className="min-w-0 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e7e5e4] pb-4"><div><h1 className="text-xl font-semibold text-zinc-900">{activeFolder?.name ?? "全部文件"}</h1><p className="mt-1 text-sm text-zinc-500">{activeFolder ? `${visibleFiles.length} 个文件` : `${files.length} 个文件`}</p></div><div><input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => void upload(event.target.files)} /><button disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 bg-[#365f78] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{uploading ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}{uploading ? "正在上传…" : "上传文件"}</button></div></div>
      {message ? <p role="status" className={`mt-3 text-sm ${message.startsWith("已") ? "text-[#365f78]" : "text-red-700"}`}>{message}</p> : null}
      {!visibleFiles.length ? <div className="flex min-h-64 flex-col items-center justify-center text-center"><FilePlus2 size={28} className="text-[#365f78]" /><h2 className="mt-3 font-medium text-zinc-900">这里还没有文件</h2><p className="mt-1 text-sm text-zinc-500">上传文件，或切换到其他文件夹。</p></div> : <ul className="divide-y divide-[#eceae6]">{visibleFiles.map((file) => <li className="flex items-center gap-3 py-3" key={file.id}><File size={18} className="shrink-0 text-zinc-400" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-800">{file.title}</p><p className="mt-0.5 font-mono text-xs text-zinc-400">{formatBytes(file.file_size)} · {new Date(file.uploaded_at).toLocaleDateString("zh-CN")}</p></div><a href={`/api/files/${file.id}/download`} className="rounded p-1.5 text-zinc-500 hover:bg-[#edf3f6] hover:text-[#365f78]" aria-label={`下载 ${file.title}`}><Download size={16} /></a><details className="relative"><summary aria-label={`操作 ${file.title}`} className="list-none rounded p-1.5 text-zinc-500 hover:bg-zinc-100"><MoreHorizontal size={16} /></summary><div className="absolute right-0 z-10 mt-1 w-52 border border-[#e7e5e4] bg-white p-2 shadow-lg"><form action={renameFile} className="space-y-2"><input name="title" defaultValue={file.title} className="w-full border border-[#d8d6d0] px-2 py-1 text-xs" /><input type="hidden" name="document_id" value={file.id} /><button className="text-xs text-[#365f78]">重命名</button></form><form action={moveFile} className="mt-2 border-t pt-2"><input type="hidden" name="document_id" value={file.id} /><select name="folder_id" defaultValue={file.folder_id ?? ""} className="w-full border border-[#d8d6d0] px-2 py-1 text-xs"><option value="">根目录</option>{sortedFolders.map((folder) => <option key={folder.id} value={folder.id}>{"　".repeat(folderDepth(folder, folders))}{folder.name}</option>)}</select><button className="mt-2 text-xs text-[#365f78]">移动文件</button></form><form action={archiveFile} className="mt-2 border-t pt-2"><input type="hidden" name="document_id" value={file.id} /><button className="inline-flex items-center gap-1 text-xs text-red-700"><Archive size={13} />归档</button></form></div></details></li>)}</ul>}
    </section>
  </div>;
}
