"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { z } from "zod";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { captureNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { parseSourceLocator } from "@/features/links/source-locator";
import { noteInsertionCharacterLimit } from "@/features/workflow-continuity/note-insertion-limits";
import { getNoteInsertionGeneration, insertIntoAdjacentNote, listNoteInsertionTargets, subscribeNoteInsertionTargets } from "@/features/workflow-continuity/note-insertion";
import { useMobileBackLayer } from "@/lib/mobile/use-mobile-back-layer";
import { Button } from "@/components/ui/button";

type HandoffInput = { noteId: string; markdown: string; sourceHref: string; beforeActivate?: () => void };
type Destination = { noteId: string; stage(input: HandoffInput): boolean };
const ReferenceInsertionContext = createContext<Destination | null>(null);
export const useReferenceNoteInsertion = () => useContext(ReferenceInsertionContext);
type Pending = Omit<HandoffInput, "beforeActivate"> & { current: () => boolean; expiresAt: number };
export const referenceInsertionLifetimeMs = 30_000;

/** One explicit, bounded handoff from a visible immutable PDF to the same
 * reference editor. A hidden editor is never registered or written to. */
export function ReferenceNoteInsertionBoundary({ noteId, routeKey = "", activate, focusTarget, children }: { noteId: string | null; routeKey?: string; activate(): void; focusTarget?(): void; children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState("");
  const [originScope] = useState(captureWorkspaceScope);
  const mountedRef = useRef(true);
  const regionRef = useRef<HTMLElement | null>(null);
  const identity = `${noteId ?? ""}:${routeKey}`;
  const liveRef = useRef({ pending, noteId, identity });
  useLayoutEffect(() => { liveRef.current = { pending, noteId, identity }; }, [pending, noteId, identity]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; liveRef.current.pending = null; }; }, []);
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  if (previousIdentity !== identity) { setPreviousIdentity(identity); setPending(null); setMessage(""); }
  const cancel = useCallback(() => { if (regionRef.current?.contains(document.activeElement)) focusTarget?.(); liveRef.current.pending = null; setPending(null); setMessage(""); }, [focusTarget]);
  useEffect(() => registerWorkspaceScopeCleanup(cancel), [cancel]);
  const expire = useCallback((value: Pending) => {
    if (liveRef.current.pending !== value) return;
    const notify = mountedRef.current && value.current() && liveRef.current.noteId === value.noteId;
    cancel();
    if (notify) setMessage("摘录确认已过期，请回到原文重新选择。");
  }, [cancel]);
  const valid = (value: Pending) => liveRef.current.pending === value && liveRef.current.noteId === value.noteId && value.current() && Date.now() < value.expiresAt;
  const stage = useCallback((input: HandoffInput) => {
    const source = parseSourceLocator(input.sourceHref);
    if (!mountedRef.current || !originScope() || !noteId || liveRef.current.identity !== identity || liveRef.current.noteId !== noteId || input.noteId !== noteId || !z.uuid().safeParse(input.noteId).success || source?.kind !== "pdf" || !input.markdown || input.markdown.length > noteInsertionCharacterLimit) return false;
    const scope = captureWorkspaceScope(), navigation = captureNavigationIntent();
    const value: Pending = { noteId: input.noteId, markdown: input.markdown, sourceHref: input.sourceHref, current: () => scope() && navigation(), expiresAt: Date.now() + referenceInsertionLifetimeMs };
    // A known source-selection callback calls this synchronously, while its
    // immutable page/sourceVersion and rendered selection are still current.
    input.beforeActivate?.();
    liveRef.current.pending = value; setPending(value); setMessage(""); activate(); return true;
  }, [noteId, identity, activate, originScope]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => expire(pending), Math.max(0, pending.expiresAt - Date.now()));
    window.addEventListener("personal-os:navigation-start", cancel);
    window.addEventListener("popstate", cancel);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing) { event.preventDefault(); cancel(); } };
    window.addEventListener("keydown", escape);
    return () => { clearTimeout(timer); window.removeEventListener("personal-os:navigation-start", cancel); window.removeEventListener("popstate", cancel); window.removeEventListener("keydown", escape); };
  }, [pending, cancel, expire]);
  useLayoutEffect(() => {
    if (!pending) return;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected || active.closest(".file-preview-surface")) regionRef.current?.focus({ preventScroll: true });
  }, [pending]);
  const currentPending = pending && pending.noteId === noteId ? pending : null;
  useMobileBackLayer(Boolean(currentPending), cancel, "note-insertion");
  useSyncExternalStore(subscribeNoteInsertionTargets, getNoteInsertionGeneration, () => 0);
  const ready = !!currentPending && listNoteInsertionTargets().filter(target => target.noteId === currentPending.noteId && target.role === "reference").length === 1;
  const confirm = async () => {
    const value = currentPending;
    if (!value) return;
    if (!valid(value)) { if (Date.now() >= value.expiresAt) expire(value); else cancel(); return; }
    if (!ready) return;
    const region = regionRef.current;
    // Claim synchronously so double taps and old rendered callbacks cannot paste twice.
    liveRef.current.pending = null; setPending(null);
    const result = await insertIntoAdjacentNote({ targetNoteId: value.noteId, markdown: value.markdown });
    if (mountedRef.current && value.current() && liveRef.current.noteId === value.noteId && !liveRef.current.pending) { if (document.activeElement === document.body || region?.contains(document.activeElement)) focusTarget?.(); setMessage(result.status === "applied" ? "已插入，等待笔记自动保存。" : result.status === "stale" ? "插入结果待核对，请查看参考笔记，暂勿重复插入。" : "参考笔记已变化，未插入。请重新选择原文。"); }
  };
  return <ReferenceInsertionContext.Provider value={noteId ? { noteId, stage } : null}>{children}
    {currentPending ? <section ref={regionRef} tabIndex={-1} className="workbench-notice workbench-note-insertion flex-col items-stretch focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" role="region" aria-label="确认摘录到参考笔记">
      <h2 className="text-base font-medium">把所选内容摘录到参考笔记</h2>
      <p className="mt-2 text-sm">请在30秒内确认。原文与页码已保留，插入后等待笔记自动保存。</p>
      <a className="ui-link inline-flex min-h-11 items-center" href={currentPending.sourceHref} onClick={cancel}>核对原文来源</a>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11 whitespace-normal" onClick={cancel}>取消摘录</Button><Button type="button" className="min-h-11 whitespace-normal" disabled={!ready} onClick={() => void confirm()}>{ready ? "确认插入所选内容" : "正在打开参考笔记…"}</Button></div>
    </section> : null}
    {message ? <p role="status" className="workbench-notice workbench-note-insertion">{message}</p> : null}
  </ReferenceInsertionContext.Provider>;
}
