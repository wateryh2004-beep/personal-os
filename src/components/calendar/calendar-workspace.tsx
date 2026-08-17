"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Bot, ChevronLeft, ChevronRight, EyeOff, Filter, MoreHorizontal, Plus, RefreshCw, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fullCalendarDateToInstant, instantToWallTime, shiftCalendarCursor, wallTimeToIso } from "@/features/calendar/timezone";
import { calendarRangeKey, filterCalendarEvents, isCurrentCalendarRangeResponse, reconcileCalendarMutationRange, removeCalendarEvent, replaceCalendarEvent } from "@/features/calendar/client-state";
import { primaryCalendarCategories } from "@/features/calendar/classification/taxonomy";
import { outlookCategoryDot, resolveCalendarEventVisual } from "@/features/calendar/categories/visual";
import { EntityBacklinks } from "@/components/links/entity-backlinks";
import { calendarRangeResource, invalidateCalendarRangeResources } from "@/features/calendar/workspace-resource";

const CalendarAssistant = dynamic(() => import("@/components/calendar/calendar-assistant").then((module) => module.CalendarAssistant), { ssr: false });

type View = "day" | "week" | "month";
type Draft = { startsAt: string; endsAt: string; isAllDay?: boolean };
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

export function CalendarWorkspace({ events, categories, timezone, scopeReady, initialCreateOpen = false, initialEventId }: { events: CalendarEventRecord[]; categories: CalendarCategory[]; timezone: string; scopeReady: boolean; initialCreateOpen?: boolean; initialEventId?: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [eventState, setEventState] = useState(events);
  const [selected, setSelected] = useState<CalendarEventRecord | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => initialCreateOpen ? initialDraft(timezone) : null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [hideInternship, setHideInternship] = useState(false);
  const [syncing, startSync] = useTransition();
  const [loadingRange, setLoadingRange] = useState(false);
  const [rangeTruncated, setRangeTruncated] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [compactViewport, setCompactViewport] = useState(false);
  const activeRangeRef = useRef<Range | null>(null);
  const requestSequenceRef = useRef(0);
  const ai = useWorkspacePanel("calendar-ai");
  const inspector = useWorkspacePanel("calendar-inspector");
  useEffect(() => {
    if (initialEventId || initialCreateOpen) return;
    const restore = window.setTimeout(() => {
      const session = loadWorkspaceSession<{ view?: View; cursor?: string; categories?: string[]; hideInternship?: boolean }>("calendar:workspace");
      if (!session) return;
      if (session.view) setView(session.view);
      if (session.cursor && !Number.isNaN(new Date(session.cursor).getTime())) setCursor(new Date(session.cursor));
      if (session.categories) setSelectedCategories(new Set(session.categories));
      if (typeof session.hideInternship === "boolean") setHideInternship(session.hideInternship);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [initialCreateOpen, initialEventId]);
  useEffect(() => { saveWorkspaceSession("calendar:workspace", { view, cursor: cursor.toISOString(), categories: [...selectedCategories], hideInternship }); }, [cursor, hideInternship, selectedCategories, view]);
  // A seven-column time grid is not usable on a phone. This is a product
  // default only; users can still choose Month after the compact Day view.
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
  // 跨实体内链跳转：/calendar?event={本地 id}。命中当前窗口直接选中，否则按 id 拉取单条日程。
  useEffect(() => {
    if (!initialEventId) return;
    let cancelled = false;
    const openById = (event: CalendarEventRecord) => {
      if (cancelled) return;
      setSelected(event);
      setDraft(null);
      inspector.open();
    };
    const local = events.find((item) => item.id === initialEventId);
    if (local) { openById(local); return; }
    void fetch(`/api/calendar/events/by-id?id=${encodeURIComponent(initialEventId)}`, { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json())
      .then((data: { event?: CalendarEventRecord }) => {
        if (!data.event) return;
        setEventState((current) => current.some((item) => item.id === data.event!.id) ? current : [data.event!, ...current]);
        openById(data.event!);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEventId]);
  const availableViews: View[] = compactViewport ? ["day", "month"] : ["day", "week", "month"];
  const filtered = useMemo(() => filterCalendarEvents(eventState, selectedCategories, hideInternship), [eventState, hideInternship, selectedCategories]);
  const toggleCategory = (name: string) => setSelectedCategories((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  const invalidateCalendarCache = useCallback(() => { invalidateCalendarRangeResources(); }, []);
  const fetchRange = useCallback(async (range: Range, force = false) => {
    // `datesSet` returns FullCalendar's UTC-coerced wall-time dates. They are
    // UI boundary values, so convert them back before touching the API/cache.
    const start = fullCalendarDateToInstant(range.start, timezone);
    const end = fullCalendarDateToInstant(range.end, timezone);
    const key = calendarRangeKey(start, end);
    activeRangeRef.current = range;
    // Every navigation supersedes earlier requests, including a navigation
    // satisfied from cache. Otherwise an older slow request can overwrite
    // this cached range after the user has already moved on.
    const sequence = ++requestSequenceRef.current;
    const resource = calendarRangeResource(`calendar:range:${key}`, start, end);
    const cached = !force ? resource.get().data : undefined;
    if (cached) { setEventState(cached.events); setRangeTruncated(cached.truncated); setCalendarError(null); return cached.events; }
    setLoadingRange(true);
    try {
      const data = await resource.revalidate({ force });
      if (isCurrentCalendarRangeResponse(requestSequenceRef.current, sequence)) setRangeTruncated(data.truncated);
      if (isCurrentCalendarRangeResponse(requestSequenceRef.current, sequence)) { setEventState(data.events); setCalendarError(null); }
      return data.events;
    } catch {
      if (isCurrentCalendarRangeResponse(requestSequenceRef.current, sequence)) setCalendarError("无法读取当前日历范围；正在保留已显示的日程。请稍后重试或同步 Outlook。");
      return null;
    } finally {
      if (isCurrentCalendarRangeResponse(requestSequenceRef.current, sequence)) setLoadingRange(false);
    }
  }, [timezone]);
  const onRangeChange = useCallback((range: Range) => {
    if (!sameRange(activeRangeRef.current, range)) void fetchRange(range);
  }, [fetchRange]);
  const refetchActiveRange = useCallback(async () => {
    invalidateCalendarCache();
    if (activeRangeRef.current) return fetchRange(activeRangeRef.current, true);
    return null;
  }, [fetchRange, invalidateCalendarCache]);

  const openEvent = (event: CalendarEventRecord) => { setSelected(event); setDraft(null); inspector.open(); };
  const openDraft = (range: Draft) => { setSelected(null); setDraft(range); inspector.open(); };
  const sync = () => startSync(async () => {
    const result = await syncAndBackupMicrosoftAction();
    // 无论同步是否完整成功，都先刷新本地镜像：日历数据很可能已经写入
    // （分类/Todo/备份等辅助环节失败会中止整体报错），不能让用户停留在
    // 旧的空标题缓存上。
    await refetchActiveRange();
    router.refresh();
    if (result.status === "error") {
      setCalendarError(`Outlook 同步未完成：${result.message}`);
      return;
    }
    if (result.degraded.length) {
      setCalendarError(`日历已同步；部分辅助环节未完成：${result.degraded.join("；")}`);
    }
  });
  const changeCursor = (amount: number) => setCursor((date) => shiftCalendarCursor(date, timezone, view === "week" ? amount * 7 : amount));
  const moveEvent = async (event: CalendarEventRecord, range: Draft & { isAllDay: boolean }) => {
    const form = new FormData();
    form.set("provider_event_id", event.provider_event_id); form.set("original_subject", event.subject); form.set("original_starts_at", event.starts_at); form.set("original_ends_at", event.ends_at);
    form.set("subject", event.subject); form.set("description", event.body_text ?? ""); form.set("location_name", event.location_name ?? ""); form.set("starts_at", range.startsAt); form.set("ends_at", range.endsAt);
    form.set("is_all_day_present", "true"); if (range.isAllDay) form.set("is_all_day", "on"); form.set("importance", event.importance); form.set("show_as", event.show_as === "unknown" ? "busy" : event.show_as); form.set("classification_mode", "auto"); form.set("preserve_categories", "true");
    const result = await updateCalendarEvent({ status: "idle", message: "" }, form);
    if (result.status !== "success") throw new Error(result.message);
    // Outlook is authoritative. Re-read the Graph-backed mirror instead of
    // retaining a client-side drag approximation as the final event record.
    const refreshed = await refetchActiveRange();
    if (!refreshed) {
      // The remote mutation may already have succeeded, but without its
      // authoritative mirror record the grid, inspector and cache cannot
      // safely claim a new local state. Throw so FullCalendar reverts its
      // optimistic drag/resize while the normal reconciliation path catches up.
      setCalendarError("Outlook 已更新日程，但本地日历仍在对账；请稍后同步 Outlook。");
      throw new Error("calendar_local_reconciliation_pending");
    }
    const reconciliation = reconcileCalendarMutationRange(refreshed, event.id);
    if (reconciliation.kind === "moved_out_of_range") {
      // Moving an event outside the visible range is a successful mutation.
      // The range refetch already owns the visible collection, so close any
      // stale inspector instead of reverting it back into this range.
      setSelected((current) => current?.id === event.id ? null : current);
      inspector.close();
      return;
    }
    setEventState((current) => replaceCalendarEvent(current, reconciliation.event));
    setSelected((current) => current?.id === event.id ? reconciliation.event : current);
  };
  const reconcileInspectorMutation = async (kind: "update" | "delete") => {
    if (kind === "delete") {
      if (selected) setEventState((current) => removeCalendarEvent(current, selected.id));
      setSelected(null);
      inspector.close();
      invalidateCalendarCache();
      return;
    }
    const selectedId = selected?.id;
    const refreshed = await refetchActiveRange();
    if (!refreshed) {
      setCalendarError("Outlook 已更新日程，但本地日历仍在对账；请稍后同步 Outlook。");
    } else if (selectedId) {
      const reconciliation = reconcileCalendarMutationRange(refreshed, selectedId);
      if (reconciliation.kind === "updated") setSelected(reconciliation.event);
      else {
        setSelected(null);
        inspector.close();
      }
    }
    invalidateCalendarCache();
  };
  const reconcileCreatedEvent = async () => {
    if (!(await refetchActiveRange()))
      setCalendarError("Outlook 已创建日程，但本地日历仍在对账；请稍后同步 Outlook。");
  };
  const title = new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "long", day: view === "month" ? undefined : "numeric", year: view === "month" ? "numeric" : undefined }).format(cursor);

  return <section className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 overflow-hidden bg-white">
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-1"><button className="rounded p-1.5 hover:bg-[var(--surface-hover)]" onClick={() => changeCursor(-1)} aria-label="上一段日期"><ChevronLeft size={17} /></button><button onClick={() => setCursor(new Date())} className="rounded px-2 py-1 text-sm hover:bg-[var(--surface-hover)]">今天</button><button className="rounded p-1.5 hover:bg-[var(--surface-hover)]" onClick={() => changeCursor(1)} aria-label="下一段日期"><ChevronRight size={17} /></button><span className="ml-2 truncate text-sm font-medium">{title}</span></div>
        <div className="flex flex-wrap items-center gap-1"><div className="rounded-md bg-[var(--surface-hover)] p-0.5">{availableViews.map((item) => <button key={item} onClick={() => setView(item)} className={`rounded px-2 py-1 text-xs ${view === item ? "bg-white text-[var(--accent)] shadow-sm" : ""}`}>{item === "day" ? "日" : item === "week" ? "周" : "月"}</button>)}</div><button type="button" onClick={() => setHideInternship((current) => !current)} aria-pressed={hideInternship} className={`flex items-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${hideInternship ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}><EyeOff size={14}/>{hideInternship ? "显示实习" : "隐藏实习"}</button><Popover><PopoverTrigger asChild><button aria-label="更多日历操作" className="rounded p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><MoreHorizontal size={16} /></button></PopoverTrigger><PopoverContent align="end" className="w-56"><button onClick={sync} disabled={syncing} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]"><RefreshCw size={14} className={syncing ? "animate-spin" : ""}/>{syncing ? "正在同步…" : "同步 Outlook"}</button><button onClick={() => setSettingsOpen(true)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]"><Settings2 size={14}/>分类设置</button><button onClick={ai.toggle} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]"><Bot size={14}/>Calendar AI</button></PopoverContent></Popover><Popover><PopoverTrigger asChild><button aria-label="筛选分类" aria-pressed={selectedCategories.size > 0} className={`relative rounded p-2 hover:bg-[var(--surface-hover)] ${selectedCategories.size ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}><Filter size={15}/>{selectedCategories.size ? <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--accent)]"/> : null}</button></PopoverTrigger><PopoverContent align="end" className="w-56"><button onClick={() => setSelectedCategories(new Set())} className="mb-1 text-xs text-[var(--accent)]">清除筛选</button>{categories.map((category) => <label key={category.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-[var(--surface-hover)]"><input type="checkbox" checked={selectedCategories.has(category.display_name)} onChange={() => toggleCategory(category.display_name)} /><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: resolveCalendarEventVisual([category.display_name], categories).dot }} /><span className="truncate">{category.display_name}</span></label>)}</PopoverContent></Popover><button onClick={() => openDraft(initialDraft(timezone))} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white"><Plus size={14} className="mr-1 inline" />新建</button></div>
      </header>
      <div className="flex items-center gap-1 overflow-x-auto border-b bg-[var(--surface-canvas)] px-3 py-1.5 [scrollbar-width:thin]">
        {primaryCalendarCategories.map((category) => {
          const dot = outlookCategoryDot(category.color);
          const active = selectedCategories.has(category.displayName);
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => toggleCategory(category.displayName)}
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
              {category.shortName}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px shrink-0 bg-[var(--border-subtle)]" />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
        >
          <Settings2 size={12} />
          分类设置
        </button>
      </div>
      <CalendarFullView events={filtered} categories={categories} timezone={timezone} initialView={fullCalendarView(view)} initialDate={cursor} onOpen={openEvent} onCreate={openDraft} onMove={moveEvent} onRangeChange={onRangeChange} loadingRange={loadingRange} />
      {rangeTruncated ? <p className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">当前范围仅显示前 1,000 条日程。</p> : null}
      {calendarError ? <p role="status" className="absolute left-3 top-3 z-10 max-w-md rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">{calendarError}</p> : null}
    </div>
    <Inspector open={inspector.isOpen} title={selected ? "日程详情" : "新建日程"} onClose={inspector.close} className="w-[min(380px,calc(100vw-8px))]">{selected ? <><CalendarEventEditForm key={selected.id} event={selected} timezone={timezone} calendarCategories={categories} categoriesEnabled={scopeReady} onReconcile={reconcileInspectorMutation} /><EntityBacklinks type="calendar_event" id={selected.id} /></> : draft ? <CalendarCreateForm key={`${draft.startsAt}:${draft.endsAt}:${draft.isAllDay ? "all-day" : "timed"}`} timezone={timezone} categoriesEnabled={scopeReady} initialStart={draft.startsAt} initialEnd={draft.endsAt} initialAllDay={draft.isAllDay} onCreated={reconcileCreatedEvent} /> : null}</Inspector>
    {ai.isOpen ? <AISidecar open onClose={ai.close} context="Calendar"><CalendarAssistant timezone={timezone} categories={categories} /></AISidecar> : null}
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent><CalendarCategoryManager categories={categories} timezone={timezone} scopeReady={scopeReady} events={eventState} referenceTime={cursor.getTime()} /></DialogContent></Dialog>
  </section>;
}
