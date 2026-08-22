"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, EyeOff, MoreHorizontal, Plus, RefreshCw, Settings2 } from "lucide-react";
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
import { formatWallDate, fullCalendarDateToInstant, instantToWallTime, shiftCalendarCursor, wallTimeToIso, weekRangeInTimeZone } from "@/features/calendar/timezone";
import { calendarRangeKey, filterCalendarEvents, isCurrentCalendarRangeResponse, reconcileCalendarMutationRange, removeCalendarEvent, replaceCalendarEvent } from "@/features/calendar/client-state";
import { primaryCalendarCategories } from "@/features/calendar/classification/taxonomy";
import { outlookCategoryDot } from "@/features/calendar/categories/visual";
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

type SyncStatus = { state: "fresh" | "syncing" | "stale" | "failed" | "unavailable"; lastSyncAt: string | null; nextHourlyAt: string | null; nextFullAt: string | null; subscriptionExpiresAt: string | null; webhookLastReceivedAt: string | null; errorCode: string | null; subscriptionExpiring: boolean } | null;
function syncLabel(status: SyncStatus) { if (!status || status.state === "unavailable") return "同步不可用"; if (status.state === "syncing") return "正在同步"; if (status.state === "failed") return `同步失败`; if (!status.lastSyncAt) return "尚未同步"; const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(status.lastSyncAt)) / 60000)); return status.state === "fresh" ? `${minutes} 分钟前同步` : `同步延迟 · ${minutes} 分钟`; }

