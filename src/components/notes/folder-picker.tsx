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

function folderPath(folder: Folder, byId: Map<string, Folder>) { const names = [folder.name]; const seen = new Set([folder.id]); let current = folder.parent_id ? byId.get(folder.parent_id) : undefined; while (current && !seen.has(current.id)) { names.unshift(current.name); seen.add(current.id); current = current.parent_id ? byId.get(current.parent_id) : undefined; } return names.join(" / "); }

/**
 * A compact, keyboard-friendly single selector. It carries the full folder
 * path so moving a note never becomes a stack of ambiguous selects.
 */
export function FolderPicker({ folders, initialFolderId, idPrefix, label = "移动到" }: FolderPickerProps) {
  void idPrefix;
  const [targetFolderId, setTargetFolderId] = useState(initialFolderId ?? "");
  const byId = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);

  return (
    <div className="grid gap-1.5">
      <input type="hidden" name="folder_id" value={targetFolderId} />
      <span className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
      <select aria-label={label} value={targetFolderId} className="h-9 min-w-0 rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" onChange={(event) => setTargetFolderId(event.target.value)}>
        <option value="">根目录</option>
        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folderPath(folder, byId)}</option>)}
      </select>
    </div>
  );
}
