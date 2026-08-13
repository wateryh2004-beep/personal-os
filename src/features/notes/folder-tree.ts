export type FolderTreeFolder = { id: string; parent_id: string | null };

/** Returns the selected folder and its ancestors, so only the active path opens automatically. */
export function expandedFolderPath(folders: FolderTreeFolder[], selectedId: string | null) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const expanded = new Set<string>();
  const seen = new Set<string>();
  let current = selectedId ? byId.get(selectedId) : undefined;
  while (current && !seen.has(current.id)) {
    expanded.add(current.id);
    seen.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return expanded;
}

/** Selected folders open by default, but a manual collapse always wins. */
export function visibleExpandedFolders(
  folders: FolderTreeFolder[],
  expanded: ReadonlySet<string>,
  selectedId: string | null,
  collapsed: ReadonlySet<string>,
) {
  return new Set([...expanded, ...expandedFolderPath(folders, selectedId)].filter((id) => !collapsed.has(id)));
}
