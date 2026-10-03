"use client";

import { useCallback, useState, type SetStateAction } from "react";
import type { FileRecord } from "@/features/files/queries";

/** Server refreshes remain authoritative; keep new upload rows during a batch. */
export function useFileRows(source: FileRecord[], preserveUploads = false) {
  const [snapshot, setSnapshot] = useState({ source, rows: source });
  let rows = snapshot.rows;
  if (snapshot.source !== source) {
    const known = new Set([...snapshot.source, ...source].map((file) => file.id));
    const additions = preserveUploads ? snapshot.rows.filter((file) => !known.has(file.id)) : [];
    rows = [...additions, ...source];
    setSnapshot({ source, rows });
  }
  const update = useCallback((next: SetStateAction<FileRecord[]>) => {
    setSnapshot((current) => ({ source: current.source, rows: typeof next === "function" ? next(current.rows) : next }));
  }, []);
  return [rows, update] as const;
}
