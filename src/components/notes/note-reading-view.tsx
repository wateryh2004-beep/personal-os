"use client";

import { memo, type Ref } from "react";
import { EntityMarkdown } from "@/components/links/entity-markdown";

/** Renders the current draft; switching views never writes or replaces it. */
export const NoteReadingView = memo(function NoteReadingView({ body, paneRef, onScroll }: { body: string; paneRef?: Ref<HTMLElement>; onScroll?: () => void }) {
  return <article ref={paneRef} onScroll={onScroll} aria-label="笔记正文" tabIndex={0} className="note-reading-pane workspace-scroll h-full overflow-y-auto px-5 py-7 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-[var(--accent)] md:px-8 md:py-10">
    <div className="mx-auto max-w-[720px]">
      {body.trim() ? <EntityMarkdown sourcePositions body={body} className="note-reading-prose min-w-0 text-[16px] leading-8 [overflow-wrap:anywhere] [&_p]:leading-8 [&_li]:leading-8 [&_img]:h-auto [&_img]:max-w-full" /> : <p className="py-10 text-[15px] text-[var(--text-secondary)]">这篇笔记还没有正文。</p>}
    </div>
  </article>;
});
