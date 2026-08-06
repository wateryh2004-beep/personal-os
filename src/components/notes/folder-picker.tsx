"use client";

import { useMemo, useState } from "react";

type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
};

type FolderPickerProps = {
  folders: Folder[];
  initialFolderId: string | null;
  idPrefix: string;
  label?: string;
};

function initialPath(folderId: string | null, folders: Folder[]) {
  if (!folderId) return [];

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return path;
}

/**
 * A form-friendly cascading folder selector. The hidden input is the single
 * authoritative target passed to the existing server action.
 */
export function FolderPicker({ folders, initialFolderId, idPrefix, label = "移动到" }: FolderPickerProps) {
  const [path, setPath] = useState(() => initialPath(initialFolderId, folders));
  const byId = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const levels: Folder[][] = [];
  let parentId: string | null = null;

  for (let depth = 0; depth === 0 || path[depth - 1]; depth += 1) {
    const siblings = folders.filter((folder) => folder.parent_id === parentId);
    if (siblings.length === 0) break;
    levels.push(siblings);
    parentId = path[depth] ?? null;
    if (!path[depth]) break;
  }

  const targetFolderId = path.at(-1) ?? "";

  return (
    <div className="grid gap-2">
      <input type="hidden" name="folder_id" value={targetFolderId} />
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="grid gap-2">
        {levels.map((siblings, depth) => {
          const selectedId = path[depth] ?? "";
          const previousFolder = depth > 0 ? byId.get(path[depth - 1]) : null;
          const levelName = depth === 0 ? "一级文件夹" : `第 ${depth + 1} 级文件夹`;
          const stayLabel = depth === 0 ? "根目录" : `停留在「${previousFolder?.name ?? "上级文件夹"}」`;

          return (
            <label key={`${idPrefix}-${depth}`} className="grid gap-1">
              <span className="sr-only">{levelName}</span>
              <select
                aria-label={levelName}
                value={selectedId}
                className="min-w-0 border bg-white px-2 py-1.5 text-sm text-zinc-800"
                onChange={(event) => {
                  const nextId = event.target.value;
                  setPath((current) => nextId ? [...current.slice(0, depth), nextId] : current.slice(0, depth));
                }}
              >
                <option value="">{stayLabel}</option>
                {siblings.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
