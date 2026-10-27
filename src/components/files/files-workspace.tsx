"use client";
import { startFileUpload, type UploadPlan } from "@/features/files/upload-runner";
import { UploadStaging } from "./upload-staging";
import { beginFileStaging, readFileStaging, getFileStagingSnapshot, getFileStagingServerSnapshot, subscribeFileStaging, type FileStagingSession } from "@/features/files/staging-runtime";
import { useDomainViewAdapter,waitForViewLayout } from "@/features/workbench/domain-adapters/use-domain-view-adapter";
import { useDraftResumeOpeners, useDraftResumeConsumer,focusDraftForm } from "@/features/workflow-continuity/draft-resume";
import { parseSourceLocator, type PdfSourceLocator } from "@/features/links/source-locator";
import { FilePublicationRecovery } from "./file-publication-recovery";
import { useFilePublications } from "./use-file-publications";
import { publishFileRecordChange } from "@/features/files/publication";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";

import {useMetadataVerificationTransport} from "@/components/workbench/workbench-provider";
import { readWorkbenchReceiptState } from "@/features/workbench/operation-actions";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { OperationMetadataBar } from "@/components/workbench/operation-metadata-bar";
import { publishOperationReceipt } from "@/features/workbench/operation-contracts";
import { FileOcrControl } from "./file-ocr-control";
import { WorkspaceReadyMetric } from "@/components/performance/workspace-ready-metric";
import { FileResumableUploads } from "./file-resumable-uploads";
import { completeMultipartSession } from "@/features/files/multipart-client";
import type { MultipartSnapshot } from "@/features/files/multipart-upload";
import { FilePdfCover } from "./file-pdf-cover";
import { FilePdfPreview } from "./file-pdf-preview";
import { isPdfFile } from "@/features/files/preview-format";
import { FilePhoto } from "./file-photo";
import { useFilePreviewMotion } from "./use-file-preview-motion";
import { classifyFile, defaultFileBrowserState, fileBrowserUrl, filesPerPage, revealFileState, fileSortLabels, fileSorts, fileTypeLabels, fileTypes, parseFileBrowserState, selectFiles, type FileBrowserState } from "@/features/files/browser-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileRecoveryPanel } from "./file-recovery-panel";
import { FileMutationForm } from "./file-mutation-form";
import { useFileRows } from "./use-file-rows";
import { completeFileUpload } from "@/features/files/complete-upload";
import { runUploadBatch } from "@/features/files/upload-batch";

