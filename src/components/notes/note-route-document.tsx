"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { Suspense, use, useEffect, useMemo } from "react";
import { NoteEditor } from "./note-editor";
import { NoteDocumentShell } from "./note-document-shell";
import { noteDocumentCache, reconcileNoteDocumentSeed } from "@/features/notes/document-resource";
import type { NoteDocumentData } from "@/features/notes/queries";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { noteFolderPath } from "@/features/notes/local-search";
import { useWorkspaceResource, type WorkspaceBootstrap, type WorkspaceResource } from "@/lib/workspace-resource-cache";

type Document = NoteDocumentData | null;
type Bootstrap = WorkspaceBootstrap<Document>;
const NoteDetails = dynamic(() => import("./note-details-loader").then((m) => m.NoteDetailsLoader));
// SSR has no tab cache: a stable empty snapshot, with no per-request global registry entry.
const serverResource: WorkspaceResource<Document> = { key: "notes:server-document", get: () => ({}), subscribe: () => () => {}, set: () => {}, mutate: () => {}, invalidate: () => {}, prefetch: async () => undefined, revalidate: async () => null };
function DocumentSeed({ bootstrap, resource }: { bootstrap: Promise<Bootstrap>; resource: WorkspaceResource<Document> }) {
  const seed = use(bootstrap);
  useEffect(() => {
    void reconcileNoteDocumentSeed(resource, seed);
  }, [resource, seed]);
  return null;
}

export function NoteRouteDocument({ noteId, bootstrap }: { noteId: string; bootstrap: Promise<Bootstrap> }) {
  const resource = useMemo(() => typeof window === "undefined" ? serverResource : noteDocumentCache.get(noteId), [noteId]);
  const snapshot = useWorkspaceResource(resource, "note-document", undefined, true);
  const workspace = useWorkspaceResource(notesWorkspaceResource, null, undefined, true);
  const data = snapshot.data;
  if (data === null) notFound();
  return <>
    <Suspense fallback={null}><DocumentSeed resource={resource} bootstrap={bootstrap} /></Suspense>
    {data ? <NoteDocumentShell key={noteId} noteId={noteId} attachments={data.attachments}
      location={{ href: data.note.folder_id ? `/notes?folder=${data.note.folder_id}` : "/notes", label: data.note.folder_id && !workspace.data ? "笔记" : noteFolderPath(data.note.folder_id ?? null, workspace.data?.folders ?? []) }}
      editor={<NoteEditor loadAiPreferences note={data.note} noteAiDefaultModel="deepseek-v4-flash" />}
      inspector={<NoteDetails document={data} />} />
      : <div role="status" className="p-6 text-sm text-[var(--text-secondary)]">{snapshot.error ? <>正文暂时无法读取。<button className="pressable ml-2 min-h-11 px-3 text-[var(--accent)]" onClick={() => void resource.revalidate({ force: true }).catch(() => {})}>重试读取</button></> : "正在打开笔记…"}</div>}
    {data && snapshot.error ? <p role="status" className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] px-4 py-2 text-sm text-[var(--text-secondary)]">暂时无法核对最新版本，当前内容已保留。</p> : null}
  </>;
}
