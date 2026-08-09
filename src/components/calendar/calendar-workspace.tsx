"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bot, Check, ChevronLeft, ChevronRight, Filter, Plus, RefreshCw, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { CalendarAssistant } from "@/components/calendar/calendar-assistant";
import { CalendarCreateForm } from "@/components/calendar/calendar-create-form";
import { CalendarEventEditForm } from "@/components/calendar/calendar-event-edit-form";
import { CalendarEventCard, MonthEventButton, type CalendarEventRecord } from "@/components/calendar/calendar-event-card";
import { CalendarCategoryManager } from "@/components/calendar/calendar-category-manager";
import { AISidecar } from "@/components/ai/ai-sidecar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { syncAndBackupMicrosoftAction } from "@/features/calendar/actions";
import type { CalendarCategory } from "@/features/calendar/categories/types";
import { resolveCalendarEventVisual } from "@/features/calendar/categories/visual";
import { layoutTimedEvents, projectEventsByLocalDay, type TimedEventSegment } from "@/features/calendar/view-utils";
import { wallTimeToIso } from "@/features/calendar/timezone";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { Inspector as WorkspaceInspector } from "@/components/shared/inspector";

type CalendarView = "day" | "week" | "month";
type DraftRange = { startsAt: string; endsAt: string };
const weekDays = ["一", "二", "三", "四", "五", "六", "日"];
const visibleStartHour = 6;
const visibleEndHour = 24;
const hourHeight = 46;
const timeColumnWidth = 58;
const pad = (value: number) => String(value).padStart(2, "0");
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const keyInZone = (date: Date, timezone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, amount: number) => { const value = new Date(date); value.setDate(value.getDate() + amount); return value; };
const startOfWeek = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7));
const startOfMonthGrid = (date: Date) => startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
const dateLabel = (value: Date) => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(value);
const minutesInZone = (date: Date, timezone: string) => { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date); const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value); return get("hour") * 60 + get("minute"); };

