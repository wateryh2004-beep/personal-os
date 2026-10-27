"use client";

import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { safeWorkbenchHref, type WorkspaceSceneSnapshot } from "@/features/workbench/contracts";
import { prepareWorkflowNavigation } from "./navigation-protection";
import { announceNavigationIntent, beginNavigationIntent } from "./navigation-intent";

export type SourceSearchState = { query: string; selectedValue: string; scrollTop: number };
export type SourceTrailEntry = { id: string; label: string; destination: string; scene: WorkspaceSceneSnapshot; search?: SourceSearchState };
const empty: SourceTrailEntry[] = [];
let entries = empty;
const listeners = new Set<() => void>();
let pendingSearch: SourceSearchState | null = null;
export function requestSourceSearchRestore(search: SourceSearchState) { pendingSearch = search; window.dispatchEvent(new Event("personal-os:search-restore")); }
export function takeSourceSearchRestore() { const value = pendingSearch; pendingSearch = null; return value; }
export const cancelSourceNavigation = announceNavigationIntent;
export function beginSourceNavigation() {
  const intentCurrent = beginNavigationIntent(); const scope = captureWorkspaceScope();
  const location = typeof window === "undefined" ? null : window.location.href;
  return () => scope() && intentCurrent() && (location === null || window.location.href === location);
}
const emit = () => listeners.forEach(listener => listener());
export const subscribeSourceTrail = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSourceTrail = () => entries;
export const getSourceTrailServerSnapshot = () => empty;
registerWorkspaceScopeCleanup(() => { cancelSourceNavigation(); pendingSearch = null; entries = []; emit(); });
export function addSourceTrailEntry(scene: WorkspaceSceneSnapshot, destination: string, label: string, search?: SourceSearchState) {
  const safe = safeWorkbenchHref(destination);
  if (!safe || safe === scene.main.href) return;
  const source = safeWorkbenchHref(scene.main.href);
  if (!source) return;
  const existing = entries.findIndex(entry => entry.scene.main.href === source && entry.destination === safe);
  if (existing >= 0) entries = entries.slice(0, existing);
  entries = [...entries, { id: crypto.randomUUID(), label: label.slice(0, 60), destination: safe, scene: { ...scene, main: { ...scene.main, href: source } }, ...(search ? { search: { query: search.query.slice(0, 300), selectedValue: search.selectedValue.slice(0, 160), scrollTop: Math.max(0, Math.min(search.scrollTop, 10_000_000)) } } : {}) }].slice(-16);
  emit();
}
export function consumeSourceTrailEntry(id: string) {
  const index = entries.findIndex(entry => entry.id === id);
  if (index < 0) return null;
  const entry = entries[index]; entries = entries.slice(0, index); emit(); return entry;
}
/** Capture at the explicit navigation boundary; a late result cannot reroute the next click. */
export async function captureSourceNavigation(options: { capture: () => Promise<WorkspaceSceneSnapshot>; destination: string; label: string; navigate: (href: string) => void; current: () => boolean; search?: SourceSearchState }) {
  const scope = captureWorkspaceScope();
  const href = safeWorkbenchHref(options.destination);
  if (!href || href !== options.destination) return;
  let scene: WorkspaceSceneSnapshot | undefined;
  try { scene = await options.capture(); }
  catch { /* Saving the source trail is optional; its guard is not. */ }
  if (!scope() || !options.current()) return;
  if (!await prepareWorkflowNavigation(href)) return;
  if (scene) addSourceTrailEntry(scene, href, options.label, options.search);
  options.navigate(href);
}
