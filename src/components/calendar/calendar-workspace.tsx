"use client";

import { publishOperationReceipt } from "@/features/workbench/operation-contracts";
import { CalendarPendingTasks, type PendingCalendarTask } from "./calendar-pending-tasks";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PanelPresence } from "@/components/shared/panel-presence";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, EyeOff, MoreHorizontal, Plus, RefreshCw, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { readCalendarTaskForSchedule } from "@/features/workbench/operation-read-resource";
import { registerWorkbenchViewState } from "@/features/workbench/view-state-registry";
import { CalendarCreateForm } from "@/components/calendar/calendar-create-form";
import { CalendarEventEditForm } from "@/components/calendar/calendar-event-edit-form";
import { CalendarFullView } from "@/components/calendar/calendar-full-view";
import type { CalendarEventRecord } from "@/features/calendar/types";
import { CalendarCategoryManager } from "@/components/calendar/calendar-category-manager";
import { AISidecar } from "@/components/ai/ai-sidecar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { syncAndBackupMicrosoftAction, updateCalendarEvent } from "@/features/calendar/actions";
import type { CalendarCategory } from "@/features/calendar/categories/types";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { Inspector } from "@/components/shared/inspector";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";
import { releaseMobileBackLayerForNavigation } from "@/lib/mobile/use-mobile-back-layer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatWallDate, fullCalendarDateToInstant, instantToDate, instantToWallTime, shiftCalendarCursor, shiftCalendarMonth, wallTimeToIso, weekRangeInTimeZone } from "@/features/calendar/timezone";
import { calendarRangeKey, filterCalendarEvents, isCurrentCalendarRangeResponse, reconcileCalendarMutationRange, removeCalendarEvent, replaceCalendarEvent } from "@/features/calendar/client-state";
import { primaryCalendarCategories } from "@/features/calendar/classification/taxonomy";
import { outlookCategoryDot } from "@/features/calendar/categories/visual";
import { EntityBacklinks } from "@/components/links/entity-backlinks";
import { calendarRangeResource, invalidateCalendarRangeResources, type CalendarRangeData } from "@/features/calendar/workspace-resource";

import { captureWorkspaceScope, WorkspaceReadSupersededError } from "@/lib/workspace-resource-cache";
import { calendarDragPreview, calendarDurationLabel } from "./calendar-drag-preview";
import calendarStyles from "./calendar-native.module.css";

const CalendarAssistant = dynamic(() => import("@/components/calendar/calendar-assistant").then((module) => module.CalendarAssistant), { ssr: false });

type View = "day" | "week" | "month";
type Draft = { startsAt: string; endsAt: string; isAllDay?: boolean; subject?:string; description?:string; sourceTask?:{id:string;modified:string|null} };
type Range = { start: Date; end: Date };

const fullCalendarView = (view: View) => view === "day" ? "timeGridDay" as const : view === "week" ? "timeGridWeek" as const : "dayGridMonth" as const;

function initialDraft(timezone: string): Draft {
  const now = new Date();
  const wall = instantToWallTime(now.toISOString(), timezone);
  const rounded = new Date(`${wall}:00.000Z`);
  rounded.setUTCMinutes(Math.ceil(rounded.getUTCMinutes() / 30) * 30, 0, 0);
  const startWall = rounded.toISOString().slice(0, 16);
  rounded.setUTCMinutes(rounded.getUTCMinutes() + 60);
  return { startsAt: wallTimeToIso(startWall, timezone), endsAt: wallTimeToIso(rounded.toISOString().slice(0, 16), timezone) };
}

function sameRange(a: Range | null, b: Range) { return a?.start.getTime() === b.start.getTime() && a?.end.getTime() === b.end.getTime(); }

type SyncStatus = { state: "fresh" | "syncing" | "stale" | "failed" | "unavailable"; lastSyncAt: string | null; nextHourlyAt: string | null; nextFullAt: string | null; subscriptionExpiresAt: string | null; webhookLastReceivedAt: string | null; errorCode: string | null; subscriptionExpiring: boolean; backgroundSyncLabel?: string; nextBackgroundAt?: string | null } | null;
function syncLabel(status: SyncStatus) { if (!status || status.state === "unavailable") return "同步不可用"; if (status.state === "syncing") return "正在同步"; if (status.state === "failed") return `同步失败`; if (!status.lastSyncAt) return "尚未同步"; const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(status.lastSyncAt)) / 60000)); return status.state === "fresh" ? `${minutes} 分钟前同步` : `同步延迟 · ${minutes} 分钟`; }

