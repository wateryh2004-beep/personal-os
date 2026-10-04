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
  return foldSearchText(value).replace(/\s+/g, " ").trim();
}

function foldSearchText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/ς/g, "σ");
}

export type NoteSearchHighlight = { text: string; matched: boolean };
type MatchRange = { start: number; end: number };

/** Literal text ranges only: callers render text nodes, never injected HTML. */
export function noteSearchMatchRanges(
  text: string, query: string, { wholeQuery = false, firstOnly = false }: { wholeQuery?: boolean; firstOnly?: boolean } = {},
): MatchRange[] {
  const normalizedQuery = normalize(query);
  const tokens = wholeQuery ? [normalizedQuery].filter(Boolean) : [...new Set(normalizedQuery.split(" ").filter(Boolean))];
  if (!tokens.length || !text) return [];
  const normalized = foldSearchText(text);
  const ranges: MatchRange[] = [];
  for (const token of tokens) {
    let index = normalized.indexOf(token);
    while (index !== -1) {
      ranges.push({ start: index, end: index + token.length });
      if (firstOnly) break;
      index = normalized.indexOf(token, index + 1);
    }
  }
  if (!ranges.length) return [];
  if (firstOnly) ranges.splice(0, ranges.length, ranges.reduce((first, range) => range.start < first.start ? range : first));
  // Most text keeps its offsets after folding. Only build a map for normalization
  // changes, and only if there is a match (body searches can inspect long notes).
  if (text.normalize("NFKC") !== text || normalized.length !== text.length) {
    const offsets: MatchRange[] = [];
    const lastNeeded = ranges.reduce((end, range) => Math.max(end, range.end), 0);
    for (const { segment, index } of new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(text)) {
      const range = { start: index, end: index + segment.length };
      for (let i = 0; i < foldSearchText(segment).length; i++) offsets.push(range);
      if (offsets.length >= lastNeeded) break;
    }
    for (const range of ranges) {
      const start = offsets[range.start].start;
      range.end = offsets[range.end - 1].end;
      range.start = start;
    }
  }
  // A query can match part of a joined emoji or a combining sequence. Highlight
  // its complete grapheme without walking every character of a long body.
  const graphemes = new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(text);
  for (const range of ranges) {
    range.start = graphemes.containing(range.start)?.index ?? range.start;
    const last = graphemes.containing(range.end - 1);
    if (last) range.end = last.index + last.segment.length;
  }
  const merged: MatchRange[] = [];
  for (const range of ranges.sort((a, b) => a.start - b.start || b.end - a.end)) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export function splitNoteSearchHighlights(text: string, query: string): NoteSearchHighlight[] {
  const segments: NoteSearchHighlight[] = [];
  let cursor = 0;
  for (const { start, end } of noteSearchMatchRanges(text, query)) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), matched: false });
    segments.push({ text: text.slice(start, end), matched: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), matched: false });
  return segments;
}

function metadataScore(title: string, path: string, query: string, tokens: string[]) {
  const titleHits = tokens.filter((token) => title.includes(token)).length;
  // Any title hit stays ahead of a path-only/body-only result, even for long queries.
  const titleScore = title === query ? 500 : title.startsWith(query) ? 400
    : title.includes(query) ? 300 : titleHits === tokens.length ? 200 : titleHits ? 100 : 0;
  return titleScore + (path.includes(query) ? 20 : 0) + titleHits / tokens.length;
}

/** Stable within equal relevance, preserving each source's existing recency order. */
export function rankNoteSearchResults<T extends { id: string; title?: string; folder_id?: string | null }>(
  notes: T[], query: string, folders: NoteSearchFolder[] = [],
): T[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [...notes];
  const tokens = normalizedQuery.split(" ");
  const resolvePath = createNoteFolderPathResolver(folders);
  return notes.map((note, index) => ({
    note, index,
    score: metadataScore(normalize(note.title || "无标题笔记"), normalize(resolvePath(note.folder_id ?? null)), normalizedQuery, tokens),
  })).sort((a, b) => b.score - a.score || a.index - b.index).map(({ note }) => note);
}

/** Reuse folder metadata and resolved paths across a complete search/list. */
export function createNoteFolderPathResolver(folders: NoteSearchFolder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string>();
  return (folderId: string | null): string => {
    if (!folderId) return "根目录";
    const cached = paths.get(folderId);
    if (cached !== undefined) return cached;
    const parts: string[] = [];
    const seen = new Set<string>();
    let current = byId.get(folderId);
    while (current && !seen.has(current.id)) {
      parts.unshift(current.name);
      seen.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    const path = parts.length ? parts.join(" / ") : "根目录";
    paths.set(folderId, path);
    return path;
  };
}

export function noteFolderPath(folderId: string | null, folders: NoteSearchFolder[]) {
  return createNoteFolderPathResolver(folders)(folderId);
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
  const resolvePath = createNoteFolderPathResolver(folders);
  const normalizedPaths = new Map<string | null, string>();

  return notes
    .map((note, index) => {
      const title = normalize(note.title || "无标题笔记");
      let path = normalizedPaths.get(note.folder_id);
      if (path === undefined) { path = normalize(resolvePath(note.folder_id)); normalizedPaths.set(note.folder_id, path); }
      const haystack = `${title} ${path}`;
      if (!tokens.every((token) => haystack.includes(token))) return null;
      const score = metadataScore(title, path, normalizedQuery, tokens);
      return { note, score, index };
    })
    .filter((item): item is { note: T; score: number; index: number } => Boolean(item))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.note);
}

export function mergeNoteSearchResults<T extends { id: string; title?: string; folder_id?: string | null; excerpt?: string | null }>(
  local: T[], remote: T[], limit = 50, query = "", folders: NoteSearchFolder[] = [],
) {
  const merged = new Map<string, T>();
  for (const item of [...local, ...remote]) {
    const previous = merged.get(item.id);
    // Keep immediately visible metadata, but enrich it with the matched server excerpt.
    if (previous) {
      if (item.excerpt) merged.set(item.id, { ...previous, excerpt: item.excerpt });
    } else merged.set(item.id, item);
  }
  return rankNoteSearchResults([...merged.values()], query, folders).slice(0, Math.max(0, limit));
}
