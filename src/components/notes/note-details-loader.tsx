"use client";

import { useEffect, useState } from "react";
import { NoteDetailsContent } from "./note-details-content";
import { readWorkspaceResponse } from "@/lib/workspace-resource-cache";
import type { NoteDetailsData, NoteDocumentData } from "@/features/notes/queries";

export function NoteDetailsLoader({ document }: { document: NoteDocumentData }) {
  const [details, setDetails] = useState<NoteDetailsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readWorkspaceResponse<NoteDetailsData>(`/api/notes/${document.note.id}/details`, controller.signal).then((data) => {
      if (!controller.signal.aborted) { setDetails(data); setFailed(false); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [document.note.id, document.note.revision, attempt]);
  if (details) return <NoteDetailsContent document={document} details={details} />;
  return <div role="status" className="py-3 text-sm text-[var(--text-secondary)]">{failed ? <>详情暂时无法读取，正文可继续编辑。<button className="pressable min-h-11 px-2 text-[var(--accent)]" onClick={() => { setFailed(false); setAttempt((v) => v + 1); }}>重试读取</button></> : "正在读取详情…"}</div>;
}
