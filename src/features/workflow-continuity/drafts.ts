"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { WORKSPACE_SESSION_TTL_MS } from "@/lib/workspace-session";
import type { DraftResumeTarget } from "./draft-resume";
import type { AiResumeTarget } from "@/features/assistant/client-chat-contracts";

/** Object insertion order is not a different edit; array order and raw strings are exact. */
export function draftValueFingerprint(value:unknown):string{return JSON.stringify(value,(_key,item:unknown)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);}
export type WorkflowDraftKind = "capture" | "note" | "review" | "task" | "calendar" | "career" | "shopping" | "travel" | "leisure" | "investment";
export type WorkflowDraftSummary = { key: string; kind: WorkflowDraftKind; label: string; resumeHref: string; resumeTarget?: DraftResumeTarget; resumeAiTarget?: AiResumeTarget; createKind?: "task" | "calendar" | "note" | "inbox" | "shopping" | "travel" | "project"; updatedAt: number; expiresAt: number };
type Entry = WorkflowDraftSummary & { value: unknown; encoded: string; current: () => boolean; uncertain?:boolean };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const empty: WorkflowDraftSummary[] = [];
let summaries = empty;
function emit() { summaries = [...entries.values()].map(({ key, kind, label, resumeHref, resumeTarget, resumeAiTarget, createKind, updatedAt, expiresAt }) => ({ key, kind, label, resumeHref, resumeTarget, resumeAiTarget, createKind, updatedAt, expiresAt })).sort((a, b) => b.updatedAt - a.updatedAt); listeners.forEach(listener => listener()); }
export const subscribeWorkflowDrafts = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getWorkflowDrafts = () => summaries;
export const getWorkflowDraftsServerSnapshot = () => empty;
export function expireWorkflowDrafts(now = Date.now()) { let changed = false; for (const [key, entry] of entries) if (!entry.current() || entry.expiresAt <= now) { entries.delete(key); changed = true; } if (changed) emit(); }
export function discardWorkflowDraft(key: string) { entries.delete(key); emit(); }
/** Native originals stay in the bounded Files staging runtime; the directory holds only an ID. */
export function registerFileStagingWorkflowDraft(sessionId: string, ttlMs = WORKSPACE_SESSION_TTL_MS) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return null;
  expireWorkflowDrafts();
  const key = `capture:file-staging:${sessionId}`;
  if (!entries.has(key) && entries.size >= 60) return null;
  const current = captureWorkspaceScope(), token = crypto.randomUUID(), now = Date.now();
  entries.set(key, { key, kind: "capture", label: "上传前整理", resumeHref: "/files", resumeTarget: { kind: "file.staging", id: sessionId }, updatedAt: now, expiresAt: now + Math.min(ttlMs, WORKSPACE_SESSION_TTL_MS), encoded: token, value: undefined, current }); emit();
  return () => { if (current() && entries.get(key)?.encoded === token) { entries.delete(key); emit(); } };
}
/** Notes keeps its existing bounded editor/session body; the tray stores metadata only. */
export function registerExternalWorkflowDraft(options: { kind: "note"; id: string; label: string; resumeHref: string; updatedAt?: number; ttlMs?: number }) {
  const key = `${options.kind}:${options.id}`;
  expireWorkflowDrafts();
  if ((!entries.has(key) && entries.size >= 60) || !/^\/notes\/[0-9a-f-]{36}(?:[?#]|$)/i.test(options.resumeHref)) return () => {};
  const current = captureWorkspaceScope(); const token = crypto.randomUUID();
  const now = Date.now();
  entries.set(key, { key, kind: options.kind, label: options.label.slice(0, 100), resumeHref: options.resumeHref, updatedAt: options.updatedAt ?? now, expiresAt: now + Math.min(options.ttlMs ?? 86_400_000, 86_400_000), value: undefined, encoded: token, current }); emit();
  // Call only on authoritative save/discard, not route unmount. A newer dirty
  // revision may have replaced this metadata while the older save was pending.
  return () => { if (current() && entries.get(key)?.encoded === token) { entries.delete(key); emit(); } };
}
registerWorkspaceScopeCleanup(() => { entries.clear(); emit(); });
export type WorkflowDraftOptions<T> = { kind: WorkflowDraftKind; id: string; resumeHref: string; resumeTarget?: DraftResumeTarget; resumeAiTarget?: AiResumeTarget; createKind?: WorkflowDraftSummary["createKind"]; label: string; initialValue: T; parse: (value: unknown) => T | null; ttlMs?: number };
/** Typed in-memory, same-tab unfinished work. Never a confirmed/cloud record. */
export function useWorkflowDraft<T>(options: WorkflowDraftOptions<T>): { value: T; setValue: Dispatch<SetStateAction<T>>; clear: (expectedValue?: T) => void; commit: (expectedValue: T, update: (current: T) => T) => void; restored: boolean; recoveryUnavailable: boolean;uncertain:boolean;markUncertain:()=>void;resolveUncertain:()=>void;scopeRevoked:boolean;isCurrent:()=>boolean } {
  const key = `${options.kind}:${options.id}`;
  const config = useRef(options);
  useLayoutEffect(() => { config.current = options; }, [options]);
  // A mounted editor never acquires authority from a replacement owner.
  const [origin] = useState(captureWorkspaceScope);
  const restore = () => {
    const entry = entries.get(key);
    const restored = Boolean(entry?.current() && entry.expiresAt > Date.now());
    const value = restored ? options.parse(entry?.value) ?? options.initialValue : options.initialValue;
    return { key, value, restored, uncertain:restored&&entry?.uncertain===true, recoveryUnavailable: false, scope: origin, lease: Symbol(key) };
  };
  const [state, setState] = useState(restore);
  const mounted=useRef(false);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const live = useRef(state);
  useLayoutEffect(() => { live.current = state; }, [state]);
  const scope = state.scope;
  const lease = state.lease;
  const baseline = useRef({ key, lease, value: options.initialValue });
  useLayoutEffect(() => { if (baseline.current.lease !== lease) baseline.current = { key, lease, value: options.initialValue }; }, [key, lease, options.initialValue]);
  if (state.key !== key) {
    setState(restore());
  }
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    if (!mounted.current || !scope() || live.current.key !== key || live.current.lease !== lease) return;
    const candidate = typeof next === "function" ? (next as (previous: T) => T)(live.current.value) : next;
    const settings = config.current;
    const parsed = settings.parse(candidate);
    let recoveryUnavailable = parsed === null;
    if (parsed !== null) {
      const encoded = draftValueFingerprint(parsed);
      if (!entries.has(key) && entries.size >= 60) expireWorkflowDrafts();
      recoveryUnavailable = encoded.length > 400_000 || (!entries.has(key) && entries.size >= 60) || !settings.resumeHref.startsWith("/") || settings.resumeHref.startsWith("//");
      if (encoded === draftValueFingerprint(baseline.current.value)&&!live.current.uncertain) { entries.delete(key); emit(); }
      else if (!recoveryUnavailable) {
        const now = Date.now();
        entries.set(key, { key, kind: settings.kind, value: parsed, encoded, uncertain:live.current.uncertain,label: settings.label.slice(0, 100), resumeHref: settings.resumeHref, resumeTarget: settings.resumeTarget, resumeAiTarget: settings.resumeAiTarget, createKind: settings.createKind, updatedAt: now, expiresAt: now + Math.min(settings.ttlMs ?? WORKSPACE_SESSION_TTL_MS, settings.kind === "note" ? 86_400_000 : WORKSPACE_SESSION_TTL_MS), current: captureWorkspaceScope() }); emit();
      }
    }
    if (recoveryUnavailable && entries.delete(key)) emit();
    // Recovery limits never constrain the active form or reset its input.
    const updated = { ...live.current, value: candidate, recoveryUnavailable };
    live.current = updated; setState(updated);
  }, [key, scope, lease]);
  const markUncertain=useCallback(()=>{if(!mounted.current||!scope()||live.current.key!==key||live.current.lease!==lease)return;live.current={...live.current,uncertain:true};setValue(live.current.value);},[key,scope,lease,setValue]);
  const resolveUncertain=useCallback(()=>{if(!mounted.current||!scope()||live.current.key!==key||live.current.lease!==lease)return;live.current={...live.current,uncertain:false};setValue(live.current.value);},[key,scope,lease,setValue]);
  const clear = useCallback((expectedValue?: T) => {
    if (!mounted.current || !scope() || live.current.key !== key || live.current.lease !== lease) return;
    if (expectedValue !== undefined && entries.get(key)?.encoded !== draftValueFingerprint(expectedValue)) return;
    entries.delete(key); emit();
  }, [key, scope, lease]);
  const commit = useCallback((expectedValue: T, update: (current: T) => T) => {
    if (!mounted.current || !scope() || live.current.key !== key || live.current.lease !== lease) return;
    const unchanged = draftValueFingerprint(live.current.value) === draftValueFingerprint(expectedValue);
    baseline.current = { key, lease, value: update(expectedValue) };
    const value = update(live.current.value);
    if (unchanged) {
      entries.delete(key); emit();
      const updated = { ...live.current, value, restored: false, recoveryUnavailable: false };
      live.current = updated; setState(updated);
    } else setValue(value);
  }, [key, scope, lease, setValue]);
  useEffect(() => registerWorkspaceScopeCleanup(() => {
    const updated = { ...live.current, restored: false, recoveryUnavailable: true };
    live.current = updated; setState(updated);
  }), [key]);
  const isCurrent = useCallback(() => mounted.current && scope() && live.current.key === key && live.current.lease === lease, [scope,key,lease]);
  return { isCurrent, scopeRevoked:!scope(), value: state.value, setValue, clear, commit, restored: state.restored, recoveryUnavailable: state.recoveryUnavailable,uncertain:state.uncertain,markUncertain,resolveUncertain };
}
