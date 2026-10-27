"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { WORKSPACE_SESSION_TTL_MS } from "@/lib/workspace-session";

export type WorkflowDraftKind = "capture" | "note" | "review" | "task" | "calendar" | "career" | "shopping" | "travel" | "leisure" | "investment";
export type WorkflowDraftSummary = { key: string; kind: WorkflowDraftKind; label: string; resumeHref: string; createKind?: "task" | "calendar" | "note" | "inbox" | "shopping" | "travel" | "project"; updatedAt: number; expiresAt: number };
type Entry = WorkflowDraftSummary & { value: unknown; encoded: string; current: () => boolean };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const empty: WorkflowDraftSummary[] = [];
let summaries = empty;
function emit() { summaries = [...entries.values()].map(({ key, kind, label, resumeHref, createKind, updatedAt, expiresAt }) => ({ key, kind, label, resumeHref, createKind, updatedAt, expiresAt })).sort((a, b) => b.updatedAt - a.updatedAt); listeners.forEach(listener => listener()); }
export const subscribeWorkflowDrafts = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getWorkflowDrafts = () => summaries;
export const getWorkflowDraftsServerSnapshot = () => empty;
export function expireWorkflowDrafts(now = Date.now()) { let changed = false; for (const [key, entry] of entries) if (!entry.current() || entry.expiresAt <= now) { entries.delete(key); changed = true; } if (changed) emit(); }
export function discardWorkflowDraft(key: string) { entries.delete(key); emit(); }
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
export type WorkflowDraftOptions<T> = { kind: WorkflowDraftKind; id: string; resumeHref: string; createKind?: WorkflowDraftSummary["createKind"]; label: string; initialValue: T; parse: (value: unknown) => T | null; ttlMs?: number };
/** Typed in-memory, same-tab unfinished work. Never a confirmed/cloud record. */
export function useWorkflowDraft<T>(options: WorkflowDraftOptions<T>): { value: T; setValue: Dispatch<SetStateAction<T>>; clear: (expectedValue?: T) => void; commit: (expectedValue: T, update: (current: T) => T) => void; restored: boolean; recoveryUnavailable: boolean } {
  const key = `${options.kind}:${options.id}`;
  const config = useRef(options);
  useLayoutEffect(() => { config.current = options; }, [options]);
  const restore = () => {
    const entry = entries.get(key);
    const restored = Boolean(entry?.current() && entry.expiresAt > Date.now());
    const value = restored ? options.parse(entry?.value) ?? options.initialValue : options.initialValue;
    return { key, value, restored, recoveryUnavailable: false, scope: captureWorkspaceScope(), lease: Symbol(key) };
  };
  const [state, setState] = useState(restore);
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
    if (!scope() || live.current.key !== key || live.current.lease !== lease) return;
    const candidate = typeof next === "function" ? (next as (previous: T) => T)(live.current.value) : next;
    const settings = config.current;
    const parsed = settings.parse(candidate);
    let recoveryUnavailable = parsed === null;
    if (parsed !== null) {
      const encoded = JSON.stringify(parsed);
      if (!entries.has(key) && entries.size >= 60) expireWorkflowDrafts();
      recoveryUnavailable = encoded.length > 400_000 || (!entries.has(key) && entries.size >= 60) || !settings.resumeHref.startsWith("/") || settings.resumeHref.startsWith("//");
      if (encoded === JSON.stringify(baseline.current.value)) { entries.delete(key); emit(); }
      else if (!recoveryUnavailable) {
        const now = Date.now();
        entries.set(key, { key, kind: settings.kind, value: parsed, encoded, label: settings.label.slice(0, 100), resumeHref: settings.resumeHref, createKind: settings.createKind, updatedAt: now, expiresAt: now + Math.min(settings.ttlMs ?? WORKSPACE_SESSION_TTL_MS, settings.kind === "note" ? 86_400_000 : WORKSPACE_SESSION_TTL_MS), current: captureWorkspaceScope() }); emit();
      }
    }
    if (recoveryUnavailable && entries.delete(key)) emit();
    // Recovery limits never constrain the active form or reset its input.
    const updated = { ...live.current, value: candidate, recoveryUnavailable };
    live.current = updated; setState(updated);
  }, [key, scope, lease]);
  const clear = useCallback((expectedValue?: T) => {
    if (!scope() || live.current.key !== key || live.current.lease !== lease) return;
    if (expectedValue !== undefined && entries.get(key)?.encoded !== JSON.stringify(expectedValue)) return;
    entries.delete(key); emit();
  }, [key, scope, lease]);
  const commit = useCallback((expectedValue: T, update: (current: T) => T) => {
    if (!scope() || live.current.key !== key || live.current.lease !== lease) return;
    const unchanged = JSON.stringify(live.current.value) === JSON.stringify(expectedValue);
    baseline.current = { key, lease, value: update(expectedValue) };
    const value = update(live.current.value);
    if (unchanged) {
      entries.delete(key); emit();
      const updated = { ...live.current, value, restored: false, recoveryUnavailable: false };
      live.current = updated; setState(updated);
    } else setValue(value);
  }, [key, scope, lease, setValue]);
  useEffect(() => registerWorkspaceScopeCleanup(() => {
    const updated = { ...live.current, restored: false, scope: captureWorkspaceScope() };
    live.current = updated; setState(updated);
  }), [key]);
  return { value: state.value, setValue, clear, commit, restored: state.restored, recoveryUnavailable: state.recoveryUnavailable };
}
