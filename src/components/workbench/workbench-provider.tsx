"use client";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PanelRight, ArrowLeftRight, X } from "lucide-react";
import { WorkbenchContext, type WorkbenchContextValue, type WorkbenchRecordEntry } from "./workbench-context";
import { WorkbenchActivityContext } from "./workbench-activity";
import { safeWorkbenchHref, workbenchComparable, workbenchRefKey, workbenchRefSchema, workspaceSceneSnapshotSchema, type WorkbenchPosition, type WorkbenchRef, type WorkspaceSceneSnapshot } from "@/features/workbench/contracts";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { captureWorkbenchPosition, restoreWorkbenchPosition } from "./workbench-position";
import { captureWorkbenchViewState, restoreWorkbenchViewState } from "@/features/workbench/view-state-registry";
import { releaseMobileBackLayerForNavigation } from "@/lib/mobile/use-mobile-back-layer";
import { noteDocumentCache } from "@/features/notes/document-resource";
const WorkbenchEntityView = dynamic(() => import("./workbench-entity-view").then((m) => m.WorkbenchEntityView));
const WorkbenchDialogs = dynamic(() => import("./workbench-dialogs").then((m) => m.WorkbenchDialogs));
type Reference = { ref: WorkbenchRef; editing?: boolean; position?: WorkbenchPosition };
export type PreviewState = { queue: WorkbenchRef[]; index: number; trigger: HTMLElement | null };
type Layout = WorkspaceSceneSnapshot["layout"];
type Internal = {
  reference: Reference | null; closingReference: Reference | null; closeReference(): void; setReference(value: Reference | null | ((current: Reference | null) => Reference | null)): void; layout: Layout; setLayout(value: Layout | ((previous: Layout) => Layout)): void;
  preview: PreviewState | null; setPreview(value: PreviewState | null | ((previous: PreviewState | null) => PreviewState | null)): void;
  comparison: WorkbenchRef[] | null; setComparison(value: WorkbenchRef[] | null): void;
  scenesOpen: boolean; setScenesOpen(value: boolean): void; notice: string; setNotice(value: string): void;
  mainRef: React.RefObject<HTMLDivElement | null>; referenceRef: React.RefObject<HTMLElement | null>;
  capture(): Promise<WorkspaceSceneSnapshot>; restore(value: WorkspaceSceneSnapshot): void;
};
const InternalContext = createContext<Internal | null>(null);
export function useWorkbenchHost() { const host = useContext(InternalContext); if (!host) throw new Error("Workbench host missing"); return host; }
const emptySelection: WorkbenchRef[] = [];
const mediaQuery = "(max-width: 767px)";
const subscribeMobile = (callback: () => void) => { const query = window.matchMedia(mediaQuery); query.addEventListener("change", callback); return () => query.removeEventListener("change", callback); };
const getMobile = () => window.matchMedia(mediaQuery).matches;
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const [reference, setReference] = useState<Reference | null>(null);
  const [closingReference, setClosingReference] = useState<Reference | null>(null);
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
  const [pendingRestore, setPendingRestore] = useState<{ href: string; position: WorkbenchPosition; referencePosition?: WorkbenchPosition } | null>(null);
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
    referenceRef.current?.style.setProperty("--reference-enter-width", `${referenceRef.current.getBoundingClientRect().width}px`);
    setClosingReference(null);
    setReference((current) => current && workbenchRefKey(current.ref) === workbenchRefKey(ref) ? current : { ref });
    setLayout((value) => ({ ...value, mobilePane: "reference" }));
  }, []);
  const closeReference = useCallback(() => {
    referenceRef.current?.style.setProperty("--reference-exit-width", `${referenceRef.current.getBoundingClientRect().width}px`);
    setClosingReference(reference); setReference(null); setLayout((value) => ({ ...value, mobilePane: "main" }));
    const scope = captureWorkspaceScope();
    requestAnimationFrame(() => { if (scope() && referenceLauncher.current?.isConnected) referenceLauncher.current.focus({ preventScroll: true }); });
  }, [reference]);
  useEffect(() => {
    if (!closingReference) return;
    const immediate = window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia(mediaQuery).matches;
    const timer = setTimeout(() => setClosingReference(null), immediate ? 0 : 220);
    return () => clearTimeout(timer);
  }, [closingReference]);
  const toggleSelection = useCallback((ref: WorkbenchRef, group: string) => {
    if (!workbenchRefSchema.safeParse(ref).success) return;
    setSelection((current) => {
      const previous = current.group === group && current.location === locationKey ? current.refs : [];
      const exists = previous.some((item) => workbenchRefKey(item) === workbenchRefKey(ref));
      return { group, location: locationKey, refs: exists ? previous.filter((item) => workbenchRefKey(item) !== workbenchRefKey(ref)) : [...previous, ref].slice(0, 100) };
    });
  }, [locationKey]);
  const selected = selection.location === locationKey ? selection.refs : emptySelection;
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
  const restore = useCallback((input: WorkspaceSceneSnapshot) => {
    const parsed = workspaceSceneSnapshotSchema.safeParse(input);
    if (!parsed.success) { setNotice("保存的现场格式已不受支持。"); return; }
    const snapshot = parsed.data;
    cancelViewRestore.current?.();
    if (viewRestoreTimer.current) clearTimeout(viewRestoreTimer.current);
    cancelViewRestore.current = snapshot.main.viewState ? restoreWorkbenchViewState(snapshot.main.viewState) : null;
    viewRestoreRoute.current = snapshot.main.href.split("#")[0];
    const restoreScope = captureWorkspaceScope();
    viewRestoreTimer.current = setTimeout(() => { if (!restoreScope()) return; cancelViewRestore.current?.(); cancelViewRestore.current = null; setPendingRestore(null); }, 10_000);
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
    setReference(snapshot.reference); setLayout(snapshot.layout); setScenesOpen(false);
    setPendingRestore(position || snapshot.reference?.position ? { href: snapshot.main.href.split("#")[0], position: position ?? {}, referencePosition: snapshot.reference?.position } : null);
    setNotice("已恢复现场；内容从各自来源重新核对，当前草稿会保留。");
    router.push(snapshot.main.href, { scroll: false });
  }, [router]);
  const route = `${pathname}${search.toString() ? `?${search}` : ""}`;
  useEffect(() => {
    const changedRoute = previousRoute.current !== route;
    previousRoute.current = route;
    if (changedRoute && viewRestoreRoute.current !== route) { cancelViewRestore.current?.(); cancelViewRestore.current = null; }
    if (!pendingRestore) return;
    if (route !== pendingRestore.href) {
      if (changedRoute) setPendingRestore((current) => current === pendingRestore ? null : current);
      return;
    }
    if (!mainRef.current) return;
    let live = true; let mainSettled = false; let referenceSettled = !pendingRestore.referencePosition;
    const consume = () => { if (live && mainSettled && referenceSettled) setPendingRestore((current) => current === pendingRestore ? null : current); };
    const stopMain = restoreWorkbenchPosition(mainRef.current, pendingRestore.position, { scope: "main", onSettled: () => { mainSettled = true; consume(); } });
    const stopReference = referenceRef.current && pendingRestore.referencePosition ? restoreWorkbenchPosition(referenceRef.current, pendingRestore.referencePosition, { scope: "reference", onSettled: () => { referenceSettled = true; consume(); } }) : undefined;
    if (!stopReference) { referenceSettled = true; consume(); }
    return () => { live = false; stopMain(); stopReference?.(); };
  }, [route, pendingRestore]);
  useEffect(() => {
    const cancel = () => { cancelViewRestore.current?.(); cancelViewRestore.current = null; setPendingRestore(null); };
    const clicked = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor && (!anchor.target || anchor.target === "_self") && !anchor.download && anchor.origin === location.origin && anchor.href !== location.href) cancel();
    };
    window.addEventListener("popstate", cancel); window.addEventListener("personal-os:navigation-start", cancel); document.addEventListener("click", clicked);
    return () => { cancelViewRestore.current?.(); if (viewRestoreTimer.current) clearTimeout(viewRestoreTimer.current); window.removeEventListener("popstate", cancel); window.removeEventListener("personal-os:navigation-start", cancel); document.removeEventListener("click", clicked); };
  }, []);

  // Scope clear happens synchronously before children can mount for the new identity.
  useEffect(() => {
    const clear = () => { if (viewRestoreTimer.current) clearTimeout(viewRestoreTimer.current); cancelViewRestore.current?.(); cancelViewRestore.current = null; setPendingRestore(null); setReference(null); setClosingReference(null); setPreview(null); setComparison(null); setScenesOpen(false); setSelection({ group: "", refs: [], location: locationKey }); records.current.clear(); };
    window.addEventListener("personal-os:workspace-auth-failed", clear);
    return () => window.removeEventListener("personal-os:workspace-auth-failed", clear);
  }, [locationKey]);
  const host: Internal = { reference, closingReference, closeReference, setReference, layout, setLayout, preview, setPreview, comparison, setComparison, scenesOpen, setScenesOpen: (open) => { if (open) setDialogsVisited(true); setScenesOpen(open); }, notice, setNotice, mainRef, referenceRef, capture, restore };
  return <WorkbenchContext.Provider value={value}><InternalContext.Provider value={host}>{children}{dialogsVisited ? <WorkbenchDialogs /> : null}</InternalContext.Provider></WorkbenchContext.Provider>;
}
export function WorkbenchToolbar() {
  const host = useWorkbenchHost();
  return <button type="button" className="workbench-toolbar-trigger" aria-label="工作台" aria-haspopup="dialog" aria-expanded={host.scenesOpen} onClick={() => host.setScenesOpen(true)}><PanelRight size={16} aria-hidden="true"/><span>工作台</span></button>;
}
export function WorkbenchLayout({ children }: { children: ReactNode }) {
  const { mainRef, referenceRef, ...host } = useWorkbenchHost(); const context = useContext(WorkbenchContext)!; const pathname = usePathname();
  const mobile = useSyncExternalStore(subscribeMobile, getMobile, () => false);
  const reference = host.reference ?? host.closingReference;
  const referenceOpen = Boolean(host.reference);
  const mainVisible = !referenceOpen || !mobile || host.layout.mobilePane === "main";
  const referenceVisible = Boolean(reference && (!mobile || host.layout.mobilePane === "reference"));
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
  useLayoutEffect(() => {
    const previous = previousGeometry.current;
    previousGeometry.current = null;
    if (!previous) return;
    movements.current.forEach((animation) => animation.cancel()); movements.current = [];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [node, from] of [[mainRef.current, previous.main], [referenceRef.current, previous.reference]] as const) {
      if (!node || !from || !node.animate) continue;
      const target = node.getBoundingClientRect();
      if (!target.width || !target.height) continue;
      const animation = node.animate([{ transform: `translate(${from.left - target.left}px, ${from.top - target.top}px) scaleX(${from.width / target.width})`, transformOrigin: "left top" }, { transform: "translate(0, 0) scaleX(1)", transformOrigin: "left top" }], { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" });
      movements.current.push(animation);
    }
  }, [host.layout.referenceFirst, host.layout.referenceWidth, mainRef, referenceRef]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => movements.current.forEach((animation) => animation.cancel());
    const change = () => { if (preference.matches) cancel(); };
    preference.addEventListener("change", change);
    return () => { preference.removeEventListener("change", change); cancel(); };
  }, []);
  const sameAsMain = reference?.ref.kind === "note" && pathname === `/notes/${reference.ref.id}`;
  return <>
    {referenceOpen ? <div className="workbench-layout-controls"><div className="workbench-mobile-switch" role="group" aria-label="切换工作区域"><button type="button" aria-pressed={host.layout.mobilePane === "main"} onClick={() => switchPane("main")}>主区</button><button type="button" aria-pressed={host.layout.mobilePane === "reference"} onClick={() => switchPane("reference")}>参考区</button></div><button type="button" onClick={() => { prepareGeometry(); host.setLayout((value) => ({ ...value, referenceFirst: !value.referenceFirst })); }}><ArrowLeftRight size={15} aria-hidden="true"/>交换位置</button><label className="workbench-width-control">参考区宽度<input aria-label="参考区宽度" type="range" min={30} max={65} value={host.layout.referenceWidth} onChange={(event) => { prepareGeometry(); host.setLayout((value) => ({ ...value, referenceWidth: Number(event.target.value) })); }}/></label><button type="button" onClick={host.closeReference}><X size={15} aria-hidden="true"/>关闭参考区</button></div> : null}
    <div className="workbench-layout" data-reference={Boolean(reference)} data-reference-first={host.layout.referenceFirst} style={{ "--reference-width": `${host.layout.referenceWidth}%` } as CSSProperties}>
      <div className="workbench-main-pane" ref={mainRef} hidden={!mainVisible} inert={!mainVisible} aria-hidden={!mainVisible || undefined}><WorkbenchActivityContext.Provider value={mainVisible}>{children}</WorkbenchActivityContext.Provider></div>
      <aside className="workbench-reference-pane" data-state={referenceOpen ? "open" : "closed"} ref={referenceRef} hidden={!referenceVisible} inert={!referenceOpen || !referenceVisible} aria-hidden={!referenceOpen || !referenceVisible || undefined} aria-label="参考区" onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); host.closeReference(); } }}>
        {reference ? <><div className="workbench-reference-controls"><span>参考区</span>{reference.ref.kind === "note" ? <button type="button" aria-pressed={Boolean(reference.editing)} disabled={sameAsMain} onClick={() => host.setReference({ ...reference, editing: !reference.editing })}>{reference.editing ? "阅读" : "编辑笔记"}</button> : null}</div><WorkbenchEntityView key={workbenchRefKey(reference.ref)} entityRef={reference.ref} active={referenceOpen && referenceVisible} editing={Boolean(reference.editing)} sameAsMain={sameAsMain} position={reference.position} onPosition={(position) => host.setReference((current) => current && workbenchRefKey(current.ref) === workbenchRefKey(reference.ref) ? { ...current, position: { ...current.position, ...position } } : current)}/></> : null}
      </aside>
    </div>
    {host.notice ? <div className="workbench-notice" role="status">{host.notice}<button type="button" aria-label="关闭工作台提示" onClick={() => host.setNotice("")}>×</button></div> : null}
    {context.selected.length ? <div className="workbench-selection-bar" aria-label="工作台选择"><span>已选 {context.selected.length} 项</span>{context.selected.every(workbenchComparable) ? <button type="button" onClick={() => context.compare()}>比较</button> : null}<button type="button" onClick={context.clearSelection}>取消选择</button></div> : null}
  </>;
}