export function CalendarWorkspace({ events, categories, timezone, syncStatus, scopeReady, initialCreateOpen = false, initialEventId }: { events: CalendarEventRecord[]; categories: CalendarCategory[]; timezone: string; syncStatus: SyncStatus; scopeReady: boolean; initialCreateOpen?: boolean; initialEventId?: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [eventState, setEventState] = useState(events);
  const [selected, setSelected] = useState<CalendarEventRecord | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => initialCreateOpen ? initialDraft(timezone) : null);
  const [movePreview,setMovePreview]=useState<{event:CalendarEventRecord;range:Draft & {isAllDay:boolean}}|null>(null);
  const [moveBusy,setMoveBusy]=useState(false);
  const sourceTaskRead=useRef<AbortController|null>(null);
  useEffect(()=>()=>sourceTaskRead.current?.abort(),[]);
  const draftDirtyRef=useRef(false);
  const createPendingRef=useRef(false);const [createPending,setCreatePending]=useState(false);
  const deferredCreateNavigation=useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [hideInternship, setHideInternship] = useState(false);
  const [syncing, startSync] = useTransition();
  const [loadingRange, setLoadingRange] = useState(false);
  const [rangeTruncated, setRangeTruncated] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [compactViewport, setCompactViewport] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [lookup, setLookup] = useState<{ id: string; error?: string } | null>(null);
  const linkedEventRequest = useRef<AbortController | null>(null);
  const calendarNavigationIntent = useRef<string | null | undefined>(undefined);
  const supersededCalendarTargets = useRef(new Set<string | null>());
  const preserveDraftOnNavigation = useRef(false);
  const navigationRef = useRef({ initialEventId, initialCreateOpen });
  const eventStateRef = useRef(events);
  const selectedRef = useRef(selected);
  const draftRef = useRef(draft);
  const movingIds = useRef(new Set<string>());
  const moveRequests=useRef(new Map<string,string>());
  const pendingMoves = useRef(new Map<string, Draft & { isAllDay: boolean }>());
  const rangeSubscription = useRef<{ resource: ReturnType<typeof calendarRangeResource>; unsubscribe: () => void; reconcile: (reapply?: boolean) => void } | null>(null);
  const syncingRef = useRef(false);
  const mountedRef = useRef(true);
  const activeRangeRef = useRef<Range | null>(null);
  const requestSequenceRef = useRef(0);
  const ai = useWorkspacePanel("calendar-ai");
  const inspector = useWorkspacePanel("calendar-inspector");
  const openInspector = inspector.open;
  const closeInspector = inspector.close;

  useEffect(() => { eventStateRef.current = eventState; }, [eventState]);
  useEffect(() => { selectedRef.current = selected; draftRef.current = draft; }, [draft, selected]);
  useEffect(() => { navigationRef.current = { initialEventId, initialCreateOpen }; }, [initialCreateOpen, initialEventId]);
  useEffect(() => {
    mountedRef.current = true;
    const subscription = rangeSubscription.current;
    if (subscription) {
      subscription.unsubscribe();
      subscription.unsubscribe = subscription.resource.subscribe(() => subscription.reconcile());
      subscription.reconcile();
    }
    const revalidate = () => { void rangeSubscription.current?.resource.revalidate().catch(() => {}); };
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    return () => {
      requestSequenceRef.current += 1;
      rangeSubscription.current?.unsubscribe();
      mountedRef.current = false;
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
    };
  }, []);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const session = navigationRef.current.initialEventId || navigationRef.current.initialCreateOpen ? null : loadWorkspaceSession<{ view?: View; cursor?: string; categories?: string[]; hideInternship?: boolean }>("calendar:workspace");
      setSessionReady(true);
      if (!session) return;
      if (session.view && ["day", "week", "month"].includes(session.view)) setView(window.matchMedia("(max-width: 767px)").matches && session.view === "week" ? "day" : session.view);
      if (session.cursor && !Number.isNaN(new Date(session.cursor).getTime())) setCursor(new Date(session.cursor));
      if (session.categories) setSelectedCategories(new Set(session.categories));
      if (typeof session.hideInternship === "boolean") setHideInternship(session.hideInternship);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => { if (sessionReady) saveWorkspaceSession("calendar:workspace", { view, cursor: cursor.toISOString(), categories: [...selectedCategories], hideInternship }); }, [cursor, hideInternship, selectedCategories, sessionReady, view]);
  useEffect(() => {
    if (!sessionReady) return;
    return registerWorkbenchViewState("calendar", {
      capture: () => ({kind:"calendar",view,cursor:instantToDate(cursor.toISOString(),timezone),selectedCategories:[...selectedCategories],hideInternship}),
      restore: state => {
        if (state.kind !== "calendar") return;
        setView(window.matchMedia("(max-width: 767px)").matches && state.view === "week" ? "day" : state.view);
        setCursor(new Date(wallTimeToIso(`${state.cursor}T12:00`,timezone)));
        const known=new Set(primaryCalendarCategories.map(category=>category.displayName));
        setSelectedCategories(new Set(state.selectedCategories.filter(category=>known.has(category))));
        setHideInternship(state.hideInternship);
      },
    });
  }, [sessionReady,view,cursor,selectedCategories,hideInternship,timezone]);


  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setCompactViewport(media.matches);
      if (media.matches) setView((current) => current === "week" ? "day" : current);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if(createPendingRef.current){deferredCreateNavigation.current=true;return;}
    const intent = calendarNavigationIntent.current;
    if (intent !== undefined) {
      const incoming = initialEventId ?? (initialCreateOpen ? "create" : null);
      const url = new URL(window.location.href);
      const currentTarget = url.searchParams.get("event") ?? (url.searchParams.get("create") === "1" ? "create" : null);
      // A different external URL can supersede the local replace. Retire only
      // the specific local targets whose responses are known to be older.
      if (incoming !== intent && (supersededCalendarTargets.current.has(incoming) || currentTarget !== incoming)) return;
      calendarNavigationIntent.current = undefined;
      supersededCalendarTargets.current.clear();
      const keepDraft = preserveDraftOnNavigation.current && incoming === intent;
      preserveDraftOnNavigation.current = false;
      if (keepDraft) return;
    }
    const controller = new AbortController();
    linkedEventRequest.current?.abort();
    linkedEventRequest.current = controller;
    const openById = (event: CalendarEventRecord) => {
      if (controller.signal.aborted) return;
      selectedRef.current = event;
      draftRef.current = null;
      setSelected(event);
      setDraft(null);
      setLookup(null);
      setCursor(new Date(event.starts_at));
      // A direct link must be visible even if a previous category filter hid it.
      setSelectedCategories(new Set());
      setHideInternship(false);
      setEventState((current) => [event, ...current.filter((item) => item.id !== event.id)]);
      openInspector();
    };
    const start = window.setTimeout(() => {
      setSelected(null);
      setLookup(null);
      setDraft(initialCreateOpen && !initialEventId ? initialDraft(timezone) : null);
      if (!initialEventId) {
        if (initialCreateOpen) openInspector();
        else closeInspector();
        return;
      }
      setLookup({ id: initialEventId });
      openInspector();
      const local = eventStateRef.current.find((item) => item.id === initialEventId);
      if (local) { openById(local); return; }
      void fetch(`/api/calendar/events/by-id?id=${encodeURIComponent(initialEventId)}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(response.status === 404 ? "没有找到这条日程，可能已删除或尚未同步。" : "暂时无法读取这条日程，请重试。");
          return response.json() as Promise<{ event?: CalendarEventRecord }>;
        })
        .then((data) => {
          if (!data.event || data.event.id !== initialEventId || Number.isNaN(Date.parse(data.event.starts_at))) throw new Error("日程数据不完整，请重试。");
          openById(data.event);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setLookup({ id: initialEventId, error: error instanceof Error ? error.message : "暂时无法读取这条日程，请重试。" });
        });
    }, 0);
    return () => { window.clearTimeout(start); controller.abort(); };
  }, [closeInspector, initialCreateOpen, initialEventId, lookupAttempt, openInspector, timezone]);

  useEffect(() => {
    const currentTarget = initialEventId ?? (initialCreateOpen ? "create" : null);
    const targetFromUrl = (url: URL) => url.searchParams.get("event") ?? (url.searchParams.get("create") === "1" ? "create" : null);
    const acceptTarget = (target: string | null) => {
      supersededCalendarTargets.current.clear();
      supersededCalendarTargets.current.add(currentTarget);
      calendarNavigationIntent.current = target;
      preserveDraftOnNavigation.current = false;
      setLookupAttempt((current) => current + 1);
    };
    const acceptHistoryNavigation = () => {
      const target = targetFromUrl(new URL(window.location.href));
      if (target !== currentTarget) acceptTarget(target);
    };
    const acceptNavigationStart = (event: Event) => {
      const href = (event as CustomEvent<{ href?: unknown }>).detail?.href;
      if (typeof href !== "string") return;
      let url: URL;
      try { url = new URL(href, window.location.origin); } catch { return; }
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) acceptTarget(targetFromUrl(url));
    };
    const acceptLinkNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) acceptTarget(targetFromUrl(url));
    };
    window.addEventListener("popstate", acceptHistoryNavigation);
    window.addEventListener("personal-os:navigation-start", acceptNavigationStart);
    document.addEventListener("click", acceptLinkNavigation);
    return () => {
      window.removeEventListener("popstate", acceptHistoryNavigation);
      window.removeEventListener("personal-os:navigation-start", acceptNavigationStart);
      document.removeEventListener("click", acceptLinkNavigation);
    };
  }, [initialCreateOpen, initialEventId]);

  const beginCalendarNavigation = (target: string | null) => {
    supersededCalendarTargets.current.add(initialEventId ?? (initialCreateOpen ? "create" : null));
    if (calendarNavigationIntent.current !== undefined) supersededCalendarTargets.current.add(calendarNavigationIntent.current);
    calendarNavigationIntent.current = target;
  };

  const closeDetails = () => {
    if(createPendingRef.current)return false;
    sourceTaskRead.current?.abort();
    linkedEventRequest.current?.abort();
    setLookup(null);
    selectedRef.current = null;
    draftRef.current = null;
    setSelected(null);
    setDraft(null);
    closeInspector();
    preserveDraftOnNavigation.current = false;
    if (initialEventId || initialCreateOpen || calendarNavigationIntent.current !== undefined) {
      beginCalendarNavigation(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("event");
      url.searchParams.delete("create");
      releaseMobileBackLayerForNavigation("side-panel:inspector");
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    }
  };

  const reportCreatePending=useCallback((pending:boolean)=>{
    createPendingRef.current=pending;setCreatePending(pending);
    if(!pending&&deferredCreateNavigation.current){deferredCreateNavigation.current=false;setLookupAttempt(value=>value+1);}
  },[]);
  useEffect(()=>{const block=(event:KeyboardEvent)=>{if(event.key==="Escape"&&createPendingRef.current)event.preventDefault();};window.addEventListener("keydown",block,true);return()=>window.removeEventListener("keydown",block,true);},[]);

  useEffect(() => {
    if (!inspector.isOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeDetails();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  });

  const availableViews: View[] = compactViewport ? ["day", "month"] : ["day", "week", "month"];
  const filtered = useMemo(() => filterCalendarEvents(eventState, selectedCategories, hideInternship), [eventState, hideInternship, selectedCategories]);
  const toggleCategory = (name: string) => setSelectedCategories((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  const invalidateCalendarCache = useCallback(() => {
    invalidateCalendarRangeResources();
    // Locally initiated invalidation (for example a deletion) has the same
    // active-reader behavior as a server workspace revision.
    void rangeSubscription.current?.resource.revalidate().catch(() => {});
  }, []);
  const fetchRange = useCallback(async (range: Range, force = false) => {
    const start = fullCalendarDateToInstant(range.start, timezone);
    const end = fullCalendarDateToInstant(range.end, timezone);
    const key = calendarRangeKey(start, end);
    activeRangeRef.current = range;
    const sequence = ++requestSequenceRef.current;
    const scopeCurrent = captureWorkspaceScope();
    const resource = calendarRangeResource(`calendar:range:${key}`, start, end);
    if (rangeSubscription.current?.resource !== resource) {
      rangeSubscription.current?.unsubscribe();
      let applied: CalendarRangeData | undefined;
      const subscription = {
        resource,
        unsubscribe: () => {},
        reconcile: (reapply = false) => {
          if (!mountedRef.current || rangeSubscription.current !== subscription || !scopeCurrent()) return;
          const snapshot = resource.get();
          if (snapshot.data && (reapply || snapshot.data !== applied)) {
            applied = snapshot.data;
            const next = snapshot.data.events.map((event) => {
              const move = pendingMoves.current.get(event.id);
              return move ? { ...event, starts_at: move.startsAt, ends_at: move.endsAt, is_all_day: move.isAllDay } : event;
            });
            // A revision can arrive while FullCalendar is persisting a drag.
            // Keep that local overlay, including when the remote row is absent.
            for (const event of eventStateRef.current) {
              const move = pendingMoves.current.get(event.id);
              if (move && !next.some((item) => item.id === event.id)) next.push({ ...event, starts_at: move.startsAt, ends_at: move.endsAt, is_all_day: move.isAllDay });
            }
            eventStateRef.current = next;
            setEventState(next);
            setRangeTruncated(snapshot.data.truncated);
            // The selected record is also the editor's optimistic-concurrency
            // baseline. Keep it stable with the user's unsaved form inputs.
          }
          setLoadingRange(Boolean(snapshot.promise));
          if (snapshot.error && !(snapshot.error instanceof WorkspaceReadSupersededError)) {
            setCalendarError("无法读取当前日历范围；正在保留已显示的日程。请稍后重试或同步 Outlook。");
          } else if (snapshot.data && !reapply) setCalendarError(null);
        },
      };
      rangeSubscription.current = subscription;
      subscription.unsubscribe = resource.subscribe(() => subscription.reconcile());
      subscription.reconcile();
    }
    try {
      // revalidate respects staleAt and deduplicates a revision-triggered read;
      // the subscription has already displayed any cached snapshot above.
      const data = await resource.revalidate({ force });
      return scopeCurrent() && isCurrentCalendarRangeResponse(requestSequenceRef.current, sequence) ? data.events : null;
    } catch (error) {
      if (error instanceof WorkspaceReadSupersededError || (error instanceof Error && error.name === "AbortError")) return null;
      if (scopeCurrent() && isCurrentCalendarRangeResponse(requestSequenceRef.current, sequence)) setCalendarError("无法读取当前日历范围；正在保留已显示的日程。请稍后重试或同步 Outlook。");
      return null;
    }
  }, [timezone]);

  const onRangeChange = useCallback((range: Range) => {
    const key = calendarRangeKey(fullCalendarDateToInstant(range.start, timezone), fullCalendarDateToInstant(range.end, timezone));
    if (!sameRange(activeRangeRef.current, range) || rangeSubscription.current?.resource.key !== `calendar:range:${key}`) void fetchRange(range);
  }, [fetchRange, timezone]);

  const refetchActiveRange = useCallback(async () => {
    invalidateCalendarCache();
    if (activeRangeRef.current) return fetchRange(activeRangeRef.current, true);
    return null;
  }, [fetchRange, invalidateCalendarCache]);

  const openEvent = (event: CalendarEventRecord) => {
    if(createPendingRef.current)return;
    sourceTaskRead.current?.abort();
    linkedEventRequest.current?.abort();
    selectedRef.current = event; draftRef.current = null;
    setLookup(null); setSelected(event); setDraft(null); openInspector();
    preserveDraftOnNavigation.current = false;
    if ((initialEventId && initialEventId !== event.id) || initialCreateOpen || calendarNavigationIntent.current !== undefined) {
      beginCalendarNavigation(event.id);
      const url = new URL(window.location.href);
      url.searchParams.set("event", event.id);
      url.searchParams.delete("create");
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    }
  };
  const openDraft = (range: Draft) => {
    if(createPendingRef.current)return;
    sourceTaskRead.current?.abort();
    setMoreOpen(false);
    linkedEventRequest.current?.abort();
    selectedRef.current = null; draftRef.current = range;draftDirtyRef.current=false;
    setLookup(null); setSelected(null); setDraft(range); openInspector();
    if(range.sourceTask){const current=captureWorkspaceScope();const controller=new AbortController();sourceTaskRead.current=controller;void readCalendarTaskForSchedule(range.sourceTask.id,controller.signal).then(task=>{if(!current()||createPendingRef.current||draftDirtyRef.current||draftRef.current!==range)return;if(task.status==="completed"){setCalendarError("来源任务已完成，请重新核对安排。");return;}const next={...range,subject:task.title,description:`[来源任务](/tasks?task=${task.id})`,sourceTask:{id:task.id,modified:task.lastModifiedAt}};draftRef.current=next;setDraft(next);}).catch(()=>{if(current()&&!controller.signal.aborted)setCalendarError("来源任务暂未完成实时核对，创建时会再次检查。");});}
    if (initialEventId || initialCreateOpen || calendarNavigationIntent.current !== undefined) {
      beginCalendarNavigation(null);
      preserveDraftOnNavigation.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("event");
      url.searchParams.delete("create");
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    }
  };

  const sync = () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const scopeCurrent = captureWorkspaceScope();
    startSync(async () => {
      try {
        const result = await syncAndBackupMicrosoftAction();
        if (!scopeCurrent()) return;
        await refetchActiveRange();
        if (!scopeCurrent()) return;
        router.refresh();
        if (result.status === "error") setCalendarError(`Outlook 同步未完成：${result.message}`);
        else if (result.degraded.length) setCalendarError(`日历已同步；部分辅助环节未完成：${result.degraded.join("；")}`);
      } catch {
        if (!scopeCurrent()) return;
        setCalendarError("Outlook 同步失败，请稍后重试。");
      } finally { syncingRef.current = false; }
    });
  };

  const changeCursor = (amount: number) => setCursor((date) => view === "month" ? shiftCalendarMonth(date, timezone, amount) : shiftCalendarCursor(date, timezone, view === "week" ? amount * 7 : amount));
  const jumpToDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setCursor(new Date(wallTimeToIso(`${value}T12:00`, timezone)));
  };

  const moveEvent = async (event: CalendarEventRecord, range: Draft & { isAllDay: boolean }) => {
    if (movingIds.current.has(event.id)) throw new Error("calendar_event_update_pending");
    movingIds.current.add(event.id);
    pendingMoves.current.set(event.id, range);
    const scopeCurrent = captureWorkspaceScope();
    try {
      const form = new FormData();
      const key=JSON.stringify({id:event.id,from:event.starts_at,to:range});if(!moveRequests.current.has(key))moveRequests.current.set(key,crypto.randomUUID());form.set("request_id",moveRequests.current.get(key)!);
      form.set("provider_event_id", event.provider_event_id); form.set("original_subject", event.subject); form.set("original_starts_at", event.starts_at); form.set("original_ends_at", event.ends_at);
      form.set("subject", event.subject); form.set("starts_at", range.startsAt); form.set("ends_at", range.endsAt);
      form.set("is_all_day_present", "true"); if (range.isAllDay) form.set("is_all_day", "on"); form.set("importance", event.importance); form.set("show_as", event.show_as === "unknown" ? "busy" : event.show_as); form.set("classification_mode", "auto"); form.set("preserve_categories", "true");
      const result = await updateCalendarEvent({ status: "idle", message: "" }, form);
      if (!scopeCurrent()) return;
      if (result.status !== "success") {
        setCalendarError(`移动结果尚未确认：${result.message} 请重新读取后检查。`);
        throw new Error(result.message);
      }
      if(result.receiptId)publishOperationReceipt({receiptId:result.receiptId,message:result.message});
      const refreshed = await refetchActiveRange();
      if (!scopeCurrent()) return;
      if (!refreshed) {
        setCalendarError("Outlook 已更新日程，但本地日历仍在对账；请稍后同步 Outlook。");
        throw new Error("calendar_local_reconciliation_pending");
      }
      pendingMoves.current.delete(event.id);
      const reconciliation = reconcileCalendarMutationRange(refreshed, event.id);
      if (reconciliation.kind === "moved_out_of_range") {
        setEventState((current) => removeCalendarEvent(current, event.id));
        setSelected((current) => current?.id === event.id ? null : current);
        if (selectedRef.current?.id === event.id) closeDetails();
        return;
      }
      setEventState((current) => replaceCalendarEvent(current, reconciliation.event));
      setSelected((current) => current?.id === event.id ? reconciliation.event : current);
    } catch (error) {
      if (!scopeCurrent()) return;
      setCalendarError((current) => current ?? "移动结果尚未确认，请重新读取后检查。");
      throw error;
    } finally {
      movingIds.current.delete(event.id);
      pendingMoves.current.delete(event.id);
      if (scopeCurrent()) rangeSubscription.current?.reconcile(true);
    }
  };

  const reconcileInspectorMutation = async (kind: "update" | "delete") => {
    const scopeCurrent = captureWorkspaceScope();
    if (kind === "delete") {
      if (selected) setEventState((current) => removeCalendarEvent(current, selected.id));
      if (selectedRef.current?.id === selected?.id) closeDetails();
      invalidateCalendarCache();
      return;
    }
    const refreshed = await refetchActiveRange();
    if (!scopeCurrent()) return;
    if (!refreshed) {
      setCalendarError("Outlook 已更新日程，但本地日历仍在对账；请稍后同步 Outlook。");
      invalidateCalendarCache();
      return;
    }
    if (selectedRef.current?.id === selected?.id) closeDetails();
  };

  const reconcileCreatedEvent = async () => {
    const scopeCurrent = captureWorkspaceScope();
    const refreshed = await refetchActiveRange();
    if (!scopeCurrent()) return;
    if (!refreshed) setCalendarError("Outlook 已创建日程，但本地日历仍在对账；请稍后同步 Outlook。");
    if (draftRef.current === draft && !selectedRef.current) closeDetails();
  };

  const weekRange = view === "week" ? weekRangeInTimeZone(cursor.toISOString(), timezone) : null;
  const activeCategoryLabels = [...selectedCategories].map(name => primaryCalendarCategories.find(category => category.displayName === name)?.shortName ?? name);
  const title = view === "week" && weekRange
    ? `${formatWallDate(weekRange.start)} – ${formatWallDate(weekRange.end)}`
    : new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "long", day: view === "month" ? undefined : "numeric", year: view === "month" ? "numeric" : undefined }).format(cursor);
  const syncTone = syncStatus?.state === "failed" ? "bg-[var(--danger)]" : syncStatus?.state === "fresh" && !syncStatus.subscriptionExpiring ? "bg-[var(--success)]" : "bg-[var(--warning)]";

  const moveHint = movePreview ? calendarDragPreview(eventState, { ...movePreview.range, eventId: movePreview.event.id }) : null;

  return (
    <section className="calendar-workspace flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="calendar-toolbar shrink-0 border-b border-[var(--separator)] bg-[var(--surface-canvas)]">
          <div className="calendar-toolbar-primary flex items-start justify-between gap-3 px-4 pb-2 pt-5 md:px-6 md:pt-6">
            <div className="min-w-0 flex-1">
              <h1 className="min-w-0 font-[family-name:var(--font-serif)] text-[28px] font-normal leading-snug tracking-[-0.02em] text-[var(--text-primary)] md:text-[32px]">
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" title={view === "month" ? "跳到月份" : "跳到日期"} className="calendar-date-trigger pressable flex min-h-11 max-w-full items-center gap-2 rounded-[8px] py-1 text-left hover:bg-[var(--surface-hover)]">
                    <span className="break-words">{title}</span>
                    <ChevronDown size={13} className="shrink-0 text-[var(--text-tertiary)]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-3">
                  <label className="grid gap-1.5 text-[12px] text-[var(--text-secondary)]">{view === "month" ? "跳到月份" : "跳到日期"}
                    <input type={view === "month" ? "month" : "date"} defaultValue={instantToWallTime(cursor.toISOString(), timezone).slice(0, view === "month" ? 7 : 10)} onChange={(event) => { const value = event.target.value; if (value) jumpToDate(view === "month" ? `${value}-01` : value); }} className="ui-field h-9 min-w-52 rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]" />
                  </label>
                </PopoverContent>
              </Popover>
              </h1>
              <div role="group" aria-label="日期导航" className="mt-1 flex items-center gap-1">
                <button type="button" className="pressable inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={() => changeCursor(-1)} aria-label="上一段日期"><ChevronLeft size={18} /></button>
                <button type="button" className="pressable inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={() => changeCursor(1)} aria-label="下一段日期"><ChevronRight size={18} /></button>
                <button type="button" onClick={() => setCursor(new Date())} aria-label="回到今天" className="pressable min-h-11 shrink-0 rounded-[9px] px-3 text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">今天</button>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <div role="group" aria-label="日历视图" className="hidden items-center gap-2.5 sm:flex">
                {availableViews.map((item) => (
                  <button key={item} onClick={() => setView(item)} aria-pressed={view === item} className={`pressable relative rounded-[7px] px-1.5 py-[7px] text-[12px] font-medium ${view === item ? "text-[var(--text-primary)] after:absolute after:inset-x-1 after:-bottom-[9px] after:h-px after:rounded-full after:bg-[var(--accent)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
                    {item === "day" ? "日" : item === "week" ? "周" : "月"}
                  </button>
                ))}
              </div>
              <span title={`后台同步预计：${syncStatus?.nextBackgroundAt ? new Date(syncStatus.nextBackgroundAt).toLocaleString("zh-CN") : "未计划"}\n全量对账目标：${syncStatus?.nextFullAt ? new Date(syncStatus.nextFullAt).toLocaleString("zh-CN") : "未计划"}`} className="ml-1 hidden items-center gap-1.5 whitespace-nowrap px-1.5 text-[12px] text-[var(--text-tertiary)] lg:inline-flex"><span className={`size-1.5 rounded-full ${syncTone}`} />{syncStatus?.subscriptionExpiring ? "订阅即将到期" : syncLabel(syncStatus)}</span>
              <button type="button" onClick={ai.toggle} aria-label="Calendar AI" className="pressable hidden sm:inline-flex size-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><Bot size={15} /></button>
              <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                <PopoverTrigger asChild><button aria-label="更多日历操作" className="pressable inline-flex size-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><MoreHorizontal size={17} /></button></PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-1.5">
                  <div className="sm:hidden border-b border-[var(--separator)] pb-1.5 mb-1.5">
                    <button type="button" onClick={() => { setMoreOpen(false); ai.toggle(); }} className="flex min-h-11 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-[var(--text-primary)]"><Bot size={15} />Calendar AI</button>
                    <button type="button" onClick={() => { setMoreOpen(false); setSettingsOpen(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-[var(--text-primary)]"><Settings2 size={15} />管理分类</button>
                  </div>
                  <button onClick={sync} disabled={syncing} className="flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"><RefreshCw size={14} className={syncing ? "animate-spin" : ""}/>{syncing ? "正在同步…" : "立即同步 Outlook"}</button>
                  <button type="button" onClick={() => setHideInternship((current) => !current)} className="flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"><EyeOff size={14}/>{hideInternship ? "显示实习日程" : "隐藏实习日程"}</button>
                  <div className="my-1 border-t border-[var(--border-subtle)]" />
                  <p className="px-2 py-1.5 text-[12px] leading-5 text-[var(--text-tertiary)]">状态：{syncStatus?.state ?? "unavailable"}{syncStatus?.errorCode ? ` · ${syncStatus.errorCode}` : ""}<br/>{syncStatus?.backgroundSyncLabel ?? "尚未验证后台调度"}<br/>最后成功：{syncStatus?.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString("zh-CN") : "从未"}<br/>下次后台同步：{syncStatus?.nextBackgroundAt ? new Date(syncStatus.nextBackgroundAt).toLocaleString("zh-CN") : "等待首次运行验证"}<br/>全量对账目标：{syncStatus?.nextFullAt ? new Date(syncStatus.nextFullAt).toLocaleString("zh-CN") : "等待调度"}</p>
                </PopoverContent>
              </Popover>
              <button type="button" aria-label="新建日程" onClick={() => openDraft(initialDraft(timezone))} className="pressable ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-[11px] bg-[var(--accent)] px-3 text-[13px] font-medium text-[var(--surface-canvas)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]"><Plus size={16} aria-hidden="true" />新建</button>
            </div>
          </div>

          <div className="calendar-mobile-controls flex items-center justify-between gap-2 border-t border-[var(--separator)] px-3 py-1 sm:hidden">
            <div className="flex items-center gap-1" role="group" aria-label="日历视图">
              {availableViews.map((item) => <button key={item} type="button" onClick={() => setView(item)} aria-pressed={view === item} className={`pressable min-h-11 min-w-11 rounded-[8px] px-3 text-[13px] ${view === item ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{item === "day" ? "日" : item === "week" ? "周" : "月"}</button>)}
            </div>
            <Popover>
              <PopoverTrigger asChild><button type="button" className="pressable inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 text-[12px] text-[var(--text-secondary)]">筛选{selectedCategories.size ? ` · ${selectedCategories.size}` : ""}{hideInternship ? " · 已隐藏实习" : ""}<ChevronDown size={13} /></button></PopoverTrigger>
              <PopoverContent align="end" className="w-60 p-2">
                <p className="px-2 py-1 text-[12px] text-[var(--text-tertiary)]">按分类筛选 · 可多选</p>
                {primaryCalendarCategories.map((category) => <button key={category.key} type="button" onClick={() => toggleCategory(category.displayName)} aria-pressed={selectedCategories.has(category.displayName)} className={`flex min-h-11 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] ${selectedCategories.has(category.displayName) ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}><span className="size-2 rounded-full" style={{ backgroundColor: outlookCategoryDot(category.color) }} />{category.shortName}</button>)}
                {selectedCategories.size ? <button type="button" onClick={() => setSelectedCategories(new Set())} className="min-h-11 px-2 text-[12px] text-[var(--accent)]">清除分类筛选</button> : null}
              </PopoverContent>
            </Popover>
          </div>

          <div className="hidden sm:flex min-h-[34px] items-center gap-0.5 overflow-x-auto border-t border-[rgba(60,60,67,.06)] px-3 py-1 [scrollbar-width:none] md:px-4">
            {primaryCalendarCategories.map((category) => {
              const dot = outlookCategoryDot(category.color);
              const active = selectedCategories.has(category.displayName);
              return (
                <button key={category.key} type="button" onClick={() => toggleCategory(category.displayName)} aria-pressed={active} className={`pressable flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2 py-[3px] text-[12px] ${active ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}>
                  <span className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: dot }} />
                  {category.shortName}
                </button>
              );
            })}
            <span className="mx-1 h-3 w-px shrink-0 bg-[var(--border-subtle)]" />
            <button type="button" onClick={() => setHideInternship((current) => !current)} aria-pressed={hideInternship} className={`pressable hidden shrink-0 items-center gap-1 rounded-[9px] px-2 py-1 text-[12px] md:flex ${hideInternship ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}><EyeOff size={12}/>{hideInternship ? "已隐藏实习" : "实习"}</button>
            <button type="button" onClick={() => setSettingsOpen(true)} className="pressable flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[9px] px-2 py-1 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><Settings2 size={12} />分类</button>
          </div>
          {selectedCategories.size || hideInternship ? <div aria-label="已生效的日历筛选" className="calendar-active-filters flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--separator)] px-4 py-1 md:px-6">
            <p className="min-w-0 flex-1 break-words text-[13px] leading-6 text-[var(--text-secondary)]">{[...activeCategoryLabels, ...(hideInternship ? ["已隐藏实习"] : [])].join(" · ")}</p>
            <button type="button" onClick={() => { setSelectedCategories(new Set()); setHideInternship(false); }} className="ui-link min-h-11 shrink-0 text-[13px]">清除筛选</button>
          </div> : null}
        </header>

        {calendarError ? <div role="status" className="shrink-0 border-b border-[var(--separator)] bg-[var(--warning-soft)] px-4 py-2 text-[13px] leading-6 text-[var(--warning)]"><p>{calendarError} <button type="button" disabled={loadingRange} onClick={() => void refetchActiveRange()} className="inline-flex min-h-11 items-center px-2 font-medium underline">{loadingRange ? "读取中…" : "重新读取"}</button></p></div> : null}
        <CalendarPendingTasks onSchedule={(task:PendingCalendarTask)=>{const range=initialDraft(timezone);openDraft({...range,subject:task.title,description:`[来源任务](/tasks?task=${task.id})`,sourceTask:{id:task.id,modified:task.provider_last_modified_at}});}}/>
        <CalendarFullView events={filtered} categories={categories} timezone={timezone} initialView={fullCalendarView(view)} initialDate={cursor} onOpen={openEvent} onCreate={openDraft} onMove={async(event,range)=>{if(moveBusy||movingIds.current.has(event.id))throw new Error("calendar_event_update_pending");setMovePreview({event,range});}} onTaskDrop={(task,startsAt)=>openDraft({startsAt,endsAt:new Date(Date.parse(startsAt)+45*60000).toISOString(),subject:task.title,description:`[来源任务](/tasks?task=${task.id})`,sourceTask:{id:task.id,modified:task.modified}})} onRangeChange={onRangeChange} loadingRange={loadingRange} />
        {rangeTruncated ? <p className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[rgba(255,249,235,.94)] px-2.5 py-1 text-[12px] text-[var(--warning)] shadow-sm backdrop-blur-md">当前范围仅显示前 1,000 条日程</p> : null}
      </div>

      <Inspector open={inspector.isOpen||createPending} title={selected || lookup ? "日程详情" : "新建日程"} onClose={closeDetails} className="calendar-inspector w-[min(380px,calc(100vw-8px))]">{selected ? <><CalendarEventEditForm key={selected.id} event={selected} timezone={timezone} calendarCategories={categories} categoriesEnabled={scopeReady} onReconcile={reconcileInspectorMutation} /><EntityBacklinks type="calendar_event" id={selected.id} /></> : draft ? <CalendarCreateForm key={`${draft.startsAt}:${draft.endsAt}:${draft.sourceTask?.id??""}:${draft.sourceTask?.modified??""}:${draft.isAllDay ? "all-day" : "timed"}`} timezone={timezone} categoriesEnabled={scopeReady} initialStart={draft.startsAt} initialEnd={draft.endsAt} initialAllDay={draft.isAllDay} initialSubject={draft.subject} initialDescription={draft.description} sourceTask={draft.sourceTask} onPending={reportCreatePending} onDirty={()=>{draftDirtyRef.current=true;}} onCreated={reconcileCreatedEvent} /> : lookup ? <div role="status" className="space-y-3 text-sm text-[var(--text-secondary)]"><p>{lookup.error ?? "正在读取日程…"}</p>{lookup.error ? <button type="button" onClick={() => setLookupAttempt((current) => current + 1)} className="font-medium text-[var(--accent)]">重新读取</button> : null}</div> : null}</Inspector>
      <Dialog open={Boolean(movePreview)} onOpenChange={next=>{if(moveBusy)return false;if(!next)setMovePreview(null);}}><DialogContent><DialogHeader><DialogTitle>预览日程变更</DialogTitle><DialogDescription>核对后才写入 Outlook。取消保留原安排。</DialogDescription></DialogHeader>{movePreview?<div className={calendarStyles.movePreview}>
        <p className={calendarStyles.movePreviewSubject}>{movePreview.event.subject}</p>
        <div className={calendarStyles.moveTimeline}>
          <div><p>原安排</p><p>{instantToWallTime(movePreview.event.starts_at,timezone)} — {instantToWallTime(movePreview.event.ends_at,timezone)}</p></div>
          <div><p>新安排 · {movePreview.range.isAllDay ? "全天" : calendarDurationLabel(moveHint?.durationMinutes ?? null)}</p><p>{instantToWallTime(movePreview.range.startsAt,timezone)} — {instantToWallTime(movePreview.range.endsAt,timezone)}</p><p>{timezone}</p></div>
        </div>
        <p className={calendarStyles.moveConflict}>{moveHint?.overlaps.length ? `已载入的日程有 ${moveHint.overlaps.length} 项重叠：${moveHint.overlaps.slice(0,3).map(event=>event.subject||"未命名日程").join("、")}${moveHint.overlaps.length>3?"等":""}。` : "已载入的日程未发现重叠。"}{rangeTruncated || loadingRange ? " 当前范围尚不完整，请核对后确认。" : " 此提示基于最近同步的日历。"}</p>
        {calendarError ? <p role="alert" className="text-sm text-[var(--danger)]">{calendarError}</p> : null}
        <div className={calendarStyles.moveActions}><Button variant="outline" disabled={moveBusy} onClick={()=>setMovePreview(null)}>取消</Button><Button disabled={moveBusy} onClick={async()=>{setMoveBusy(true);try{await moveEvent(movePreview.event,movePreview.range);setMovePreview(null);}catch{/* Existing calendar error retains the preview. */}finally{setMoveBusy(false);}}}>{moveBusy?"保存中…":"确认更新到Outlook"}</Button></div>
      </div>:null}</DialogContent></Dialog>
      <PanelPresence open={ai.isOpen}><AISidecar open={ai.isOpen} onClose={ai.close} context="Calendar"><CalendarAssistant timezone={timezone} categories={categories} /></AISidecar></PanelPresence>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[82dvh] overflow-y-auto sm:max-w-2xl"><CalendarCategoryManager categories={categories} timezone={timezone} scopeReady={scopeReady} events={eventState} referenceTime={cursor.getTime()} /></DialogContent></Dialog>
    </section>
  );
}
