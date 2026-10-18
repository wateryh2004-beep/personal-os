/* eslint-disable @next/next/no-img-element -- private blob URLs must stay in this tab */
"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { draftStorageKey, openDraft, sealDraft, type VaultDraft } from "@/features/vault/client-crypto";
import { checksumFile } from "@/features/files/file-checksum";

const VaultPdfPreview = dynamic(() => import("./vault-pdf-preview").then(module => module.VaultPdfPreview), { ssr: false });
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
type Item = { id: string; title: string; folder_id: string | null; vault_group_id: string };
type FileItem = Item & { original_filename: string; mime_type: string; file_size: number; storage_state: "pending" | "available" | "archived" };
type Folder = { id: string; name: string; parent_id: string | null; vault_group_id: string };
type Catalog = { notes: Item[]; files: FileItem[]; noteFolders: Folder[]; fileFolders: Folder[] };
type Note = Item & { body_markdown: string; revision: number };
type Version = { id: string; title: string; body_markdown: string; version_number: number; created_at: string };
type Props = { access: { tab: string; owner: string; key: CryptoKey }; call: (url: string, init?: RequestInit) => Promise<Response>; lock: () => void; masked: boolean; onOrganize: () => void; shortcut: string; onShortcut: (value: string) => void };
const action = "min-h-11 rounded-lg px-3 text-sm hover:bg-[var(--surface-control)] disabled:opacity-40";
const field = "ui-field min-h-11 rounded-lg px-3 text-base";