import { VaultHideButton } from "@/components/vault/vault-provider";
import { Archive, ChevronLeft, ChevronRight, Download, Eye, File, FilePlus2, Folder, FolderPlus, LoaderCircle, MoreHorizontal, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { archiveFile, createFileFolder, moveFile, renameFile, restoreFile, setFileAiVisibility } from "@/features/files/actions";
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

function FileOperations({ file, folders, onArchive,resumeRequestId }: { resumeRequestId?:string; file: FileRecord; folders: FileFolder[]; onArchive: (file: FileRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [baseline,setBaseline] = useState(file);
  useDraftResumeConsumer({kind:"file.rename",identity:{id:file.id},ready:()=>true,open:async(target,context)=>{setOpen(true);return focusDraftForm(target,context);}});
  useDraftResumeConsumer({kind:"file.move",identity:{id:file.id},ready:()=>true,open:async(target,context)=>{setOpen(true);return focusDraftForm(target,context);}});
  useDraftResumeConsumer({kind:"file.visibility",identity:{id:file.id},ready:()=>true,open:async(target,context)=>{setOpen(true);return focusDraftForm(target,context);}});
  const [resumeSeen,setResumeSeen]=useState(resumeRequestId);if(resumeRequestId&&resumeSeen!==resumeRequestId){setResumeSeen(resumeRequestId);setOpen(true);}
  const close = () => setOpen(false);
  useMobileBackLayer(open, close, `file-operations:${file.id}`);
  return <Popover open={open} onOpenChange={next=>{if(next)setBaseline(file);setOpen(next);}}>
    <PopoverTrigger asChild><button type="button" aria-label={`操作 ${file.title}`} className="pressable flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><MoreHorizontal size={15} /></button></PopoverTrigger>
    <PopoverContent aria-label={`操作 ${file.title}`} align="end" collisionPadding={12} onOpenAutoFocus={(event) => { if (window.matchMedia("(pointer: coarse)").matches) event.preventDefault(); }} className="files-actions-popover w-60 max-h-[min(65dvh,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain">
      <FileMutationForm draft={{operation:"file.rename",id:file.id,href:"/files",label:"文件重命名"}} action={renameFile} onSuccess={close} className="space-y-2"><input aria-label="文件名称" name="title" required maxLength={240} defaultValue={baseline.title} className="ui-field h-8 w-full rounded-[8px] bg-[var(--surface-control)] px-2.5 text-[12px] outline-none" /><input type="hidden" name="document_id" value={file.id} /><input type="hidden" name="expected_revision" value={baseline.mutation_revision ?? ""} /><button className="text-[12px] font-medium text-[var(--accent)]">重命名</button></FileMutationForm>
      <FileMutationForm draft={{operation:"file.move",id:file.id,href:"/files",label:"移动文件"}} action={moveFile} onSuccess={close} className="mt-2 border-t border-[var(--separator)] pt-2"><input type="hidden" name="document_id" value={file.id} /><input type="hidden" name="expected_revision" value={baseline.mutation_revision ?? ""} /><select aria-label="目标文件夹" name="folder_id" defaultValue={baseline.folder_id ?? ""} className="ui-field h-8 w-full rounded-[8px] bg-[var(--surface-control)] px-2 text-[12px] outline-none"><option value="">根目录</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{"　".repeat(folderDepth(folder, folders))}{folder.name}</option>)}</select><button className="mt-1.5 text-[12px] font-medium text-[var(--accent)]">移动文件</button></FileMutationForm>
      <FileMutationForm draft={{operation:"file.visibility",id:file.id,href:"/files",label:"文件 AI 可见性"}} action={setFileAiVisibility} onSuccess={close} className="mt-2 border-t border-[var(--separator)] pt-2"><input type="hidden" name="document_id" value={file.id}/><select aria-label="文件 AI 可见性" name="ai_visibility" defaultValue={file.ai_visibility} className="ui-field h-8 w-full rounded-[8px] bg-[var(--surface-control)] px-2 text-[12px] outline-none"><option value="normal">AI 可正常使用</option><option value="sensitive">敏感：默认不发送</option><option value="never">永不发送给 AI</option></select><button className="mt-1.5 text-[12px] font-medium text-[var(--accent)]">保存隐私设置</button></FileMutationForm>
      <VaultHideButton kind="document" id={file.id} onDone={close} className="w-full text-left" />
      <button type="button" onClick={() => { close(); onArchive(baseline); }} className="mt-2 inline-flex items-center gap-1 border-t border-[var(--separator)] pt-2 text-[12px] text-[var(--danger)]"><Archive size={12} />归档</button>

    </PopoverContent>
  </Popover>;
}

export function FilesWorkspace({ folders, files, archivedFiles = emptyFiles, initialUpload = false, initialFileId, initialBrowserState = defaultFileBrowserState }: { folders: FileFolder[]; files: FileRecord[]; archivedFiles?: FileRecord[]; initialUpload?: boolean; initialFileId?: string; initialBrowserState?: FileBrowserState }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const uploadInFlight = useRef(false);
  const uploadCancels = useRef<Array<() => void>>([]);
  const [stagedSession, setStagedSession] = useState<FileStagingSession | null>(null);
  const stagingSnapshot=useSyncExternalStore(subscribeFileStaging,getFileStagingSnapshot,getFileStagingServerSnapshot);
  useDraftResumeOpeners(stagingSnapshot?[{kind:"file.staging",id:stagingSnapshot.id}]:[],target=>{const session=readFileStaging(target.id);if(!session)return false;setStagedSession(session);});
  const [pdfLocator, setPdfLocator] = useState<PdfSourceLocator | null>(null);
  const [browser, setBrowser] = useState<FileBrowserState>(() => initialFileId ? revealFileState(files, initialBrowserState, initialFileId) : initialBrowserState);
  const [folderId, setFolderId] = useState<string | null>(browser.folderId);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [archivedLimit, setArchivedLimit] = useState(filesPerPage);
  const [highlightId, setHighlightId] = useState<string | null>(initialFileId && files.some((item) => item.id === initialFileId) ? initialFileId : null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
    const locator = parseSourceLocator(`${window.location.pathname}${window.location.search}`);
    if (locator?.kind === "pdf" && files.some((file) => file.id === locator.documentId)) {
      setPdfLocator(locator); setPreviewId(locator.documentId); setPreviewOpen(true);
    }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialFileId, files]);
  const previewLauncher = useRef<HTMLElement | null>(null);
  const previewSource = useRef<HTMLElement | null>(null);
  const previewSurface = useFilePreviewMotion(previewOpen, previewSource, previewId);
  const previewScrollRef=useRef<HTMLDivElement|null>(null);
  const previewRef=useCallback((node:HTMLDivElement|null)=>{previewScrollRef.current=node;previewSurface(node);},[previewSurface]);
  const openPreview = (file: FileRecord, launcher: HTMLElement) => {
    previewLauncher.current = launcher;
    previewSource.current = launcher;
    setPreviewId(file.id);
    setPreviewOpen(true);
  };
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
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");
  const [operationResume,setOperationResume]=useState<{id:string;nonce:string}|null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const { show } = useActionFeedback();
  const reportPublicationFailure = useCallback(() => show({ message: "文件已变更，但列表状态暂未读取；返回页面、恢复网络或切回窗口后会重试。", tone: "error" }), [show]);
  useFilePublications(files, archivedRows, setFileRows, reportPublicationFailure, fileRows);
  const canonicalRevisions=useRef(new Map<string,number>());
  useEffect(()=>{for(const row of [...fileRows,...archivedRows]){const revision=row.mutation_revision;if(revision!==undefined)canonicalRevisions.current.set(row.id,Math.max(revision,canonicalRevisions.current.get(row.id)??-1));}},[fileRows,archivedRows]);
  const metadataTransport=useMetadataVerificationTransport();
  useEffect(()=>{const listener=(event:Event)=>{const receiptId=(event as CustomEvent<{receiptId:string}>).detail?.receiptId;if(!receiptId)return;const current=captureWorkspaceScope();void (metadataTransport?.readReceipt??readWorkbenchReceiptState)(receiptId).then(value=>{if(!current()||value.kind!=="document")return;const canonical=(value.rows as FileRecord[]).filter(row=>{const revision=row.mutation_revision;if(revision===undefined||revision<(canonicalRevisions.current.get(row.id)??-1))return false;canonicalRevisions.current.set(row.id,revision);return true;});const ids=new Set(canonical.map(row=>row.id));setFileRows(rows=>[...rows.filter(row=>!ids.has(row.id)),...canonical.filter(row=>!row.archived_at)]);setArchivedRows(rows=>[...rows.filter(row=>!ids.has(row.id)),...canonical.filter(row=>Boolean(row.archived_at))]);}).catch(()=>{if(current())show({message:"文件状态暂未重新读取，请稍后重试。",tone:"error"});});};window.addEventListener("personal-os:operation-undone",listener);window.addEventListener("personal-os:operation-completed",listener);return()=>{window.removeEventListener("personal-os:operation-undone",listener);window.removeEventListener("personal-os:operation-completed",listener);};},[metadataTransport,setFileRows,setArchivedRows,show]);
  useDraftResumeOpeners([{kind:"file.folder",id:"new"},...fileRows.flatMap(file=>[{kind:"file.rename" as const,id:file.id},{kind:"file.move" as const,id:file.id},{kind:"file.visibility" as const,id:file.id}])],target=>{if(target.kind==="file.folder"){setCreatingFolder(true);return;}const row=fileRows.find(file=>file.id===target.id);if(!row)return false;const reveal=revealFileState(fileRows,browser,target.id);setBrowser(reveal);setFolderId(reveal.folderId);setOperationResume({id:target.id,nonce:crypto.randomUUID()});return;});
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => folderDepth(a, folders) - folderDepth(b, folders) || a.name.localeCompare(b.name, "zh-CN")), [folders]);
  const selection = useMemo(() => selectFiles(fileRows, { ...browser, folderId }), [fileRows, browser, folderId]);
  const visibleFiles = selection.visible;
  const totalPages = Math.max(1, Math.ceil(visibleFiles.length / filesPerPage));
  const currentPage = Math.min(browser.page, totalPages);
  const displayedFiles = visibleFiles.slice((currentPage - 1) * filesPerPage, currentPage * filesPerPage);
  const visibleArchived = useMemo(() => selectFiles(archivedRows, { ...browser, folderId: null }).visible, [archivedRows, browser]);
  const previewFile = fileRows.find(file => file.id === previewId) ?? null;
  // The existing filter and sort own the queue; the viewer holds no second file snapshot.
  const previewFiles = visibleFiles.filter(file => classifyFile(file) === "photo" || isPdfFile(file));
  const previewIndex = previewFiles.findIndex(file => file.id === previewId);
  const switchPreview = (offset: -1 | 1) => {
    const next = previewFiles[previewIndex + offset];
    if (previewIndex >= 0 && next) {
      const source = document.getElementById(`file-${next.id}`);
      previewSource.current = source && sectionRef.current?.contains(source) ? source : null;
      setPreviewId(next.id);
    }
  };
  useDomainViewAdapter({kind:"files",pathname:"/files",ready:true,capture:()=>({kind:"files",previewDocumentId:previewId,previewOpen:previewOpen&&Boolean(previewFile),listScrollTop:sectionRef.current?.scrollTop??0,previewScrollTop:previewScrollRef.current?.scrollTop??0}),restore:async(state,context)=>{if(!context.current())return {status:"cancelled"};const file=state.previewDocumentId?fileRows.find(row=>row.id===state.previewDocumentId):undefined;if(state.previewDocumentId&&!file)return {status:"partial",reason:"missing-record"};if(file){const reveal=revealFileState(fileRows,browser,file.id);setBrowser(reveal);setFolderId(reveal.folderId);setPreviewId(file.id);setPreviewOpen(state.previewOpen&&(isPdfFile(file)||classifyFile(file)==="photo"));}else{setPreviewOpen(false);setPreviewId(null);}if(!await waitForViewLayout(context))return {status:"cancelled"};if(sectionRef.current)sectionRef.current.scrollTop=state.listScrollTop;if(previewScrollRef.current)previewScrollRef.current.scrollTop=state.previewScrollTop;return state.previewOpen&&(!file||!isPdfFile(file)&&classifyFile(file)!=="photo")?{status:"partial",reason:"missing-record"}:{status:"applied"};}});
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

  async function upload(filesToUpload: FileList | File[] | null, resume?: MultipartSnapshot, plans?: UploadPlan[]) {
    if (!filesToUpload?.length || uploadInFlight.current) return;
    const selectedPlans = plans ?? Array.from(filesToUpload).map(file => ({ id: crypto.randomUUID(), file, title: resume?.file.title ?? file.name, folderId: resume?.folderId ?? folderId, resume }));
    const current = captureWorkspaceScope();
    uploadInFlight.current = true; setStage("uploading"); setMessage("上传已交给任务托盘，可继续使用其他页面。");
    const result = await runUploadBatch(selectedPlans, async plan => {
      if (!current()) throw new Error("工作区已变化，请重新选择原件后上传。");
      const operation = startFileUpload(plan);
      uploadCancels.current.push(operation.cancel);
      await operation.completion;
    }, 2);
    if (current() && mounted.current) { setStage("idle"); setMessage(result.errors.length ? `${result.errors.length} 个文件任务未能启动，请保留原件并稍后重新选择；其他任务结果在托盘中。` : "本批任务已结束，请在任务托盘查看每项结果；可仅重试失败项。"); }
    uploadInFlight.current = false;
    if (current() && mounted.current && inputRef.current) inputRef.current.value = "";
  }

  async function finishPending(session: MultipartSnapshot) {
    if (uploadInFlight.current) return;
    const current = captureWorkspaceScope();
    uploadInFlight.current = true; setStage("verifying"); setMessage("");
    try {
      const snapshot = await completeMultipartSession(session.sessionId);
      if (!current()) return;
      const response = await completeFileUpload(snapshot.documentId);
      if (!response.ok) throw new Error(await responseError(response, "保存状态未确认，请稍后重试。"));
      const result = await response.json() as { warning?: string; extractionStatus?: FileRecord["text_extraction_status"] };
      if (!current()) return;
      publishFileRecordChange(snapshot.documentId, current);
      if (!mounted.current) return;
      setStage("complete"); setMessageTone(result.warning ? "error" : "success"); setMessage(result.warning ?? "文件已完成保存。");
    } catch (error) { if (current() && mounted.current) { setStage("error"); setMessageTone("error"); setMessage(error instanceof Error ? error.message : "保存暂未完成，可稍后重试。"); } }
    finally { uploadInFlight.current = false; }
  }

  async function retryExtraction(documentId: string) {
    const current = captureWorkspaceScope();
    setExtractingId(documentId); setMessage(""); setMessageTone("neutral");
    try {
      const response = await fetch(`/api/files/${documentId}/extract`, { method: "POST", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(await responseError(response, "文本解析失败，请稍后重试。"));
      await response.json();
      if (!current()) return;
      publishFileRecordChange(documentId, current);
      if (!mounted.current) return;
      setMessage("文件文本解析状态已更新。"); setMessageTone("success");
    } catch (error) {
      if (current() && mounted.current) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "文本解析失败，请稍后重试。"); }
    } finally { if (current() && mounted.current) setExtractingId(null); }
  }

  const archive = (file: FileRecord) => {
    const scopeCurrent=captureWorkspaceScope();
    if (previewId === file.id) setPreviewId(null);
    const archived = { ...file, archived_at: new Date().toISOString() };
    setFileRows((current) => current.filter((item) => item.id !== file.id));
    setArchivedRows((current) => [archived, ...current.filter((item) => item.id !== file.id)]);
    const form = new FormData(); form.set("document_id", file.id);
    form.set("request_id",crypto.randomUUID());
    form.set("expected_revision",String(file.mutation_revision ?? ""));
    void archiveFile(form).then((result) => {if(!scopeCurrent())return;if(result.receiptId)publishOperationReceipt({receiptId:result.receiptId,message:"文件已归档"});else show({message:"文件已归档",tone:"success"});}).catch(() => { if(!scopeCurrent())return;setArchivedRows((current) => current.filter((item) => item.id !== file.id)); setFileRows((current) => [file, ...current]); show({ message: "归档结果未确认，请刷新后检查文件状态。", tone: "error" }); });
  };

  return (
    <div className="files-workspace grid grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1 h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 bg-[var(--surface-canvas)] md:min-h-[540px] md:grid-cols-[216px_minmax(0,1fr)]">
      <aside className="workspace-scroll min-h-0 max-h-48 overflow-y-auto md:max-h-none border-b border-white/55 bg-[var(--material-sidebar)] p-3 md:border-b-0 md:border-r">
        <div className="flex h-8 items-center justify-between px-1">
          <p className="text-[12px] font-semibold tracking-[.04em] text-[var(--text-tertiary)]">文件夹</p>
          <button type="button" onClick={() => setCreatingFolder((value) => !value)} aria-label="新建文件夹" className="pressable flex size-7 items-center justify-center rounded-[7px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"><FolderPlus size={15} /></button>
        </div>

        {creatingFolder ? (
          <FileMutationForm draft={{operation:"file.folder",id:"new",href:"/files",label:"新建文件夹"}} action={createFileFolder} onSuccess={() => setCreatingFolder(false)} className="mt-2 flex flex-wrap gap-1.5">
            <input aria-label="文件夹名称" name="name" required maxLength={160} autoFocus placeholder="文件夹名称" className="ui-field h-8 min-w-0 flex-1 rounded-[8px] border border-transparent bg-[var(--surface-control)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
            <input type="hidden" name="parent_id" value={folderId ?? ""} />
            <button className="pressable h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-[12px] font-medium text-white">创建</button>
          </FileMutationForm>
        ) : null}

        <button onClick={() => changeBrowser({ folderId: null })} className={`pressable mt-2 flex h-[30px] w-full items-center gap-2 rounded-[8px] px-2 text-left text-[12.5px] ${folderId === null ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}>
          <Folder size={14} />
          <span className="truncate">全部文件</span>
          <span className="ml-auto font-mono text-[12px] tabular-nums text-[var(--text-tertiary)]">{fileRows.length}</span>
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
        <p className="mt-4 px-1 text-[12px] leading-5 text-[var(--text-tertiary)]">可在当前文件夹中新建子文件夹，或移动已有文件。</p>
      </aside>

      <WorkspaceReadyMetric workspace="files" />
      <section ref={sectionRef} className="workspace-scroll min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-h-12 flex-wrap items-start justify-between gap-3 border-b border-[var(--separator)] pb-3.5">
          <div>
            <h1 className="page-title">{activeFolder?.name ?? "全部文件"}</h1>
            {activeFolder ? <VaultHideButton kind="file_folder" id={activeFolder.id} /> : null}
            <p className="mt-0.5 text-[12px] tabular-nums text-[var(--text-tertiary)]">{`${visibleFiles.length} 个文件${filtering ? ` · 当前目录共 ${fileRows.filter(file => folderId === null || file.folder_id === folderId).length} 个` : ""}`}</p>
          </div>
          <div>
            <input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => { if (event.target.files?.length) { const staged=beginFileStaging(Array.from(event.target.files),folderId); setStagedSession(staged.session); if(staged.status==="existing")setMessage("已有一批未完成的整理，请先继续或放弃本批，再选择新的文件。"); } event.target.value = ""; }} />
            <button disabled={uploadBusy} onClick={() => inputRef.current?.click()} className="pressable inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-60">
              {uploadBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
              {stage === "preparing" ? "正在准备…" : stage === "uploading" ? "查看任务托盘" : stage === "verifying" ? "正在确认…" : stage === "extracting" ? "正在解析…" : "上传文件"}
            </button>
          </div>
        </div>

        <div className="my-3 space-y-2" role="region" aria-label="文件筛选与排序">
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="搜索文件名称" type="search" maxLength={200} value={browser.query} onChange={event => changeBrowser({ query: event.target.value }, true)} placeholder="搜索名称或原始文件名" className="ui-field h-10 w-full min-w-0 rounded-[9px] sm:w-auto sm:flex-1 border border-[var(--separator)] bg-[var(--surface-control)] px-3 text-[13px] outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            <select aria-label="文件排序" value={browser.sort} onChange={event => changeBrowser({ sort: event.target.value as FileBrowserState["sort"] })} className="ui-field h-10 max-w-full rounded-[9px] border border-[var(--separator)] bg-[var(--surface-control)] px-2 text-[12px]">{fileSorts.map(sort => <option key={sort} value={sort}>{fileSortLabels[sort]}</option>)}</select>
            <div role="group" aria-label="文件显示方式" className="flex rounded-[9px] bg-[var(--surface-control)] p-1">{(["list", "grid"] as const).map(view => <button type="button" key={view} aria-pressed={browser.view === view} onClick={() => changeBrowser({ view })} className={`pressable min-h-8 rounded-[7px] px-2 text-[12px] ${browser.view === view ? "bg-[var(--surface-selected)] text-[var(--accent)]" : ""}`}>{view === "list" ? "列表" : "网格"}</button>)}</div>
          </div>
          <div role="group" aria-label="文件类型" className="flex flex-wrap gap-1.5">{fileTypes.map(type => <button type="button" key={type} aria-pressed={browser.type === type} onClick={() => changeBrowser({ type, ...(type === "photo" ? { view: "grid" as const } : {}) })} className={`pressable min-h-9 rounded-full border px-3 text-[12px] ${browser.type === type ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--separator)] text-[var(--text-secondary)]"}`}>{fileTypeLabels[type]} <span className="font-mono text-[12px]">{selection.counts[type]}</span></button>)}</div>
          {browser.type === "photo" ? <p className="text-[12px] leading-5 text-[var(--text-tertiary)]">按上传时间管理；不是拍摄时间。预览仅生成受限缩略图，不会自动下载原件。</p> : null}
        </div>

        <Dialog open={!!stagedSession} onOpenChange={open => { if (!open) setStagedSession(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>整理本次上传</DialogTitle><DialogDescription>确认之前只在当前标签页检查，不会写入云端文件。</DialogDescription></DialogHeader>{stagedSession ? <UploadStaging key={stagedSession.id} session={stagedSession} files={stagedSession.plans.map(plan=>plan.file)} folderId={folderId} folders={folders} onCancel={() => setStagedSession(null)} onConfirm={plans => { setStagedSession(null); void upload(plans.map(plan => plan.file), undefined, plans); }} /> : null}</DialogContent></Dialog>
        {stagingSnapshot && !stagedSession ? <button type="button" className="ui-action-secondary mb-3 min-h-11 px-3 text-sm" onClick={()=>{const session=readFileStaging(stagingSnapshot.id);if(session)setStagedSession(session);}}>继续整理 {stagingSnapshot.count} 个文件</button>:null}
        <FileResumableUploads busy={uploadBusy} refresh={stage} onResume={(file, session) => void upload([file], session)} onFinish={session => void finishPending(session)} />
        {uploadBusy && ["preparing", "uploading"].includes(stage) ? <button type="button" className="mb-2 min-h-9 text-[12px] text-[var(--accent)]" onClick={() => uploadCancels.current.forEach(cancel => cancel())}>暂停上传，保留分片</button> : null}
        <FileRecoveryPanel disabled={uploadBusy} />
        <FilePublicationRecovery setFileRows={setFileRows} archivedRows={archivedRows} currentRows={fileRows} />

        {message ? <p role="status" className={`mt-2.5 text-[12px] ${messageTone === "error" ? "text-[var(--danger)]" : messageTone === "success" ? "text-[var(--success)]" : "text-[var(--text-secondary)]"}`}>{message}</p> : null}

        <OperationMetadataBar kind="document" folders={folders} />
        {!visibleFiles.length ? (
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <FilePlus2 size={24} className="text-[var(--text-tertiary)]" />
            <h2 className="mt-3 text-[13.5px] font-medium text-[var(--text-primary)]">{filtering ? "没有符合条件的文件" : "这里还没有文件"}</h2>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{filtering ? "调整类型或搜索条件，不会删除任何文件。" : "上传文件，或切换到其他文件夹。"}</p>
            {filtering ? <button type="button" onClick={() => changeBrowser({ query: "", type: "all" })} className="mt-3 min-h-9 px-3 text-[12px] text-[var(--accent)]">清除筛选</button> : null}
          </div>
        ) : browser.view === "grid" ? (
          <ul aria-label="文件网格" className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {displayedFiles.map(file => <li data-file-preview-source id={`file-${file.id}`} key={file.id} className={`min-w-0 overflow-hidden rounded-[12px] border border-[var(--separator)] bg-[var(--surface-canvas)] ${file.id === highlightId ? "ring-2 ring-[var(--accent)]" : ""}`}>
              <WorkbenchRecord entity={{kind:"document",id:file.id}} title={file.title} group={`files:${folderId}:${browser.sort}:${browser.query}`} >{classifyFile(file) === "photo" ? <button type="button" aria-label={`预览 ${file.title}`} onClick={event => { openPreview(file, event.currentTarget); }} className="block w-full"><FilePhoto file={file} className="aspect-square w-full" /></button> : isPdfFile(file) ? <button type="button" aria-label={`预览 ${file.title}`} onClick={event => { openPreview(file, event.currentTarget); }} className="block w-full"><FilePdfCover file={file} /></button> : <div className="flex aspect-square items-center justify-center bg-[var(--surface-control)] text-[var(--text-tertiary)]"><File size={36} /></div>}
              <div className="min-w-0 p-2.5">{classifyFile(file) === "photo" || isPdfFile(file) ? <button type="button" onClick={event => { openPreview(file, event.currentTarget); }} aria-label={`打开预览：${file.title}`} title={file.title} className="block w-full truncate text-left text-[12.5px] font-medium hover:text-[var(--accent)]">{file.title}</button> : <p className="truncate text-[12.5px] font-medium" title={file.title}>{file.title}</p>}<p className="mt-1 text-[12px] text-[var(--text-tertiary)]">{fileTypeLabels[classifyFile(file)]} · {formatBytes(file.file_size)}</p><p className="mt-1 text-[12px] text-[var(--text-tertiary)]">上传于 {new Date(file.uploaded_at).toLocaleDateString("zh-CN")}</p>
                <div className="mt-1 flex justify-end gap-1"><a href={`/api/files/${file.id}/download`} aria-label={`下载 ${file.title}`} className="pressable flex size-9 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><Download size={14} /></a><FileOcrControl file={file} onComplete={count => setFileRows(current => current.map(item => item.id === file.id ? { ...item, text_extraction_status: "completed", extracted_character_count: count } : item))} /><FileOperations resumeRequestId={operationResume?.id===file.id?operationResume.nonce:undefined} file={file} folders={sortedFolders} onArchive={archive} /></div>
              </div></WorkbenchRecord>
            </li>)}
          </ul>
        ) : (
          <ul aria-label="文件列表" className="divide-y divide-[var(--separator)]">
            {displayedFiles.map((file) => (
              <li data-file-preview-source id={`file-${file.id}`} className={`flex min-h-[52px] items-center gap-2.5 px-2 py-2.5 transition-colors ui-transition ${file.id === highlightId ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]"}`} key={file.id}>
                <WorkbenchRecord entity={{kind:"document",id:file.id}} title={file.title} group={`files:${folderId}:${browser.sort}:${browser.query}`} className="w-full"><div className="flex w-full items-center gap-2.5"><File size={16} className="shrink-0 text-[var(--text-tertiary)]" />
                <div className="min-w-0 flex-1">
                  {classifyFile(file) === "photo" || isPdfFile(file) ? <button type="button" onClick={event => { openPreview(file, event.currentTarget); }} aria-label={`打开预览：${file.title}`} className="block max-w-full truncate text-left text-[13px] font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">{file.title}</button> : <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{file.title}</p>}
                  <p className="mt-0.5 font-mono text-[12px] leading-4 tabular-nums text-[var(--text-tertiary)]">
                    {fileTypeLabels[classifyFile(file)]} · {formatBytes(file.file_size)} · 上传于 {new Date(file.uploaded_at).toLocaleDateString("zh-CN")}
                    {file.text_extraction_status === "completed" ? ` · 已索引 ${file.extracted_character_count.toLocaleString("zh-CN")} 字` : file.text_extraction_status === "processing" || file.text_extraction_status === "pending" ? " · 正在建立全文索引" : file.text_extraction_status === "too_large" ? " · 文件过大，暂不解析" : file.text_extraction_status === "unsupported" ? " · 此类型暂不解析" : file.text_extraction_status === "failed" ? " · 文本解析失败" : ""}
                  </p>
                </div>
                {classifyFile(file) === "photo" || isPdfFile(file) ? <button type="button" aria-label={`预览 ${file.title}`} onClick={event => { openPreview(file, event.currentTarget); }} className="pressable flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--accent)] hover:bg-[var(--surface-hover)]"><Eye size={15} /></button> : null}
                {["failed", "pending", "not_requested"].includes(file.text_extraction_status) ? <button type="button" disabled={extractingId === file.id} onClick={() => void retryExtraction(file.id)} className="pressable h-8 rounded-[8px] px-2 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50">{extractingId === file.id ? "解析中…" : "解析文本"}</button> : null}
                <a href={`/api/files/${file.id}/download`} className="pressable flex size-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]" aria-label={`下载 ${file.title}`}><Download size={14} /></a>
                <FileOcrControl file={file} onComplete={count => setFileRows(current => current.map(item => item.id === file.id ? { ...item, text_extraction_status: "completed", extracted_character_count: count } : item))} />
                <FileOperations resumeRequestId={operationResume?.id===file.id?operationResume.nonce:undefined} file={file} folders={sortedFolders} onArchive={archive} /></div></WorkbenchRecord>
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
            <summary className="pressable inline-flex cursor-pointer list-none items-center gap-2 rounded-[7px] px-1 py-0.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
              <Archive size={13} />已归档（全部文件夹） <span className="font-mono text-[12px] tabular-nums text-[var(--text-tertiary)]">{visibleArchived.length}</span>
            </summary>
            <ul className="mt-2 divide-y divide-[var(--separator)]">
              {visibleArchived.slice(0, archivedLimit).map((file) => (
                <li className="flex min-h-11 items-center gap-2.5 px-2 py-2" key={file.id}>
                  <File size={14} className="shrink-0 text-[var(--text-tertiary)]" />
                  <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] text-[var(--text-primary)]">{file.title}</p><p className="mt-0.5 font-mono text-[12px] tabular-nums text-[var(--text-tertiary)]">{formatBytes(file.file_size)} · 归档于 {new Date(file.archived_at ?? file.uploaded_at).toLocaleDateString("zh-CN")}</p></div>
                  <span className="text-[12px] text-[var(--text-tertiary)]">恢复后下载</span>
                  <FileMutationForm action={restoreFile}><input type="hidden" name="document_id" value={file.id} /><input type="hidden" name="expected_revision" value={file.mutation_revision ?? ""} /><button className="pressable h-8 rounded-[8px] px-2 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">恢复</button></FileMutationForm>
                </li>
              ))}
            </ul>
            {visibleArchived.length > archivedLimit ? <button type="button" onClick={() => setArchivedLimit(limit => limit + filesPerPage)} className="mt-2 min-h-10 px-3 text-[12px] text-[var(--accent)]">显示更多归档（{archivedLimit} / {visibleArchived.length}）</button> : null}
          </details>
        ) : null}
      </section>
      <Dialog open={previewOpen && Boolean(previewFile)} onOpenChange={setPreviewOpen}>
        {previewFile ? <DialogContent ref={previewRef} className={`file-preview-surface ${isPdfFile(previewFile) ? "sm:max-w-4xl" : "sm:max-w-2xl"}`} onKeyDown={event => {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) return;
          if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],[role="slider"],.file-pdf-viewport')) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); switchPreview(event.key === "ArrowLeft" ? -1 : 1); }
        }} onCloseAutoFocus={event => { event.preventDefault(); if (previewLauncher.current?.isConnected) previewLauncher.current.focus(); else sectionRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(); }}>
          <DialogHeader><DialogTitle className="break-words pr-8">{previewFile.title}</DialogTitle><DialogDescription>{isPdfFile(previewFile) ? "PDF 预览" : "受限缩略图预览"} · 上传于 {new Date(previewFile.uploaded_at).toLocaleDateString("zh-CN")} · {formatBytes(previewFile.file_size)}</DialogDescription></DialogHeader>
          <div className="file-preview-navigation" role="group" aria-label="文件切换">
            <button type="button" className="pressable" disabled={previewIndex <= 0} onClick={() => switchPreview(-1)}><ChevronLeft aria-hidden="true" size={16} />上一文件</button>
            <output aria-live="polite">{previewIndex >= 0 ? `${previewIndex + 1} / ${previewFiles.length}` : "当前文件"}</output>
            <button type="button" className="pressable" disabled={previewIndex < 0 || previewIndex >= previewFiles.length - 1} onClick={() => switchPreview(1)}>下一文件<ChevronRight aria-hidden="true" size={16} /></button>
          </div>
          {isPdfFile(previewFile) ? <FilePdfPreview key={previewFile.id} documentId={previewFile.id} title={previewFile.title} active={previewOpen} initialPage={pdfLocator?.documentId === previewFile.id ? pdfLocator.page : undefined} initialSourceVersion={pdfLocator?.documentId === previewFile.id ? pdfLocator.sourceVersion : undefined} /> : <div className="file-photo-stage"><FilePhoto file={previewFile} className="max-h-[50dvh] min-h-40 w-full rounded-[10px]" /></div>}
          <p className="break-all text-[12px] text-[var(--text-secondary)]">原始文件名：{previewFile.original_filename}</p>
          <a href={`/api/files/${previewFile.id}/download`} className="pressable inline-flex min-h-10 items-center justify-center gap-2 rounded-[9px] bg-[var(--accent)] px-3 text-[13px] text-white"><Download size={15} />下载原件</a>
        </DialogContent> : null}
      </Dialog>
    </div>
  );
}