function buildDraft(dateKey: string, startMinutes: number, timezone: string): DraftRange {
  const snapped = Math.max(0, Math.min(23 * 60 + 45, Math.round(startMinutes / 15) * 15));
  const end = Math.min(24 * 60 - 1, snapped + 60);
  const wall = (minutes: number) => `${dateKey}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  return { startsAt: wallTimeToIso(wall(snapped), timezone), endsAt: wallTimeToIso(wall(end), timezone) };
}

function TimeGrid({ dates, segmentsByDate, today, timezone, categories, view, now, onOpen, onCreate }: { dates: Date[]; segmentsByDate: Map<string, TimedEventSegment<CalendarEventRecord>[]>; today: string; timezone: string; categories: CalendarCategory[]; view: "day" | "week"; now: Date; onOpen: (event: CalendarEventRecord) => void; onCreate: (range: DraftRange) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridHeight = (visibleEndHour - visibleStartHour) * hourHeight;
  const columns = `${timeColumnWidth}px repeat(${dates.length}, minmax(${dates.length === 1 ? "480px" : "145px"}, 1fr))`;
  const hours = Array.from({ length: visibleEndHour - visibleStartHour + 1 }, (_, index) => visibleStartHour + index);
  const nowMinutes = minutesInZone(now, timezone);
  useEffect(() => {
    const initialNow = new Date();
    const initialMinutes = minutesInZone(initialNow, timezone);
    const target = Math.max(0, ((today === keyInZone(initialNow, timezone) ? initialMinutes - 120 : 8 * 60) - visibleStartHour * 60) / 60 * hourHeight);
    if (scrollRef.current) scrollRef.current.scrollTop = target;
  }, [today, timezone]); // Initial viewport only; the live line moves without stealing scroll.
  return <div ref={scrollRef} className="workspace-scroll min-h-0 flex-1 overflow-auto">
    <div className="min-w-[820px]">
      <div className="sticky top-0 z-40 grid border-b bg-white" style={{ gridTemplateColumns: columns }}><div className="border-r bg-white" />{dates.map((date) => { const key = keyOf(date); const weekend = date.getDay() === 0 || date.getDay() === 6; return <div key={key} className={`border-r px-3 py-2 text-xs last:border-r-0 ${key === today ? "bg-[var(--accent-soft)] text-[var(--accent)]" : weekend ? "bg-zinc-50 text-zinc-500" : "text-[var(--text-secondary)]"}`}>周{weekDays[(date.getDay() + 6) % 7]} <span className="ml-1 font-mono tabular-nums">{date.getMonth() + 1}/{date.getDate()}</span></div>; })}</div>
      <div className="sticky top-[33px] z-30 grid border-b bg-white" style={{ gridTemplateColumns: columns }}><div className="flex min-h-10 items-center border-r px-2 text-[10px] text-zinc-400">全天</div>{dates.map((date) => { const key = keyOf(date); const allDay = (segmentsByDate.get(key) ?? []).filter((segment) => segment.event.is_all_day); return <div key={key} className={`min-h-10 border-r px-1 py-1 last:border-r-0 ${key === today ? "bg-[#F7FAFB]" : ""}`}>{allDay.slice(0, 3).map((segment) => <MonthEventButton key={segment.id} event={segment.event} timezone={timezone} categories={categories} onOpen={() => onOpen(segment.event)} />)}{allDay.length > 3 ? <p className="px-1 text-[10px] text-zinc-500">+{allDay.length - 3} 项</p> : null}</div>; })}</div>
      <div className="grid" style={{ gridTemplateColumns: columns }}><div className="sticky left-0 z-20 relative border-r bg-white" style={{ height: gridHeight }}>{hours.map((hour) => <span key={hour} className="absolute right-2 -translate-y-2 font-mono text-[10px] text-zinc-400" style={{ top: (hour - visibleStartHour) * hourHeight }}>{pad(hour)}:00</span>)}</div>{dates.map((date) => { const key = keyOf(date); const weekend = date.getDay() === 0 || date.getDay() === 6; const layouts = layoutTimedEvents(segmentsByDate.get(key) ?? [], { view, startHour: visibleStartHour, endHour: visibleEndHour }); const isToday = key === today; return <div key={key} role="gridcell" aria-label={`${key} 日程网格`} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const minutes = visibleStartHour * 60 + ((event.clientY - rect.top) / hourHeight) * 60; onCreate(buildDraft(key, minutes, timezone)); }} className={`relative border-r last:border-r-0 ${isToday ? "bg-[#fbfdfe]" : weekend ? "bg-zinc-50/50" : ""}`} style={{ height: gridHeight, backgroundImage: `linear-gradient(to bottom, rgba(244,244,245,.72) 0, rgba(244,244,245,.72) ${3 * hourHeight}px, transparent ${3 * hourHeight}px, transparent ${12 * hourHeight}px, rgba(244,244,245,.72) ${12 * hourHeight}px), linear-gradient(to bottom, rgba(228,228,231,.9) 1px, transparent 1px), linear-gradient(to bottom, rgba(244,244,245,.8) 1px, transparent 1px)`, backgroundSize: `100% 100%, 100% ${hourHeight}px, 100% ${hourHeight / 2}px` }}>{isToday && nowMinutes >= visibleStartHour * 60 && nowMinutes <= visibleEndHour * 60 ? <div className="pointer-events-none absolute inset-x-0 z-30 border-t border-[var(--accent)]/60" style={{ top: ((nowMinutes - visibleStartHour * 60) / 60) * hourHeight }}><span className="absolute -left-1 -top-1 size-2 rounded-full bg-[var(--accent)]"/><span className="absolute right-1 -top-4 bg-white/90 px-1 font-mono text-[9px] text-[var(--accent)]">{pad(Math.floor(nowMinutes / 60))}:{pad(nowMinutes % 60)}</span></div> : null}{layouts.map((layout) => <CalendarEventCard key={layout.segmentId} layout={layout} timezone={timezone} categories={categories} hourHeight={hourHeight} visibleStartHour={visibleStartHour} onOpen={() => onOpen(layout.event)} />)}</div>; })}</div>
    </div>
  </div>;
}

function CalendarInspector({ event, draft, timezone, categories, categoriesEnabled, onClose, open }: { event: CalendarEventRecord | null; draft: DraftRange | null; timezone: string; categories: CalendarCategory[]; categoriesEnabled: boolean; onClose: () => void; open: boolean }) {
  if (!event && !draft) return null;
  return <WorkspaceInspector open={open} title={event ? "日程详情" : "新建日程"} onClose={onClose} className="w-[min(380px,calc(100vw-8px))]"><p className="mb-5 text-xs text-[var(--text-secondary)]">{event ? "保存后更新同一条 Outlook 日程" : "创建后同步至 Outlook"}</p>{event ? <CalendarEventEditForm key={`${event.id}:${event.starts_at}`} event={event} timezone={timezone} calendarCategories={categories} categoriesEnabled={categoriesEnabled} /> : draft ? <CalendarCreateForm key={draft.startsAt} timezone={timezone} categoriesEnabled={categoriesEnabled} initialStart={draft.startsAt} initialEnd={draft.endsAt} /> : null}</WorkspaceInspector>;
}

export function CalendarWorkspace({ events, categories, timezone, scopeReady, initialCreateOpen = false }: { events: CalendarEventRecord[]; categories: CalendarCategory[]; timezone: string; scopeReady: boolean; initialCreateOpen?: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<CalendarView>("week");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [draft, setDraft] = useState<DraftRange | null>(() => initialCreateOpen ? buildDraft(keyInZone(new Date(), timezone), Math.max(9 * 60, minutesInZone(new Date(), timezone) + 30), timezone) : null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventRecord | null>(null);
  const calendarAssistant = useWorkspacePanel("calendar-ai");
  const { isOpen: calendarInspectorOpen, open: openCalendarInspector, close: closeCalendarInspector } = useWorkspacePanel("calendar-inspector");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [syncState, setSyncState] = useState<{ tone: "idle" | "success" | "error"; message: string }>({ tone: "idle", message: "" });
  const [isSyncing, startSyncTransition] = useTransition();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (initialCreateOpen) openCalendarInspector(); }, [initialCreateOpen, openCalendarInspector]);
  const normalizedEvents = useMemo(() => events.map((event) => ({ ...event, categories: event.categories ?? [], importance: event.importance ?? "normal", show_as: event.show_as ?? "unknown" })), [events]);
  const filteredEvents = useMemo(() => selectedCategories.size ? normalizedEvents.filter((event) => event.categories.some((category) => selectedCategories.has(category))) : normalizedEvents, [normalizedEvents, selectedCategories]);
  const segmentsByDate = useMemo(() => projectEventsByLocalDay(filteredEvents, timezone), [filteredEvents, timezone]);
  const dates = view === "month" ? Array.from({ length: 42 }, (_, index) => addDays(startOfMonthGrid(cursor), index)) : view === "week" ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)) : [cursor];
  const step = (amount: number) => setCursor((current) => view === "month" ? new Date(current.getFullYear(), current.getMonth() + amount, 1) : addDays(current, amount * (view === "week" ? 7 : 1)));
  const title = view === "month" ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(cursor) : view === "week" ? `${dateLabel(dates[0])} — ${dateLabel(dates[6])}` : dateLabel(cursor);
  const today = keyInZone(now, timezone);
  const openCreate = (range?: DraftRange) => { setSelectedEvent(null); setDraft(range ?? buildDraft(today, Math.max(9 * 60, minutesInZone(now, timezone) + 30), timezone)); openCalendarInspector(); };
  const openEvent = (event: CalendarEventRecord) => { setDraft(null); setSelectedEvent(event); openCalendarInspector(); };
  const closeInspector = () => { closeCalendarInspector(); setDraft(null); setSelectedEvent(null); };
  const toggleCategory = (name: string) => setSelectedCategories((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  const sync = () => { setSyncState({ tone: "idle", message: "正在对齐 Outlook…" }); startSyncTransition(async () => { try { const result = await syncAndBackupMicrosoftAction(); const categoryMessage = result.calendarCategoryStatus === "reauthorization_required" ? " · 分类需重新授权" : ` · 分类 ${result.calendarCategoryCount} 个`; setSyncState({ tone: "success", message: `已对齐 · 日历 ${result.calendarEventCount} 项，待办 ${result.todoTaskCount} 项${categoryMessage}` }); router.refresh(); } catch { setSyncState({ tone: "error", message: "对齐未完成，请检查 Outlook 连接和数据库 migration 后重试。" }); } }); };
  return <section className="flex h-[calc(100dvh-var(--toolbar-height))] min-h-[540px] overflow-hidden bg-white"><div className="flex min-w-0 flex-1 flex-col"><div className="relative flex min-h-[var(--toolbar-height)] flex-wrap items-center justify-between gap-3 border-b px-4 py-2"><div className="flex min-w-0 items-center gap-1"><button className="rounded-md p-2 hover:bg-[var(--surface-hover)]" onClick={() => step(-1)} aria-label="上一段日期"><ChevronLeft size={16}/></button><button className="rounded-md px-3 py-1.5 text-sm hover:bg-[var(--surface-hover)]" onClick={() => setCursor(startOfDay(new Date()))}>今天</button><button className="rounded-md p-2 hover:bg-[var(--surface-hover)]" onClick={() => step(1)} aria-label="下一段日期"><ChevronRight size={16}/></button><h1 className="ml-2 truncate text-sm font-semibold">{title}</h1></div><div className="flex items-center gap-1"><button type="button" disabled={isSyncing} onClick={sync} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-60"><RefreshCw size={14} className={isSyncing ? "animate-spin" : ""}/>{isSyncing ? "对齐中…" : "对齐"}</button><div className="flex rounded-md bg-[var(--surface-hover)] p-0.5">{(["day", "week", "month"] as const).map((item) => <button key={item} onClick={() => setView(item)} aria-pressed={view === item} className={`rounded px-2.5 py-1 text-xs ${view === item ? "bg-white text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>{item === "day" ? "日" : item === "week" ? "周" : "月"}</button>)}</div><button onClick={() => setFilterOpen((value) => !value)} aria-pressed={filterOpen || selectedCategories.size > 0} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-[var(--surface-hover)] ${selectedCategories.size ? "text-[var(--accent)]" : "text-zinc-600"}`}><Filter size={14}/>{selectedCategories.size || "分类"}</button><button onClick={() => setSettingsOpen(true)} className="rounded-md p-2 text-zinc-500 hover:bg-[var(--surface-hover)]" aria-label="日历设置"><Settings2 size={15}/></button><button onClick={calendarAssistant.toggle} aria-pressed={calendarAssistant.isOpen} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--surface-hover)]"><Bot size={14}/>AI</button><button onClick={() => openCreate()} className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white"><Plus size={14}/>新建</button></div>{filterOpen ? <div className="absolute right-24 top-[calc(100%+4px)] z-50 w-64 rounded-md border bg-white p-2 shadow-sm"><div className="mb-1 flex items-center justify-between px-2 py-1"><p className="text-xs font-medium">按 Outlook 分类筛选</p>{selectedCategories.size ? <button onClick={() => setSelectedCategories(new Set())} className="text-[10px] text-[var(--accent)]">清除</button> : null}</div><div className="max-h-72 overflow-auto">{categories.map((category) => { const visual = resolveCalendarEventVisual([category.display_name], categories); const selected = selectedCategories.has(category.display_name); return <button key={category.id} onClick={() => toggleCategory(category.display_name)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-50"><span className="size-2 rounded-full" style={{ background: visual.dot }}/><span className="min-w-0 flex-1 truncate">{category.display_name}</span>{selected ? <Check size={13} className="text-[var(--accent)]"/> : null}</button>; })}{!categories.length ? <p className="px-2 py-4 text-center text-xs text-zinc-500">尚未同步分类</p> : null}</div></div> : null}</div>
    {!scopeReady ? <button type="button" onClick={() => setSettingsOpen(true)} className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-left text-xs text-amber-900">Outlook 分类需要重新授权。日程仍可使用，现有分类不会被覆盖。点击处理。</button> : null}
    <p role="status" aria-live="polite" className={`min-h-6 border-b px-4 py-1 text-xs ${syncState.tone === "error" ? "bg-red-50 text-red-700" : syncState.tone === "success" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}>{syncState.message || `时区：${timezone} · 点击空白时间快速新建 · 点击日程在右侧编辑`}</p>
    {view === "month" ? <div className="workspace-scroll min-h-0 flex-1 overflow-auto"><div className="grid h-full min-w-[680px] grid-cols-7 grid-rows-[auto_repeat(6,minmax(92px,1fr))]">{weekDays.map((day) => <div key={day} className="sticky top-0 z-20 border-b bg-white px-2 py-2 text-center text-xs text-[var(--text-secondary)]">周{day}</div>)}{dates.map((date) => { const key = keyOf(date); const daySegments = segmentsByDate.get(key) ?? []; const dayEvents = Array.from(new Map(daySegments.map((segment) => [segment.event.id, segment.event])).values()); const weekend = date.getDay() === 0 || date.getDay() === 6; const openDay = () => { setCursor(date); setView("day"); }; return <div role="button" tabIndex={0} key={key} onClick={openDay} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openDay(); }} className={`min-h-0 border-b border-r p-1.5 text-left align-top outline-none hover:bg-zinc-50/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${date.getMonth() !== cursor.getMonth() ? "bg-[var(--surface-app)] text-[var(--text-tertiary)]" : weekend ? "bg-zinc-50/40" : ""}`}><span className={`mb-1 flex size-6 items-center justify-center text-xs ${key === today ? "rounded-full bg-[var(--accent)] text-white" : ""}`}>{date.getDate()}</span><span className="block space-y-0.5 overflow-hidden">{dayEvents.slice(0, 4).map((event) => <MonthEventButton key={event.id} event={event} timezone={timezone} categories={categories} onOpen={() => openEvent(event)} />)}{dayEvents.length > 4 ? <span className="block px-1 text-[10px] text-[var(--text-secondary)]">+{dayEvents.length - 4} 项</span> : null}</span></div>; })}</div></div> : <TimeGrid dates={dates} segmentsByDate={segmentsByDate} today={today} timezone={timezone} categories={categories} view={view} now={now} onOpen={openEvent} onCreate={openCreate} />}
  </div><CalendarInspector open={calendarInspectorOpen} event={selectedEvent} draft={draft} timezone={timezone} categories={categories} categoriesEnabled={scopeReady} onClose={closeInspector}/><AISidecar open={calendarAssistant.isOpen} onClose={calendarAssistant.close} context="Calendar"><CalendarAssistant timezone={timezone} categories={categories}/></AISidecar><Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[88dvh] overflow-y-auto bg-white p-6 sm:max-w-xl"><div className="border-b pb-4"><h2 className="text-lg font-semibold">日历分类</h2><p className="mt-1 text-sm text-zinc-500">与 Outlook Master Categories 双向保持一致。</p></div><CalendarCategoryManager categories={categories} scopeReady={scopeReady} events={normalizedEvents} referenceTime={now.getTime()}/></DialogContent></Dialog></section>;
}
