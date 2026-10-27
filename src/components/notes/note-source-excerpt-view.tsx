/** Presentation shared by the authenticated immutable-version reader and gated synthetic transport. */
export type NoteSourceExcerptData={revision:number;currentRevision:number|null;excerpt:string|null};
export function NoteSourceExcerptView({revision,currentRevision,excerpt}:NoteSourceExcerptData){
  return <aside aria-label="引用的历史原文" className="relative z-10 max-h-[40vh] shrink-0 overflow-auto border-b border-[var(--separator)] bg-[var(--accent-soft)] px-4 py-3 text-sm">
    {excerpt !== null ? <><p className="mb-2 text-xs text-[var(--text-secondary)]">引用时的原文 · 版本 {revision}{currentRevision !== revision ? " · 当前笔记已有更新" : ""}</p><blockquote className="whitespace-pre-wrap break-words border-l-2 border-[var(--accent)] pl-3">{excerpt}</blockquote></> : <p role="status">这段历史原文暂不可用。不会在当前正文中猜测定位。</p>}
  </aside>;
}
