"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { expandedFolderPath } from "@/features/notes/folder-tree";

type Folder = { id: string; name: string; parent_id: string | null };
type Note = { folder_id: string | null };

export function FolderTree({ folders, notes, selectedId, onRename }: { folders: Folder[]; notes: Note[]; selectedId: string | null; onRename?: (folder: Folder) => void }) {
  const childrenByParent = useMemo(() => {
    const result = new Map<string | null, Folder[]>();
    for (const folder of folders) result.set(folder.parent_id, [...(result.get(folder.parent_id) ?? []), folder]);
    return result;
  }, [folders]);
  const [expanded, setExpanded] = useState(() => expandedFolderPath(folders, selectedId));
  const visibleExpanded = useMemo(() => new Set([...expanded, ...expandedFolderPath(folders, selectedId)]), [expanded, folders, selectedId]);

  const toggle = (folderId: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
    return next;
  });
  const directCount = (folderId: string) => notes.filter((note) => note.folder_id === folderId).length;

  const renderLevel = (parentId: string | null, depth = 0): React.ReactNode => (childrenByParent.get(parentId) ?? []).map((folder) => {
    const children = childrenByParent.get(folder.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = visibleExpanded.has(folder.id);
    return <div key={folder.id}><div className="group flex items-center" style={{ marginLeft: `${depth * 12}px` }}>{hasChildren ? <button type="button" onClick={() => toggle(folder.id)} aria-label={`${isExpanded ? "收起" : "展开"} ${folder.name}`} aria-expanded={isExpanded} className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-[#EDF3F6] hover:text-[#365F78] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365F78]"><span aria-hidden="true">{isExpanded ? "−" : "+"}</span></button> : <span className="size-6 shrink-0" aria-hidden="true" />}<Link href={`/notes?folder=${folder.id}`} className={`flex min-w-0 flex-1 items-center justify-between rounded px-2 py-1.5 text-sm ${selectedId === folder.id ? "bg-[#EDF3F6] text-[#365F78]" : "text-zinc-700 hover:bg-white"}`}><span className="min-w-0 truncate">{folder.name}</span><span className="font-mono text-[11px] text-zinc-400">{directCount(folder.id)}</span></Link>{onRename ? <button type="button" onClick={() => onRename(folder)} aria-label={`重命名文件夹 ${folder.name}`} className="ml-0.5 flex size-7 shrink-0 items-center justify-center rounded text-[var(--text-tertiary)] opacity-100 hover:bg-white hover:text-[var(--accent)] focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"><Pencil className="size-3" aria-hidden="true" /></button> : null}</div>{hasChildren && isExpanded ? renderLevel(folder.id, depth + 1) : null}</div>;
  });

  return <>{renderLevel(null)}</>;
}