export function VaultWorkspace({ access, call, lock, masked, onOrganize, shortcut, onShortcut }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [domain, setDomain] = useState<"notes" | "files">("notes");
  const [folder, setFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [restore, setRestore] = useState<{ kind: string; item: Item | Folder } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [settings, setSettings] = useState(false);
  const controller = useRef<AbortController | null>(null);


  const refresh = useCallback(async () => {
    try { setCatalog(await (await call("/api/vault/items", { signal: controller.current!.signal })).json()); }
    catch (reason) { if (!controller.current?.signal.aborted) setError(reason instanceof Error ? reason.message : "读取失败。"); }
  }, [call]);
  useEffect(() => { controller.current = new AbortController(); void refresh(); return () => controller.current?.abort(); }, [refresh]);

  async function create(kind: "note" | "note_folder" | "file_folder") {
    setBusy(true); setError("");
    try {
      const response = await call("/api/vault/create", { method: "POST", signal: controller.current!.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, folderId: folder, name: kind === "note" ? "无标题笔记" : folderName }) });
      const data = await response.json();
      await refresh(); setCreatingFolder(false); setFolderName("");
      if (kind === "note") setSelected(data.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "新建失败。"); }
    finally { setBusy(false); }
  }

  async function upload(file: File) {
    setBusy(true); setError("");
    try {
      const signal = controller.current!.signal;
      const checksum = await checksumFile(file, signal);
      const response = await call("/api/vault/upload", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, folderId: folder, checksum }) });
      const data = await response.json();
      const uploaded = await fetch(data.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" }, signal });
      if (!uploaded.ok) throw new Error("上传未完成，请重新选择文件重试。");
      await call("/api/vault/upload", { method: "PUT", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.id }) });
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "上传失败。"); }
    finally { setBusy(false); }
  }

  async function backup(kind: "system" | "files") {
    setBusy(true); setError("");
    try {
      const response = await call(`/api/vault/backup?kind=${kind}`, { method: "POST", signal: controller.current!.signal });
      const blob = await response.blob();
      controller.current!.signal.throwIfAborted();
      downloadBlob(blob, `personal-os-${kind}-with-private-${new Date().toISOString().slice(0, 10)}.${kind === "system" ? "ndjson" : "tar"}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "导出失败。"); }
    finally { setBusy(false); }
  }

  const folders = domain === "notes" ? catalog?.noteFolders : catalog?.fileFolders;
  const currentFolder = folders?.find(value => value.id === folder);
  const childFolders = folders?.filter(value => value.parent_id === folder || (!folder && !folders.some(parent => parent.id === value.parent_id))) ?? [];
  const items = (domain === "notes" ? catalog?.notes : catalog?.files)?.filter(value =>
    (query ? value.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) : value.folder_id === folder || (!folder && !folders?.some(parent => parent.id === value.folder_id)))) ?? [];

  return <DialogContent data-vault-content inert={masked} className="flex h-[92dvh] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]" onEscapeKeyDown={event => { event.preventDefault(); lock(); }} onPointerDownOutside={event => event.preventDefault()}>
      <DialogHeader className="shrink-0 border-b border-[var(--separator)] px-5 pb-3 pt-5 pr-12">
        <div className="flex items-center justify-between gap-3"><DialogTitle className="font-serif text-2xl">文档</DialogTitle><button className={action} aria-label="收起并锁定" onClick={lock}><span className="inline-block size-2 rounded-full bg-[var(--accent)]" /></button></div>
        <DialogDescription className="sr-only">已验证的独立文档工作区，退出即锁定。</DialogDescription>
        <div className="flex flex-wrap items-center gap-2"><button className={action} onClick={onOrganize}>整理普通内容</button><button className={action} onClick={() => setSettings(!settings)}>选项</button><span className="ml-auto text-xs text-[var(--text-secondary)]">⌘ / Ctrl ⇧ {shortcut.toUpperCase()} 收起</span></div>
      </DialogHeader>
      {error ? <p role="alert" className="shrink-0 px-5 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {settings ? <section className="shrink-0 space-y-3 border-b border-[var(--separator)] px-5 py-4">
        <label className="flex items-center gap-3 text-sm">快捷键：⌘ / Ctrl + Shift +<select className={field} value={shortcut} onChange={e => onShortcut(e.target.value)}>{"puybh".split("").map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
        <p className="text-sm text-[var(--text-secondary)]">闲置 5 分钟或离开页面 30 秒后锁定。刷新后重新验证。独立口令没有免验证找回入口，请妥善保管。</p>
        <p className="text-sm text-[var(--text-secondary)]">完整备份需同时保存系统快照和文件原件包。以下两项均包含普通内容与暗格，下载后请保存在私人位置。</p>
        <div className="flex flex-wrap gap-2"><button disabled={busy} className={action} onClick={() => void backup("system")}>下载系统快照（含暗格）</button><button disabled={busy} className={action} onClick={() => void backup("files")}>下载文件原件包（含暗格）</button></div>
      </section> : null}
      {selected ? <VaultNoteEditor key={selected} id={selected} access={access} call={call} onBack={() => { setSelected(null); void refresh(); }} /> : preview ? <VaultFileViewer key={preview.id} file={preview} call={call} onBack={() => setPreview(null)} /> : <div className="min-h-0 flex-1 overflow-auto px-5 pb-6">
        <div className="sticky top-0 z-10 flex flex-wrap gap-2 bg-[var(--surface-elevated)] py-3"><button className={action} aria-pressed={domain === "notes"} onClick={() => { setDomain("notes"); setFolder(null); setQuery(""); }}>笔记</button><button className={action} aria-pressed={domain === "files"} onClick={() => { setDomain("files"); setFolder(null); setQuery(""); }}>文件</button><input aria-label="搜索暗格" placeholder="搜索标题…" value={query} onChange={e => setQuery(e.target.value)} className={`${field} min-w-0 flex-1`} /></div>
        <div className="mb-3 flex flex-wrap items-center gap-2"><button className={action} onClick={() => { setFolder(currentFolder?.parent_id && folders?.some(value => value.id === currentFolder.parent_id) ? currentFolder.parent_id : null); setQuery(""); }}>{currentFolder ? "返回上级" : "全部"}</button><span className="mr-auto text-sm">{currentFolder?.name}</span><button disabled={busy} className={action} onClick={() => setCreatingFolder(!creatingFolder)}>新建文件夹</button>{domain === "notes" ? <button disabled={busy} className={action} onClick={() => void create("note")}>新建笔记</button> : <label className={`${action} inline-flex cursor-pointer items-center`}>{busy ? "正在上传并校验…" : "上传文件"}<input type="file" className="sr-only" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} /></label>}</div>
        {creatingFolder ? <form className="mb-4 flex gap-2" onSubmit={e => { e.preventDefault(); void create(domain === "notes" ? "note_folder" : "file_folder"); }}><input required maxLength={120} aria-label="文件夹名称" value={folderName} onChange={e => setFolderName(e.target.value)} className={`${field} min-w-0 flex-1`} /><button className={action} disabled={busy}>创建</button></form> : null}
        {!query && childFolders.map(value => <div key={value.id} className="flex items-center border-b border-[var(--separator)] py-2"><button className={`${action} min-w-0 flex-1 text-left`} onClick={() => setFolder(value.id)}>▸ {value.name}</button><button className={action} onClick={() => setRestore({ kind: domain === "notes" ? "note_folder" : "file_folder", item: value })}>移回</button></div>)}
        {!catalog ? <p role="status" className="py-10 text-sm">正在读取…</p> : !items.length && !childFolders.length ? <p className="py-10 text-sm text-[var(--text-secondary)]">{query ? "没有找到匹配的内容。" : "这里还没有内容。可以新建，或先整理普通内容。"}</p> : null}
        {items.map(item => <div key={item.id} className="flex items-center gap-2 border-b border-[var(--separator)] py-3"><button className={`${action} min-w-0 flex-1 break-words text-left`} disabled={domain === "files" && (item as FileItem).storage_state === "pending"} onClick={() => domain === "notes" ? setSelected(item.id) : setPreview(item as FileItem)}>{item.title}{domain === "files" && (item as FileItem).storage_state === "pending" ? <span className="ml-2 text-xs">上传待完成</span> : null}</button>{domain === "files" && (item as FileItem).storage_state === "pending" ? <button disabled={busy} className={action} onClick={async () => { setBusy(true); try { await call("/api/vault/upload", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) }); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "原件尚未上传完成，请重新选择同一文件上传。"); } finally { setBusy(false); } }}>重试校验</button> : null}<button className={action} onClick={() => setRestore({ kind: domain === "notes" ? "note" : "document", item })}>移回</button></div>)}
      </div>}
      {restore ? <div role="alertdialog" aria-label="移回普通工作区" className="absolute inset-0 z-30 grid place-items-center bg-black/30 p-5"><div className="w-full max-w-sm rounded-xl bg-[var(--surface-elevated)] p-5 shadow-xl"><h3 className="mb-3 font-medium">移回普通工作区？</h3><p className="text-sm leading-6">此项及同批收入的文件夹、笔记和附件将一起恢复到原位置，并按各自原有的 AI 设置参与检索。</p><div className="mt-4 flex justify-end gap-2"><button className={action} onClick={() => setRestore(null)}>取消</button><button className={action} disabled={busy} onClick={async () => { setBusy(true); try { await call("/api/vault/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: restore.kind, id: restore.item.id, hidden: false }) }); setRestore(null); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "恢复失败。"); } finally { setBusy(false); } }}>确认移回</button></div></div></div> : null}
    </DialogContent>;
}

function VaultNoteEditor({ id, access, call, onBack }: { id: string; access: Props["access"]; call: Props["call"]; onBack: () => void }) {
  const [note, setNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState<VaultDraft | null>(null);
  const [recovery, setRecovery] = useState<VaultDraft | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [history, setHistory] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const latest = useRef<VaultDraft | null>(null);
  const sequence = useRef(Promise.resolve());
  const storage = draftStorageKey(access.owner, id);
  const mounted = useRef(true);
  const pending = useRef(0);
  const dirtyRef = useRef(false);
  const persist = useCallback((value: VaultDraft) => {
    pending.current++;
    sequence.current = sequence.current.catch(() => {}).then(async () => {
      const sealed = await sealDraft(access.key, value, access.owner);
      sessionStorage.setItem(storage, sealed);
    }).catch(() => { if (mounted.current) setError("浏览器无法保留加密草稿，请保存到云端后再离开。"); }).finally(() => { pending.current--; });
  }, [access.key, access.owner, storage]);
  useEffect(() => {
    const controller = new AbortController(); mounted.current = true;
    void call(`/api/vault/items?note=${id}`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!mounted.current) return;
      const value = { id, title: data.note.title, body: data.note.body_markdown, revision: data.note.revision, savedAt: Date.now() };
      setNote(data.note); setDraft(value); latest.current = value; setVersions(data.versions);
      const raw = sessionStorage.getItem(storage);
      if (raw) {
        try {
          const restored = await openDraft(access.key, raw, access.owner, id);
          if (mounted.current && (restored.body !== value.body || restored.title !== value.title)) setRecovery(restored);
        } catch { if (mounted.current) setError("存在无法解密的草稿，请保留当前标签页并核对口令。"); }
      }
    }).catch(reason => { if (mounted.current && !controller.signal.aborted) setError(reason.message); });
    const seal = () => { if (latest.current && dirtyRef.current) persist(latest.current); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (pending.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("personal-os:private-seal", seal); window.addEventListener("beforeunload", beforeUnload);
    return () => { mounted.current = false; controller.abort(); seal(); window.removeEventListener("personal-os:private-seal", seal); window.removeEventListener("beforeunload", beforeUnload); };
  }, [id, access.key, access.owner, call, persist, storage]);
  function change(value: VaultDraft) { latest.current = value; dirtyRef.current = true; setDirty(true); setDraft(value); persist(value); }
  async function save() {
    if (!latest.current || busy) return;
    const value = latest.current;
    setBusy(true); setError("");
    try {
      const result = await (await call("/api/vault/items", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, title: value.title, body: value.body, revision: value.revision }) })).json();
      if (!mounted.current) return;
      if (latest.current === value) {
        const next = { ...value, revision: result.revision }; latest.current = next; setDraft(next); dirtyRef.current = false; setDirty(false);
        await sequence.current; sessionStorage.removeItem(storage);
      } else if (latest.current) {
        const next = { ...latest.current, revision: result.revision }; latest.current = next; setDraft(next); persist(next);
      }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "保存失败。"); }
    finally { if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  });

  return <section className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2"><button className={action} onClick={onBack}>返回</button><span role="status" className="mr-auto text-xs text-[var(--text-secondary)]">{busy ? "正在保存…" : dirty ? "未保存；加密草稿保留在此标签页" : "已保存"}</span><button className={action} onClick={() => setHistory(!history)}>历史版本</button><button disabled={!draft || busy || !dirty} className={action} onClick={() => void save()}>保存</button></div>
    {error ? <p role="alert" className="px-5 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
    {recovery && draft ? <div className="mx-5 mb-3 rounded-lg bg-[var(--accent-soft)] p-3 text-sm"><p>{recovery.revision === draft.revision ? "找到尚未保存的加密草稿。" : "草稿基于旧版本。请先比较下方草稿与当前正文，再决定是否继续编辑。"}</p><details className="my-2"><summary>查看草稿</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{recovery.title}{"\n"}{recovery.body}</pre></details><button className={action} onClick={() => { change({ ...recovery, revision: draft.revision }); setRecovery(null); }}>在当前版本继续编辑</button><button className={action} onClick={() => { setRecovery(null); sessionStorage.removeItem(storage); }}>使用云端版本</button></div> : null}
    {history ? <div className="mx-5 mb-3 max-h-40 shrink-0 overflow-auto rounded-lg border border-[var(--separator)] p-2">{versions.length ? versions.map(value => <button key={value.id} className={`${action} block w-full text-left`} onClick={() => { if (draft) change({ ...draft, title: value.title, body: value.body_markdown }); setHistory(false); }}>版本 {value.version_number} · {new Date(value.created_at).toLocaleString()} · 载入为草稿</button>) : <p className="p-3 text-sm">尚无历史版本。</p>}</div> : null}
    {draft && note ? <><input aria-label="笔记标题" maxLength={240} value={draft.title} onChange={e => change({ ...draft, title: e.target.value, savedAt: Date.now() })} className="mx-5 mb-3 min-h-11 shrink-0 bg-transparent font-serif text-2xl outline-none" /><div className="min-h-0 flex-1 overflow-auto px-3 pb-6"><CodeMirror value={draft.body} extensions={[markdown()]} onChange={value => change({ ...draft, body: value, savedAt: Date.now() })} basicSetup={{ lineNumbers: false, foldGutter: false }} aria-label="笔记正文" className="min-h-full text-base [&_.cm-editor]:min-h-[45vh] [&_.cm-content]:leading-7" /></div></> : !error ? <p className="p-5 text-sm">正在读取…</p> : null}
  </section>;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function VaultFileViewer({ file, call, onBack }: { file: FileItem; call: Props["call"]; onBack: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | undefined;
    void call(`/api/vault/files/${file.id}`, { signal: controller.signal }).then(response => response.blob()).then(value => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(value); setUrl(objectUrl); setBlob(value);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.id, call]);
  const image = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(file.mime_type);
  return <section className="flex min-h-0 flex-1 flex-col"><div className="flex flex-wrap items-center gap-2 px-4 py-2"><button className={action} onClick={onBack}>返回</button><span className="min-w-0 flex-1 break-words text-sm">{file.title}</span><button className={action} disabled={!blob} onClick={() => blob && downloadBlob(blob, file.original_filename)}>下载原件</button></div>{error ? <p role="alert" className="p-5 text-sm text-[var(--danger)]">{error}</p> : !url ? <p role="status" className="p-5 text-sm">正在读取…</p> : image ? <div className="min-h-0 flex-1 overflow-auto p-5"><img src={url} alt={file.title} className="mx-auto max-h-full max-w-full object-contain" /></div> : file.mime_type === "application/pdf" ? <VaultPdfPreview blob={blob!} title={file.title} /> : <p className="p-5 text-sm text-[var(--text-secondary)]">此格式请下载原件查看。</p>}</section>;
}