export function CalendarWorkspace({ events, categories, timezone, syncStatus, scopeReady, initialCreateOpen = false, initialEventId }: { events: CalendarEventRecord[]; categories: CalendarCategory[]; timezone: string; syncStatus: SyncStatus; scopeReady: boolean; initialCreateOpen?: boolean; initialEventId?: string }) {
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
    const start = fullCalendarDateToInstant(range.start, timezone);
    const end = fullCalendarDateToInstant(range.end, timezone);
    const key = calendarRangeKey(start, end);
    activeRangeRef.current = range;
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
    await refetchActiveRange();
    router.refresh();
    if (result.status === "error") {
      setCalendarError(`Outlook 同步未完成：${result.message}`);
      return;
    }
    if (result.degraded.length) setCalendarError(`日历已同步；部分辅助环节未完成：${result.degraded.join("；")}`);
  });

  const changeCursor = (amount: number) => setCursor((date) => shiftCalendarCursor(date, timezone, view === "week" ? amount * 7 : amount));
  const jumpToDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setCursor(new Date(wallTimeToIso(`${value}T12:00`, timezone)));
  };

  const moveEvent = async (event: CalendarEventRecord, range: Draft & { isAllDay: boolean }) => {
    const form = new FormData();
    form.set("provider_event_id", event.provider_event_id); form.set("original_subject", event.subject); form.set("original_starts_at", event.starts_at); form.set("original_ends_at", event.ends_at);
    form.set("subject", event.subject); form.set("description", event.body_text ?? ""); form.set("location_name", event.location_name ?? ""); form.set("starts_at", range.startsAt); form.set("ends_at", range.endsAt);
    form.set("is_all_day_present", "true"); if (range.isAllDay) form.set("is_all_day", "on"); form.set("importance", event.importance); form.set("show_as", event.show_as === "unknown" ? "busy" : event.show_as); form.set("classification_mode", "auto"); form.set("preserve_categories", "true");
    const result = await updateCalendarEvent({ status: "idle", message: "" }, form);
    if (result.status !== "success") throw new Error(result.message);
    const refreshed = await refetchActiveRange();
    if (!refreshed) {
      setCalendarError("Outlook 已更新日程，但本地日历仍在对账；请稍后同步 Outlook。");
      throw new Error("calendar_local_reconciliation_pending");
    }
    const reconciliation = reconcileCalendarMutationRange(refreshed, event.id);
    if (reconciliation.kind === "moved_out_of_range") {
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
    if (!(await refetchActiveRange())) setCalendarError("Outlook 已创建日程，但本地日历仍在对账；请稍后同步 Outlook。");
  };

  const weekRange = view === "week" ? weekRangeInTimeZone(cursor.toISOString(), timezone) : null;
  const title = view === "week" && weekRange
    ? `${formatWallDate(weekRange.start)} – ${formatWallDate(weekRange.end)}`
    : new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "long", day: view === "month" ? undefined : "numeric", year: view === "month" ? "numeric" : undefined }).format(cursor);
  const syncTone = syncStatus?.state === "failed" ? "bg-[var(--danger)]" : syncStatus?.state === "fresh" && !syncStatus.subscriptionExpiring ? "bg-[var(--success)]" : "bg-[var(--warning)]";

  return (
    <section className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-[var(--border-subtle)] bg-[rgba(255,255,255,.96)] backdrop-blur-xl">
          <div className="flex min-h-[52px] items-center justify-between gap-3 px-3 md:px-4">
            <div className="flex min-w-0 items-center gap-1">
              <button className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]" onClick={() => changeCursor(-1)} aria-label="上一段日期"><ChevronLeft size={17} /></button>
              <button className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]" onClick={() => changeCursor(1)} aria-label="下一段日期"><ChevronRight size={17} /></button>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" title={view === "month" ? "跳到月份" : "跳到日期"} className="ml-1 flex min-w-0 max-w-[260px] items-center gap-1 rounded-[7px] px-1.5 py-1 text-left transition-colors ui-transition hover:bg-[var(--surface-hover)]">
                    <span className="truncate text-[16px] font-semibold tracking-[-0.025em] text-[var(--text-primary)] md:text-[18px]">{title}</span>
                    <ChevronDown size={13} className="shrink-0 text-[var(--text-tertiary)]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-3">
                  <label className="grid gap-1.5 text-[11px] text-[var(--text-secondary)]">{view === "month" ? "跳到月份" : "跳到日期"}
                    <input type={view === "month" ? "month" : "date"} defaultValue={instantToWallTime(cursor.toISOString(), timezone).slice(0, view === "month" ? 7 : 10)} onChange={(event) => { const value = event.target.value; if (value) jumpToDate(view === "month" ? `${value}-01` : value); }} className="h-9 min-w-52 rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]" />
                  </label>
                </PopoverContent>
              </Popover>
              <button onClick={() => setCursor(new Date())} className="ml-1 hidden rounded-[7px] px-2 py-1 text-[12px] font-medium text-[var(--accent)] transition-colors ui-transition hover:bg-[var(--accent-soft)] sm:block">今天</button>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <div className="hidden items-center gap-3 sm:flex">
                {availableViews.map((item) => (
                  <button key={item} onClick={() => setView(item)} aria-pressed={view === item} className={`relative px-1.5 py-2 text-[12px] font-medium transition-colors ui-transition ${view === item ? "text-[var(--text-primary)] after:absolute after:inset-x-1 after:-bottom-[10px] after:h-[2px] after:rounded-full after:bg-[var(--accent)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
                    {item === "day" ? "日" : item === "week" ? "周" : "月"}
                  </button>
                ))}
              </div>
              <span title={`下次近期待办同步：${syncStatus?.nextHourlyAt ? new Date(syncStatus.nextHourlyAt).toLocaleString("zh-CN") : "未计划"}\n下次全量对账：${syncStatus?.nextFullAt ? new Date(syncStatus.nextFullAt).toLocaleString("zh-CN") : "未计划"}`} className="ml-1 hidden items-center gap-1.5 whitespace-nowrap px-1.5 text-[10.5px] text-[var(--text-tertiary)] lg:inline-flex"><span className={`size-1.5 rounded-full ${syncTone}`} />{syncStatus?.subscriptionExpiring ? "订阅即将到期" : syncLabel(syncStatus)}</span>
              <button type="button" onClick={ai.toggle} aria-label="Calendar AI" className="inline-flex size-8 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><Bot size={15} /></button>
              <Popover>
                <PopoverTrigger asChild><button aria-label="更多日历操作" className="inline-flex size-8 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><MoreHorizontal size={17} /></button></PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-1.5">
                  <div className="sm:hidden px-1 pb-1.5"><p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">视图</p><div className="grid grid-cols-3 gap-1">{availableViews.map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-[7px] px-2 py-1.5 text-xs ${view === item ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{item === "day" ? "日" : item === "week" ? "周" : "月"}</button>)}</div></div>
                  <button onClick={sync} disabled={syncing} className="flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"><RefreshCw size={14} className={syncing ? "animate-spin" : ""}/>{syncing ? "正在同步…" : "立即同步 Outlook"}</button>
                  <button type="button" onClick={() => setHideInternship((current) => !current)} className="flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"><EyeOff size={14}/>{hideInternship ? "显示实习日程" : "隐藏实习日程"}</button>
                  <div className="my-1 border-t border-[var(--border-subtle)]" />
                  <p className="px-2 py-1.5 text-[10.5px] leading-5 text-[var(--text-tertiary)]">状态：{syncStatus?.state ?? "unavailable"}{syncStatus?.errorCode ? ` · ${syncStatus.errorCode}` : ""}<br/>最后成功：{syncStatus?.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString("zh-CN") : "从未"}<br/>全量对账：{syncStatus?.nextFullAt ? new Date(syncStatus.nextFullAt).toLocaleString("zh-CN") : "等待调度"}</p>
                </PopoverContent>
              </Popover>
              <button onClick={() => openDraft(initialDraft(timezone))} className="ml-1 inline-flex h-8 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-2.5 text-[12px] font-medium text-white transition-opacity ui-transition hover:opacity-90"><Plus size={14} />新建</button>
            </div>
          </div>

          <div className="flex min-h-[36px] items-center gap-0.5 overflow-x-auto border-t border-[rgba(60,60,67,.06)] px-3 py-1 [scrollbar-width:none] md:px-4">
            {primaryCalendarCategories.map((category) => {
              const dot = outlookCategoryDot(category.color);
              const active = selectedCategories.has(category.displayName);
              return (
                <button key={category.key} type="button" onClick={() => toggleCategory(category.displayName)} aria-pressed={active} className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 py-1 text-[11px] transition-colors ui-transition ${active ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}>
                  <span className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: dot }} />
                  {category.shortName}
                </button>
              );
            })}
            <span className="mx-1.5 h-3.5 w-px shrink-0 bg-[var(--border-subtle)]" />
            <button type="button" onClick={() => setHideInternship((current) => !current)} aria-pressed={hideInternship} className={`hidden shrink-0 items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] transition-colors ui-transition md:flex ${hideInternship ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}><EyeOff size={12}/>{hideInternship ? "已隐藏实习" : "实习"}</button>
            <button type="button" onClick={() => setSettingsOpen(true)} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[7px] px-2 py-1 text-[11px] text-[var(--text-tertiary)] transition-colors ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><Settings2 size={12} />分类</button>
          </div>
        </header>

        <CalendarFullView events={filtered} categories={categories} timezone={timezone} initialView={fullCalendarView(view)} initialDate={cursor} onOpen={openEvent} onCreate={openDraft} onMove={moveEvent} onRangeChange={onRangeChange} loadingRange={loadingRange} />
        {rangeTruncated ? <p className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[rgba(255,249,235,.94)] px-2.5 py-1 text-[10px] text-[var(--warning)] shadow-sm backdrop-blur-md">当前范围仅显示前 1,000 条日程</p> : null}
        {calendarError ? <p role="status" className="absolute left-3 top-[96px] z-10 max-w-md rounded-[8px] border border-[rgba(178,80,0,.16)] bg-[rgba(255,249,235,.96)] px-2.5 py-2 text-[10.5px] leading-5 text-[var(--warning)] shadow-sm backdrop-blur-md">{calendarError}</p> : null}
      </div>

      <Inspector open={inspector.isOpen} title={selected ? "日程详情" : "新建日程"} onClose={inspector.close} className="calendar-inspector w-[min(380px,calc(100vw-8px))]">{selected ? <><CalendarEventEditForm key={selected.id} event={selected} timezone={timezone} calendarCategories={categories} categoriesEnabled={scopeReady} onReconcile={reconcileInspectorMutation} /><EntityBacklinks type="calendar_event" id={selected.id} /></> : draft ? <CalendarCreateForm key={`${draft.startsAt}:${draft.endsAt}:${draft.isAllDay ? "all-day" : "timed"}`} timezone={timezone} categoriesEnabled={scopeReady} initialStart={draft.startsAt} initialEnd={draft.endsAt} initialAllDay={draft.isAllDay} onCreated={reconcileCreatedEvent} /> : null}</Inspector>
      {ai.isOpen ? <AISidecar open onClose={ai.close} context="Calendar"><CalendarAssistant timezone={timezone} categories={categories} /></AISidecar> : null}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[82dvh] overflow-y-auto sm:max-w-2xl"><CalendarCategoryManager categories={categories} timezone={timezone} scopeReady={scopeReady} events={eventState} referenceTime={cursor.getTime()} /></DialogContent></Dialog>
    </section>
  );
}
