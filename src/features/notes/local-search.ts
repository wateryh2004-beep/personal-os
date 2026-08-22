export type NoteSearchFolder = {
  id: string;
  name: string;
  parent_id: string | null;
};

export type NoteSearchItem = {
  id: string;
  title: string;
  folder_id: string | null;
};

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
}

export function noteFolderPath(folderId: string | null, folders: NoteSearchFolder[]) {
  if (!folderId) return "根目录";
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    parts.unshift(current.name);
    seen.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return parts.length ? parts.join(" / ") : "根目录";
}

export function filterNotesByMetadata<T extends NoteSearchItem>(
  notes: T[],
  folders: NoteSearchFolder[],
  query: string,
  limit = 60,
) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return notes.slice(0, limit);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  return notes
    .map((note, index) => {
      const title = normalize(note.title || "无标题笔记");
      const path = normalize(noteFolderPath(note.folder_id, folders));
      const haystack = `${title} ${path}`;
      if (!tokens.every((token) => haystack.includes(token))) return null;
      let score = 0;
      if (title === normalizedQuery) score += 120;
      else if (title.startsWith(normalizedQuery)) score += 80;
      else if (title.includes(normalizedQuery)) score += 55;
      if (path.includes(normalizedQuery)) score += 20;
      score += tokens.reduce((total, token) => total + (title.includes(token) ? 8 : 0), 0);
      return { note, score, index };
    })
    .filter((item): item is { note: T; score: number; index: number } => Boolean(item))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.note);
}

export function mergeNoteSearchResults<T extends { id: string }>(local: T[], remote: T[], limit = 50) {
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const item of [...local, ...remote]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}
