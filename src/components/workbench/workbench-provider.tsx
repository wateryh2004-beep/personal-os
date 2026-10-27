"use client";
import dynamic from "next/dynamic";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import type { saveWorkspaceScene } from "@/features/workbench/scenes";
export type MetadataVerificationTransport = { readTargets: typeof import("@/features/workbench/operation-actions").readMetadataOperationTargets; apply: typeof import("@/features/workbench/operation-actions").applyMetadataOperation; readReceipt: typeof import("@/features/workbench/operation-actions").readWorkbenchReceiptState };
export type WorkbenchVerificationTransport = { metadata?: MetadataVerificationTransport; saveScene: typeof saveWorkspaceScene; note?: import("@/components/notes/note-editor").NoteEditorVerificationTransport };
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PanelRight, ArrowLeftRight, X } from "lucide-react";
import { WorkbenchContext, type WorkbenchContextValue, type WorkbenchRecordEntry } from "./workbench-context";
import { WorkbenchActivityContext } from "./workbench-activity";
import { safeWorkbenchHref, workbenchComparable, workbenchRefKey, workbenchRefSchema, workspaceSceneSnapshotSchema, type WorkbenchPosition, type WorkbenchRef, type WorkspaceSceneSnapshot, type WorkbenchViewState } from "@/features/workbench/contracts";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { containedPaneStart } from "@/lib/motion/contained-transform";
import { ReferenceNoteInsertionBoundary } from "./reference-note-insertion";
import { prepareWorkflowNavigation } from "@/features/workflow-continuity/navigation-protection";
import { cancelSourceNavigation } from "@/features/workflow-continuity/source-trail";
import { captureWorkbenchPosition, restoreWorkbenchPosition } from "./workbench-position";
import { captureWorkbenchViewState, restoreWorkbenchViewState, type RestoreAck } from "@/features/workbench/view-state-registry";
import { releaseMobileBackLayerForNavigation } from "@/lib/mobile/use-mobile-back-layer";
import { noteDocumentCache } from "@/features/notes/document-resource";
const WorkbenchEntityView = dynamic(() => import("./workbench-entity-view").then((m) => m.WorkbenchEntityView));
const WorkbenchDialogs = dynamic(() => import("./workbench-dialogs").then((m) => m.WorkbenchDialogs));
type Reference = { ref: WorkbenchRef; editing?: boolean; position?: WorkbenchPosition };
type ClosingReference = Reference & { exitRect: { left: number; top: number; width: number; height: number; opacity: number } };
export type PreviewState = { queue: WorkbenchRef[]; index: number; trigger: HTMLElement | null };
type Layout = WorkspaceSceneSnapshot["layout"];
type Internal = {
  verificationTransport?: WorkbenchVerificationTransport;
  reference: Reference | null; closingReference: ClosingReference | null; closeReference(): void; finishClosingReference(value: ClosingReference): void; setReference(value: Reference | null | ((current: Reference | null) => Reference | null)): void; layout: Layout; setLayout(value: Layout | ((previous: Layout) => Layout)): void;
  preview: PreviewState | null; setPreview(value: PreviewState | null | ((previous: PreviewState | null) => PreviewState | null)): void;
  comparison: WorkbenchRef[] | null; setComparison(value: WorkbenchRef[] | null): void;
  scenesOpen: boolean; setScenesOpen(value: boolean): void; notice: string; setNotice(value: string): void;
  mainRef: React.RefObject<HTMLDivElement | null>; referenceRef: React.RefObject<HTMLElement | null>;
  capture(): Promise<WorkspaceSceneSnapshot>; restore(value: WorkspaceSceneSnapshot, onSettled?: (ack: RestoreAck) => void): Promise<boolean>;
};
const InternalContext = createContext<Internal | null>(null);
export function useMetadataVerificationTransport() { const value = useContext(InternalContext)?.verificationTransport?.metadata; assertContinuousFixtureTransport(value); return value; }
export function useOptionalWorkbenchHost() { return useContext(InternalContext); }
export function useWorkbenchHost() { const host = useContext(InternalContext); if (!host) throw new Error("Workbench host missing"); return host; }
const emptySelection: WorkbenchRef[] = [];
const mediaQuery = "(max-width: 767px)";
const subscribeMobile = (callback: () => void) => { const query = window.matchMedia(mediaQuery); query.addEventListener("change", callback); return () => query.removeEventListener("change", callback); };
const getMobile = () => window.matchMedia(mediaQuery).matches;
export function WorkbenchProvider({ children, verificationTransport }: { children: ReactNode; verificationTransport?: WorkbenchVerificationTransport }) {
  assertContinuousFixtureTransport(verificationTransport);
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const [reference, setReference] = useState<Reference | null>(null);
  const [closingReference, setClosingReference] = useState<ClosingReference | null>(null);
  const referenceTransitionEpoch = useRef(0);
  const interruptedReferenceEnter = useRef<{ top: number; opacity: string; epoch: number; scope: () => boolean } | null>(null);
  const referenceLauncher = useRef<HTMLElement | null>(null);
  const [layout, setLayout] = useState<Layout>({ referenceFirst: false, referenceWidth: 42, mobilePane: "main" });
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [comparison, setComparison] = useState<WorkbenchRef[] | null>(null);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [dialogsVisited, setDialogsVisited] = useState(false);
  const [notice, setNotice] = useState("");
  const locationKey = `${pathname}?${search.toString()}`;
  const [modalLocation, setModalLocation] = useState(locationKey);
  if (modalLocation !== locationKey) {
    setModalLocation(locationKey);
    if (preview) setPreview(null);
    if (comparison) setComparison(null);
    if (scenesOpen) setScenesOpen(false);
  }
  const [selection, setSelection] = useState<{ group: string; refs: WorkbenchRef[]; location: string }>({ group: "", refs: [], location: locationKey });
  const records = useRef(new Map<string, WorkbenchRecordEntry>());
  const mainRef = useRef<HTMLDivElement>(null); const referenceRef = useRef<HTMLElement>(null);
  const previousRoute = useRef(`${pathname}${search.toString() ? `?${search}` : ""}`);
  const cancelViewRestore = useRef<(() => void) | null>(null);
  const viewRestoreRoute = useRef<string | null>(null);
  const viewRestoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreEpoch = useRef(0);
  const restoreCompletion = useRef<{ id: number; callback?: (ack: RestoreAck) => void } | null>(null);
  const finishSceneRestore = useCallback((ack: RestoreAck) => { const value = restoreCompletion.current; restoreCompletion.current = null; value?.callback?.(ack); }, []);
  const [pendingRestore, setPendingRestore] = useState<{ id: number; href: string; position: WorkbenchPosition; referencePosition?: WorkbenchPosition; viewState?: WorkbenchViewState; viewReady: boolean; viewAck?: RestoreAck } | null>(null);
  const register = useCallback((entry: WorkbenchRecordEntry) => {
    const key = `${entry.group}:${workbenchRefKey(entry.ref)}`;
    records.current.set(key, entry);
    return () => { if (records.current.get(key) === entry) records.current.delete(key); };
  }, []);
  const openPreview = useCallback((ref: WorkbenchRef, group?: string, trigger?: HTMLElement) => {
    if (!workbenchRefSchema.safeParse(ref).success) return;
    const queue = [...records.current.values()].filter((entry) => entry.element.isConnected && group && entry.group === group)
      .sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1).map((entry) => entry.ref);
    const index = queue.findIndex((item) => workbenchRefKey(item) === workbenchRefKey(ref));
    setDialogsVisited(true);
    setPreview({ queue: index >= 0 ? queue : [ref], index: index >= 0 ? index : 0, trigger: trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null) });
  }, []);
  const openReference = useCallback((ref: WorkbenchRef) => {
    if (!workbenchRefSchema.safeParse(ref).success) return;
    if (mainRef.current && !mainRef.current.hidden) mainRef.current.dataset.workbenchDocumentScroll = String(document.scrollingElement?.scrollTop || window.scrollY);
    referenceLauncher.current = [...records.current.values()].find((entry) => workbenchRefKey(entry.ref) === workbenchRefKey(ref))?.element ?? null;
    const epoch = ++referenceTransitionEpoch.current;
    const pane = referenceRef.current;
    interruptedReferenceEnter.current = null;
    if (pane) {
      const bounds = pane.getBoundingClientRect();
      const reversing = pane.dataset.state === "closed" && !pane.hidden;
      const opacity = reversing ? getComputedStyle(pane).opacity : "0";
      if (reversing) interruptedReferenceEnter.current = { top: bounds.top, opacity, epoch, scope: captureWorkspaceScope() };
      pane.style.setProperty("--reference-enter-width", `${bounds.width}px`);
      pane.style.setProperty("--reference-enter-y", "12px");
      pane.style.setProperty("--reference-enter-opacity", opacity);
    }
    setClosingReference(null);
    setReference((current) => {
      if (current && workbenchRefKey(current.ref) === workbenchRefKey(ref)) return current;
      if (closingReference && workbenchRefKey(closingReference.ref) === workbenchRefKey(ref)) return { ref, editing: closingReference.editing, position: closingReference.position };
      return { ref };
    });
    setLayout((value) => ({ ...value, mobilePane: "reference" }));
  }, [closingReference]);
  useLayoutEffect(() => {
    const interrupted = interruptedReferenceEnter.current;
    if (!interrupted || !reference || closingReference) return;
    interruptedReferenceEnter.current = null;
    const pane = referenceRef.current;
    if (!pane || interrupted.epoch !== referenceTransitionEpoch.current || !interrupted.scope()) return;
    // Controls have their committed height now. Remove the entering transform
    // before measuring, so an old animation sample cannot contaminate the target.
    pane.style.setProperty("--reference-enter-y", "0px");
    const target = pane.getBoundingClientRect();
    pane.style.setProperty("--reference-enter-y", `${interrupted.top - target.top}px`);
    pane.style.setProperty("--reference-enter-opacity", interrupted.opacity);
  }, [reference, closingReference]);
  const finishClosingReference = useCallback((value: ClosingReference) => {
    setClosingReference((current) => current === value ? null : current);
  }, []);
  const closeReference = useCallback(() => {
    if (!reference) return;
    const pane = referenceRef.current;
    const bounds = pane?.getBoundingClientRect();
    const opacity = pane ? Number(getComputedStyle(pane).opacity) : 1;
    const closing: ClosingReference = { ...reference, exitRect: { left: bounds?.left ?? 0, top: bounds?.top ?? 0, width: bounds?.width ?? 0, height: bounds?.height ?? 0, opacity: Number.isFinite(opacity) ? opacity : 1 } };
    pane?.style.setProperty("--reference-exit-width", `${closing.exitRect.width}px`);
    const epoch = ++referenceTransitionEpoch.current;
    interruptedReferenceEnter.current = null;
    setClosingReference(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? null : closing);
    setReference(null); setLayout((value) => ({ ...value, mobilePane: "main" }));
    const scope = captureWorkspaceScope();
    requestAnimationFrame(() => { if (scope() && referenceTransitionEpoch.current === epoch && referenceLauncher.current?.isConnected) referenceLauncher.current.focus({ preventScroll: true }); });
  }, [reference]);
  useEffect(() => {
    if (!closingReference) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () => finishClosingReference(closingReference);
    const reduce = () => { if (preference.matches) finish(); };
    reduce(); preference.addEventListener("change", reduce);
    // The native animationend normally finishes the layer; retain a bounded fallback.
    const timer = setTimeout(finish, 220);
    return () => { clearTimeout(timer); preference.removeEventListener("change", reduce); };
  }, [closingReference, finishClosingReference]);
  const toggleSelection = useCallback((ref: WorkbenchRef, group: string) => {
    if (!workbenchRefSchema.safeParse(ref).success) return;
    setSelection((current) => {
      const previous = current.group === group && current.location === locationKey ? current.refs : [];
      const exists = previous.some((item) => workbenchRefKey(item) === workbenchRefKey(ref));
      return { group, location: locationKey, refs: exists ? previous.filter((item) => workbenchRefKey(item) !== workbenchRefKey(ref)) : [...previous, ref].slice(0, 100) };
    });
  }, [locationKey]);
  const selected = selection.location === locationKey ? selection.refs : emptySelection;
  useEffect(() => {
    if (!selected.length) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      event.preventDefault(); setSelection({ group: "", refs: [], location: locationKey });
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [selected.length, locationKey]);
  const compare = useCallback((refs?: WorkbenchRef[]) => {
    const input = refs ?? selected;
    if (input.length < 2 || input.length > 4 || !input.every((item) => workbenchComparable(item) && item.kind === input[0].kind && (item.investmentType ?? "account") === (input[0].investmentType ?? "account"))) { setNotice("请选择 2–4 个同类型记录进行比较。"); return; }
    setDialogsVisited(true); setNotice(""); setComparison(input);
  }, [selected]);
  const value = useMemo<WorkbenchContextValue>(() => ({ register, openPreview, openReference, compare, toggleSelection, isSelected: (ref) => selected.some((item) => workbenchRefKey(item) === workbenchRefKey(ref)), selected, clearSelection: () => setSelection({ group: "", refs: [], location: locationKey }) }), [register, openPreview, openReference, compare, toggleSelection, selected, locationKey]);
  const capture = useCallback(async (): Promise<WorkspaceSceneSnapshot> => {
    const href = safeWorkbenchHref(window.location.pathname + window.location.search + window.location.hash);
    if (!href) throw new Error("此地址无法保存现场。");
    const scope = captureWorkspaceScope();
    const mainPosition = await captureWorkbenchPosition(mainRef.current, "main");
    const referencePosition = reference?.editing ? await captureWorkbenchPosition(referenceRef.current, "reference") : reference?.position;
    if (!scope()) throw new Error("登录状态已变化，请重新打开工作区。");
    const viewState = captureWorkbenchViewState(window.location.pathname);
    return workspaceSceneSnapshotSchema.parse({ version: 1, main: { href, position: mainPosition, ...(viewState ? { viewState } : {}) }, reference: reference ? { ref: reference.ref, editing: reference.editing ?? false, ...(referencePosition ? { position: referencePosition } : {}) } : null, layout });
  }, [layout, reference]);
  const restore = useCallback(async (input: WorkspaceSceneSnapshot, onSettled?: (ack: RestoreAck) => void) => {
    const parsed = workspaceSceneSnapshotSchema.safeParse(input);
    if (!parsed.success) { setNotice("保存的现场格式已不受支持。"); onSettled?.({ status: "partial", reason: "unavailable" }); return false; }
    const snapshot = parsed.data;
    if (!await prepareWorkflowNavigation(snapshot.main.href)) { setNotice("未离开当前页面，请先处理未保存的修改或版本冲突。"); onSettled?.({ status: "cancelled" }); return false; }
    const epoch = ++restoreEpoch.current;
    finishSceneRestore({ status: "cancelled" });
    restoreCompletion.current = { id: epoch, callback: onSettled };
    cancelSourceNavigation();
    cancelViewRestore.current?.();
    if (viewRestoreTimer.current) clearTimeout(viewRestoreTimer.current);
    cancelViewRestore.current = null;
    viewRestoreRoute.current = snapshot.main.href.split("#")[0];
    const restoreScope = captureWorkspaceScope();
    viewRestoreTimer.current = setTimeout(() => { if (!restoreScope() || restoreEpoch.current !== epoch) return; cancelViewRestore.current?.(); cancelViewRestore.current = null; setPendingRestore(null); setNotice("部分位置暂未恢复，当前内容与草稿已保留。"); finishSceneRestore({ status: "timeout" }); }, 10_000);
    // Seed numeric continuity before a route mounts. Never replace the editor body or draft.
    const match = /^\/notes\/([0-9a-f-]{36})$/.exec(snapshot.main.href.split(/[?#]/)[0]);
    const position = snapshot.main.position;
    if (match && position) {
      noteDocumentCache.get(match[1]);
      noteDocumentCache.remember(match[1], { reading: position.reading ?? false, ...(position.sourceLine ? { reader: { line: position.sourceLine, offset: position.sourceOffset ?? 0 } } : {}), ...(position.anchor !== undefined ? { editor: { anchor: position.anchor, head: position.head ?? position.anchor, viewport: { line: position.sourceLine ?? 1, offset: position.sourceOffset ?? 0 }, scrollLeft: 0 } } : {}) });
    }
    if (snapshot.reference?.ref.kind === "note" && snapshot.reference.editing && snapshot.reference.position) {
      const refPosition = snapshot.reference.position;
      noteDocumentCache.get(snapshot.reference.ref.id);
      noteDocumentCache.remember(snapshot.reference.ref.id, { reading: refPosition.reading ?? false, ...(refPosition.sourceLine ? { reader: { line: refPosition.sourceLine, offset: refPosition.sourceOffset ?? 0 } } : {}), ...(refPosition.anchor !== undefined ? { editor: { anchor: refPosition.anchor, head: refPosition.head ?? refPosition.anchor, viewport: { line: refPosition.sourceLine ?? 1, offset: refPosition.sourceOffset ?? 0 }, scrollLeft: 0 } } : {}) });
    }
    releaseMobileBackLayerForNavigation("dialog");
    referenceTransitionEpoch.current += 1; interruptedReferenceEnter.current = null; setClosingReference(null);
    setReference(snapshot.reference); setLayout(snapshot.layout); setScenesOpen(false);
    setPendingRestore({ id: epoch, href: snapshot.main.href.split("#")[0], position: position ?? {}, referencePosition: snapshot.reference?.position, viewState: snapshot.main.viewState, viewReady: !snapshot.main.viewState });
    if (snapshot.main.viewState) cancelViewRestore.current = restoreWorkbenchViewState(snapshot.main.viewState, { href: snapshot.main.href, onSettled: ack => {
      if (!restoreScope() || restoreEpoch.current !== epoch) return;
      setPendingRestore(current => current?.id === epoch ? { ...current, viewReady: true, viewAck: ack } : current);
    } });
    setNotice("正在恢复位置，当前草稿会保留。");
    router.push(snapshot.main.href, { scroll: false });
    return true;
  }, [router, finishSceneRestore]);
  const route = `${pathname}${search.toString() ? `?${search}` : ""}`;
  useEffect(() => {
    const changedRoute = previousRoute.current !== route;
    previousRoute.current = route;
    if (changedRoute && viewRestoreRoute.current !== route) { cancelViewRestore.current?.(); cancelViewRestore.current = null; }
    if (!pendingRestore || !pendingRestore.viewReady) return;
    if (route !== pendingRestore.href) {
      if (changedRoute) setPendingRestore((current) => current === pendingRestore ? null : current);
      return;
    }
    if (!mainRef.current) return;
    let live = true; let mainSettled = false; let referenceSettled = !pendingRestore.referencePosition;
    let complete = pendingRestore.viewAck?.status === "applied" || !pendingRestore.viewState;
    const consume = () => {
      if (!live || !mainSettled || !referenceSettled || restoreEpoch.current !== pendingRestore.id) return;
      if (viewRestoreTimer.current) clearTimeout(viewRestoreTimer.current);
      setPendingRestore(current => current === pendingRestore ? null : current);
      setNotice(complete ? "已恢复位置，内容已按当前来源核对。" : "部分位置已变化或暂不可用，当前内容与草稿已保留。");
      finishSceneRestore(complete ? { status: "applied" } : { status: "partial", reason: "unavailable" });
    };
    const stopMain = restoreWorkbenchPosition(mainRef.current, pendingRestore.position, { scope: "main", onSettled: restored => { mainSettled = true; complete &&= restored; consume(); } });
    const stopReference = referenceRef.current && pendingRestore.referencePosition ? restoreWorkbenchPosition(referenceRef.current, pendingRestore.referencePosition, { scope: "reference", onSettled: restored => { referenceSettled = true; complete &&= restored; consume(); } }) : undefined;
    if (!stopReference) { referenceSettled = true; consume(); }
    return () => { live = false; stopMain(); stopReference?.(); };
  }, [route, pendingRestore, finishSceneRestore]);
  useEffect(() => {
    const cancel = () => { finishSceneRestore({ status: "cancelled" }); restoreEpoch.current += 1; cancelViewRestore.current?.(); cancelViewRestore.current = null; if (viewRestoreTimer.current) clearTimeout(viewRestoreTimer.current); setPendingRestore(null); };
    const clicked = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor && (!anchor.target || anchor.target === "_self") && !anchor.download && anchor.origin === location.origin && anchor.href !== location.href) cancel();
    };
    window.addEventListener("popstate", cancel); window.addEventListener("personal-os:navigation-start", cancel); document.addEventListener("click", clicked);
    document.addEventListener("wheel", cancel, { passive: true, capture: true }); document.addEventListener("pointerdown", cancel, true); document.addEventListener("beforeinput", cancel, true);
    return () => { cancelViewRestore.current?.(); if (viewRestoreTimer.current) clearTimeout(viewRestoreTimer.current); window.removeEventListener("popstate", cancel); window.removeEventListener("personal-os:navigation-start", cancel); document.removeEventListener("click", clicked); document.removeEventListener("wheel", cancel, true); document.removeEventListener("pointerdown", cancel, true); document.removeEventListener("beforeinput", cancel, true); finishSceneRestore({ status: "cancelled" }); };
  }, [finishSceneRestore]);

  // Scope clear happens synchronously before children can mount for the new identity.
  useEffect(() => {
    const clear = () => { finishSceneRestore({ status: "cancelled" }); restoreEpoch.current += 1; referenceTransitionEpoch.current += 1; interruptedReferenceEnter.current = null; if (viewRestoreTimer.current) clearTimeout(viewRestoreTimer.current); cancelViewRestore.current?.(); cancelViewRestore.current = null; setPendingRestore(null); setReference(null); setClosingReference(null); setPreview(null); setComparison(null); setScenesOpen(false); setSelection({ group: "", refs: [], location: locationKey }); records.current.clear(); };
    window.addEventListener("personal-os:workspace-auth-failed", clear);
    return () => window.removeEventListener("personal-os:workspace-auth-failed", clear);
  }, [locationKey, finishSceneRestore]);
  const host: Internal = { verificationTransport, reference, closingReference, closeReference, finishClosingReference, setReference, layout, setLayout, preview, setPreview, comparison, setComparison, scenesOpen, setScenesOpen: (open) => { if (open) setDialogsVisited(true); setScenesOpen(open); }, notice, setNotice, mainRef, referenceRef, capture, restore };
  return <WorkbenchContext.Provider value={value}><InternalContext.Provider value={host}>{children}{dialogsVisited ? <WorkbenchDialogs /> : null}</InternalContext.Provider></WorkbenchContext.Provider>;
}
export function WorkbenchToolbar() {
  const host = useWorkbenchHost();
  return <button type="button" className="workbench-toolbar-trigger" aria-label="工作台" aria-haspopup="dialog" aria-expanded={host.scenesOpen} onClick={() => host.setScenesOpen(true)}><PanelRight size={16} aria-hidden="true"/><span>工作台</span></button>;
}
export function WorkbenchLayout({ children }: { children: ReactNode }) {
  const { mainRef, referenceRef, ...host } = useWorkbenchHost(); const context = useContext(WorkbenchContext)!; const pathname = usePathname();
  const search = useSearchParams();
  const paneId = useId();
  const divider = useRef<HTMLDivElement>(null);
  const resizeGesture = useRef<{ pointerId: number; width: number; node: HTMLDivElement; container: HTMLElement | null } | null>(null);
  const mobile = useSyncExternalStore(subscribeMobile, getMobile, () => false);
  const reference = host.reference ?? host.closingReference;
  const referenceOpen = Boolean(host.reference);
  const mainVisible = !referenceOpen || !mobile || host.layout.mobilePane === "main";
  const referenceVisible = Boolean(reference && (!mobile || host.layout.mobilePane === "reference" || host.closingReference));
  const previouslyVisible = useRef(true);
  useLayoutEffect(() => {
    if (mobile && mainVisible && !previouslyVisible.current) {
      const raw = mainRef.current?.dataset.workbenchDocumentScroll;
      if (raw !== undefined && Number.isFinite(Number(raw))) window.scrollTo({ top: Number(raw), behavior: "instant" });
    }
    previouslyVisible.current = mainVisible;
  }, [mainVisible, mobile, mainRef]);
  const switchPane = (pane: "main" | "reference") => {
    if (pane === "reference" && mainRef.current && !mainRef.current.hidden) mainRef.current.dataset.workbenchDocumentScroll = String(document.scrollingElement?.scrollTop || window.scrollY);
    host.setLayout((value) => ({ ...value, mobilePane: pane }));
  };
  const previousGeometry = useRef<{ main: DOMRect | null; reference: DOMRect | null } | null>(null);
  const movements = useRef<Animation[]>([]);
  const prepareGeometry = () => { previousGeometry.current = { main: mainRef.current?.getBoundingClientRect() ?? null, reference: referenceRef.current?.getBoundingClientRect() ?? null }; };
  const resizeTo = (width: number) => host.setLayout((value) => ({ ...value, referenceWidth: Math.max(30, Math.min(65, Math.round(width))) }));
  const endResize = (cancel = false) => {
    const gesture = resizeGesture.current;
    resizeGesture.current = null;
    gesture?.container?.removeAttribute("data-resizing");
    if (gesture && cancel) resizeTo(gesture.width);
    if (gesture?.node.hasPointerCapture?.(gesture.pointerId)) gesture.node.releasePointerCapture(gesture.pointerId);
  };
  useLayoutEffect(() => {
    const previous = previousGeometry.current;
    previousGeometry.current = null;
    movements.current.forEach((animation) => animation.cancel()); movements.current = [];
    if (!previous) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const container = mainRef.current?.parentElement?.getBoundingClientRect();
    if (!container) return;
    const viewport = window.visualViewport;
    const nav = document.querySelector(".app-sidebar")?.getBoundingClientRect();
    const left = Math.max(container.left, viewport?.offsetLeft ?? 0, nav && nav.width > 0 ? nav.right : 0);
    const right = Math.min(container.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth));
    const bounds = { left, top: container.top, width: right - left, height: container.height };
    for (const [node, from] of [[mainRef.current, previous.main], [referenceRef.current, previous.reference]] as const) {
      if (!node || !from || !node.animate) continue;
      const target = node.getBoundingClientRect();
      if (!target.width || !target.height) continue;
      const start = containedPaneStart(from, target, bounds);
      if (!start) continue;
      const animation = node.animate([{ transform: `translateX(${start.x}px) scaleX(${start.scaleX})`, transformOrigin: "left top" }, { transform: "translateX(0) scaleX(1)", transformOrigin: "left top" }], { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" });
      movements.current.push(animation);
    }
  }, [host.layout.referenceFirst, host.layout.referenceWidth, mainRef, referenceRef, pathname]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => { previousGeometry.current = null; movements.current.forEach((animation) => animation.cancel()); movements.current = []; };
    const change = () => { if (preference.matches) cancel(); };
    preference.addEventListener("change", change);
    window.addEventListener("resize", cancel); window.visualViewport?.addEventListener("resize", cancel); window.addEventListener("personal-os:navigation-start", cancel); window.addEventListener("popstate", cancel);
    const container = mainRef.current?.parentElement;
    let width = container?.getBoundingClientRect().width;
    const observer = container && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { const next = container.getBoundingClientRect().width; if (width !== next) cancel(); width = next; }) : null;
    if (container) observer?.observe(container);
    const stopScope = registerWorkspaceScopeCleanup(cancel);
    return () => { observer?.disconnect(); stopScope(); preference.removeEventListener("change", change); window.removeEventListener("resize", cancel); window.visualViewport?.removeEventListener("resize", cancel); window.removeEventListener("personal-os:navigation-start", cancel); window.removeEventListener("popstate", cancel); cancel(); const gesture = resizeGesture.current; resizeGesture.current = null; gesture?.container?.removeAttribute("data-resizing"); if (gesture?.node.hasPointerCapture?.(gesture.pointerId)) gesture.node.releasePointerCapture(gesture.pointerId); };
  }, [mainRef]);
  useEffect(() => {
    if (referenceOpen && !mobile) return;
    const gesture = resizeGesture.current;
    resizeGesture.current = null;
    gesture?.container?.removeAttribute("data-resizing");
    if (gesture?.node.hasPointerCapture?.(gesture.pointerId)) gesture.node.releasePointerCapture(gesture.pointerId);
  }, [referenceOpen, mobile]);
  const sameAsMain = reference?.ref.kind === "note" && pathname === `/notes/${reference.ref.id}`;
  const setReferenceLayout = host.setLayout;
  const activateReference = useCallback(() => setReferenceLayout(value => ({ ...value, mobilePane: "reference" })), [setReferenceLayout]);
  const focusReference = useCallback(() => { if (!referenceRef.current?.hidden && !referenceRef.current?.inert) referenceRef.current?.focus({ preventScroll: true }); }, [referenceRef]);
  return <ReferenceNoteInsertionBoundary routeKey={`${pathname}?${search.toString()}`} focusTarget={focusReference} noteId={referenceOpen && reference?.editing && reference.ref.kind === "note" && !sameAsMain ? reference.ref.id : null} activate={activateReference}>
    {referenceOpen ? <div className="workbench-layout-controls"><div className="workbench-mobile-switch" role="group" aria-label="切换工作区域"><button type="button" aria-pressed={host.layout.mobilePane === "main"} onClick={() => switchPane("main")}>主区</button><button type="button" aria-pressed={host.layout.mobilePane === "reference"} onClick={() => switchPane("reference")}>参考区</button></div><button type="button" onClick={() => { prepareGeometry(); host.setLayout((value) => ({ ...value, referenceFirst: !value.referenceFirst })); }}><ArrowLeftRight size={15} aria-hidden="true"/>交换位置</button><label className="workbench-width-control">参考区宽度<input aria-label="参考区宽度" type="range" min={30} max={65} value={host.layout.referenceWidth} onChange={(event) => resizeTo(Number(event.target.value))}/><output aria-label="参考区比例">{host.layout.referenceWidth}%</output></label><button type="button" onClick={host.closeReference}><X size={15} aria-hidden="true"/>关闭参考区</button></div> : null}
    <div className="workbench-layout" data-reference={Boolean(reference)} data-reference-first={host.layout.referenceFirst} style={{ "--reference-width": `${host.layout.referenceWidth}%` } as CSSProperties}>
      <div id={`${paneId}-main`} className="workbench-main-pane" ref={mainRef} hidden={!mainVisible} inert={!mainVisible} aria-hidden={!mainVisible || undefined}><WorkbenchActivityContext.Provider value={mainVisible}>{children}</WorkbenchActivityContext.Provider></div>
      {referenceOpen && !mobile ? <div ref={divider} className="workbench-divider" role="separator" tabIndex={0} aria-label="调整工作区比例" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={65} aria-valuenow={host.layout.referenceWidth} aria-valuetext={`参考区 ${host.layout.referenceWidth}%`} aria-controls={`${paneId}-main ${paneId}-reference`}
        onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); movements.current.forEach((animation) => animation.cancel()); resizeGesture.current = { pointerId: event.pointerId, width: host.layout.referenceWidth, node: event.currentTarget, container: event.currentTarget.parentElement }; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.parentElement?.setAttribute("data-resizing", ""); }}
        onPointerMove={(event) => { if (resizeGesture.current?.pointerId !== event.pointerId) return; const bounds = event.currentTarget.parentElement?.getBoundingClientRect(); if (bounds?.width) resizeTo(100 * (host.layout.referenceFirst ? event.clientX - bounds.left : bounds.right - event.clientX) / bounds.width); }}
        onPointerUp={() => endResize()} onPointerCancel={() => endResize(true)} onLostPointerCapture={() => endResize()}
        onKeyDown={(event) => { if (event.key === "Escape" && resizeGesture.current) { event.preventDefault(); endResize(true); } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); prepareGeometry(); const delta = (event.key === "ArrowRight" ? 1 : -1) * (host.layout.referenceFirst ? 1 : -1) * (event.shiftKey ? 5 : 2); resizeTo(event.key === "Home" ? 30 : event.key === "End" ? 65 : host.layout.referenceWidth + delta); } }}><span aria-hidden="true" /></div> : null}
      <aside className="workbench-reference-pane" data-state={referenceOpen ? "open" : "closed"}
        style={mobile && host.closingReference ? { position: "fixed", left: host.closingReference.exitRect.left, top: host.closingReference.exitRect.top, width: host.closingReference.exitRect.width, height: host.closingReference.exitRect.height, minHeight: 0, zIndex: 21, "--reference-exit-opacity": host.closingReference.exitRect.opacity } as CSSProperties : undefined}
        id={`${paneId}-reference`} tabIndex={-1} onAnimationEnd={(event) => { if (event.target === event.currentTarget && !referenceOpen && host.closingReference && (event.animationName === "workbench-reference-exit" || event.animationName === "workbench-mobile-reference-exit")) host.finishClosingReference(host.closingReference); }} ref={referenceRef} hidden={!referenceVisible} inert={!referenceOpen || !referenceVisible} aria-hidden={!referenceOpen || !referenceVisible || undefined} aria-label="参考区" onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); host.closeReference(); } }}>
        {reference ? <><div className="workbench-reference-controls"><span>参考区</span>{reference.ref.kind === "note" ? <button type="button" aria-pressed={Boolean(reference.editing)} disabled={sameAsMain} onClick={() => host.setReference({ ...reference, editing: !reference.editing })}>{reference.editing ? "阅读" : "编辑笔记"}</button> : null}</div><WorkbenchEntityView key={workbenchRefKey(reference.ref)} entityRef={reference.ref} active={referenceOpen && referenceVisible} editing={Boolean(reference.editing)} sameAsMain={sameAsMain} position={reference.position} onPosition={(position) => host.setReference((current) => current && workbenchRefKey(current.ref) === workbenchRefKey(reference.ref) ? { ...current, position: { ...current.position, ...position } } : current)}/></> : null}
      </aside>
    </div>
    {host.notice ? <div className="workbench-notice" role="status">{host.notice}<button type="button" aria-label="关闭工作台提示" onClick={() => host.setNotice("")}>×</button></div> : null}
    {context.selected.length ? <div className="workbench-selection-bar" aria-label="工作台选择"><span role="status">已选 {context.selected.length} 项</span>{context.selected.every(workbenchComparable) ? <button type="button" onClick={() => context.compare()}>比较</button> : null}<button type="button" onClick={context.clearSelection}>取消选择</button></div> : null}
  </ReferenceNoteInsertionBoundary>;
}
