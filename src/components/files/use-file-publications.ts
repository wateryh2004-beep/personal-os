"use client";

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { captureWorkspaceScope, clearWorkspaceResources, registerWorkspaceScopeCleanup, WorkspaceAuthenticationError } from "@/lib/workspace-resource-cache";
import { acknowledgeFilePublicationSources, confirmFilePublication, filePublicationIsCurrent, getFilePublications, subscribeFilePublications } from "@/features/files/publication";
import { readFileMetadata } from "@/features/files/metadata-read";
import { fileRecordSchema } from "@/features/files/record-schema";
import type { FileRecord } from "@/features/files/queries";

const publicationCommit = Symbol("file-publication-commit");
type CommittedRows = FileRecord[] & { [publicationCommit]?: { publication: ReturnType<typeof getFilePublications>[number]; file: FileRecord | null } };
/** Reconcile only published IDs, without changing the browser's view or inputs. */
export function useFilePublications(source: FileRecord[], archivedRows: FileRecord[], setFileRows: Dispatch<SetStateAction<FileRecord[]>>, reportFailure: () => void, currentRows: FileRecord[] = source) {
  const [scopeIsCurrent] = useState(captureWorkspaceScope);
  const latestRows = useRef(currentRows);
  useLayoutEffect(() => {
    latestRows.current = currentRows;
    if (!scopeIsCurrent()) return;
    const commit = (currentRows as CommittedRows)[publicationCommit];
    if (!commit) return;
    const installed = currentRows.find(row => row.id === commit.publication.documentId);
    if (commit.file ? installed === commit.file : installed === undefined) confirmFilePublication(commit.publication, commit.file);
  }, [currentRows, scopeIsCurrent]);
  const archived = useRef(archivedRows);
  useEffect(() => { archived.current = archivedRows; }, [archivedRows]);
  const report = useRef(reportFailure);
  useEffect(() => { report.current = reportFailure; }, [reportFailure]);
  useEffect(() => {
    if (!scopeIsCurrent()) return;
    let mounted = true;
    if (scopeIsCurrent()) acknowledgeFilePublicationSources(source);
    const attempted = new Map<string, number>();
    const recheckedMissing = new WeakSet<ReturnType<typeof getFilePublications>[number]>();
    const inFlight = new Map<string, AbortController>();
    const current = () => mounted && scopeIsCurrent();
    const reconcile = () => {
      if (!current()) return;
      for (const publication of getFilePublications()) {
        const id = publication.documentId;
        if (inFlight.size >= 2) break;
        if (inFlight.has(id) || attempted.get(id) === publication.version) continue;
        attempted.set(id, publication.version);
        const baseline = latestRows.current.find(row => row.id === id);
        const controller = new AbortController(); inFlight.set(id, controller);
        void readFileMetadata<{ file: unknown }>(`/api/files/${encodeURIComponent(id)}/record`, controller.signal).then(({ file: raw }) => {
          if (!current() || !filePublicationIsCurrent(publication)) return;
          const file = raw === null ? null : fileRecordSchema.parse(raw);
          if (file && file.id !== id) throw new Error("invalid_file_record");
          // A missing result is rechecked at most once against a new same-ID
          // baseline. Another concurrent change remains protected by the updater.
          if (!file && !recheckedMissing.has(publication) && (baseline || latestRows.current.some(row => row.id === id))) {
            recheckedMissing.add(publication); attempted.delete(id); return;
          }
          setFileRows(rows => {
            if (!current() || !filePublicationIsCurrent(publication)) return rows;
            const recentlyArchived = archived.current.find(row => row.id === id);
            if (file && recentlyArchived && (recentlyArchived.mutation_revision === undefined || recentlyArchived.mutation_revision >= file.mutation_revision)) return rows;
            const existing = rows.find(row => row.id === id);
            if (!file && existing !== baseline) return rows;
            if (file && (existing?.mutation_revision ?? -1) > (file.mutation_revision ?? -1)) return rows;
            const next: CommittedRows = [...(file ? [file] : []), ...rows.filter(row => row.id !== id)];
            // A pure, newly allocated result carries its commit token. Rejected
            // updaters return the old array and cannot acknowledge this response.
            Object.defineProperty(next, publicationCommit, { value: { publication, file } });
            return next;
          });
        }).catch(error => {
          if (!current() || controller.signal.aborted || !filePublicationIsCurrent(publication)) return;
          if (error instanceof WorkspaceAuthenticationError) {
            clearWorkspaceResources(); window.dispatchEvent(new Event("personal-os:workspace-auth-failed"));
          } else report.current();
        }).finally(() => { inFlight.delete(id); reconcile(); });
      }
    };
    const retry = () => { attempted.clear(); reconcile(); };
    const unsubscribe = subscribeFilePublications(reconcile);
    const unregisterScope = registerWorkspaceScopeCleanup(() => { for (const controller of inFlight.values()) controller.abort(); });
    reconcile();
    window.addEventListener("focus", retry); window.addEventListener("online", retry);
    return () => {
      mounted = false; unsubscribe(); unregisterScope();
      for (const controller of inFlight.values()) controller.abort();
      window.removeEventListener("focus", retry); window.removeEventListener("online", retry);
    };
  }, [source, scopeIsCurrent, setFileRows]);
}
