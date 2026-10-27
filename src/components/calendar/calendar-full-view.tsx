"use client";

import FullCalendar from "@fullcalendar/react";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import type { EventContentArg, EventDropArg } from "@fullcalendar/core";
import type { CalendarEventRecord } from "@/features/calendar/types";
import { allDayDateToFullCalendarDate, fullCalendarDateToInstant, instantToDate, instantToFullCalendarDate, wallNowAsUtcDate } from "@/features/calendar/timezone";
import { resolveCalendarEventVisual } from "@/features/calendar/categories/visual";
import type { CalendarCategory } from "@/features/calendar/categories/types";
import styles from "./calendar-native.module.css";
import { calendarDragPreview, calendarDurationLabel } from "./calendar-drag-preview";
import { observeCalendarGeometry } from "./observe-calendar-geometry";

type CalendarView = "timeGridWeek" | "timeGridDay" | "dayGridMonth";
type Range = { start: Date; end: Date };
const calendarPlugins = [timeGridPlugin, dayGridPlugin, interactionPlugin];
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function readReducedMotion() { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(reducedMotionQuery).matches; }
function subscribeReducedMotion(notify: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const preference = window.matchMedia(reducedMotionQuery);
  preference.addEventListener?.("change", notify);
  return () => preference.removeEventListener?.("change", notify);
}

export function CalendarFullView({ events, categories, timezone, initialView, initialDate, onOpen, onCreate, onMove, onRangeChange, loadingRange, onTaskDrop }: {
  events: CalendarEventRecord[];
  categories: CalendarCategory[];
  timezone: string;
  initialView: CalendarView;
  initialDate: Date;
  onOpen: (event: CalendarEventRecord) => void;
  onCreate: (range: { startsAt: string; endsAt: string; isAllDay: boolean }) => void;
  onMove: (event: CalendarEventRecord, range: { startsAt: string; endsAt: string; isAllDay: boolean }) => Promise<void>;
  onRangeChange: (range: Range) => void;
  loadingRange: boolean;
  onTaskDrop?: (task:{id:string;title:string;modified:string|null;minutes:number|null}, startsAt:string)=>void;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
  const visualInitialDate = useMemo(() => instantToFullCalendarDate(initialDate.toISOString(), timezone), [initialDate, timezone]);

  const nowFn = useCallback(() => wallNowAsUtcDate(timezone), [timezone]);

  useEffect(() => {
    const root = canvasRef.current;
    return root ? observeCalendarGeometry(root, () => calendarRef.current?.getApi().updateSize()) : undefined;
  }, [initialView]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    // Commit a view and its date together so custom event renderers never
    // attach to an intermediate, immediately retired date/view container.
    if (api.view.type !== initialView) api.changeView(initialView, visualInitialDate);
    else if (api.getDate().getTime() !== visualInitialDate.getTime()) api.gotoDate(visualInitialDate);
  }, [initialView, visualInitialDate]);

  const persistMove = (info: EventDropArg | EventResizeDoneArg) => { void (async () => {
    const start = info.event.start;
    const end = info.event.end;
    if (!start || !end) { info.revert(); return; }
    info.revert();
    try {
      await onMove(info.event.extendedProps.event as CalendarEventRecord, {
        startsAt: fullCalendarDateToInstant(start, timezone),
        endsAt: fullCalendarDateToInstant(end, timezone),
        isAllDay: info.event.allDay,
      });
    } catch {
      info.revert();
    }
  })(); };

  // Opening a panel or changing a loading label must not re-project every
  // event or tell FullCalendar that its event source has changed.
  const calendarEvents = useMemo(() => events.map((event) => {
    const visual = resolveCalendarEventVisual(event.categories, categories);
    return {
      id: event.id,
      title: event.subject?.trim() || "未命名",
      start: event.is_all_day ? allDayDateToFullCalendarDate(instantToDate(event.starts_at, timezone)) : instantToFullCalendarDate(event.starts_at, timezone),
      end: event.is_all_day ? allDayDateToFullCalendarDate(instantToDate(event.ends_at, timezone)) : instantToFullCalendarDate(event.ends_at, timezone),
      allDay: event.is_all_day,
      display: "block" as const,
      backgroundColor: visual.background,
      borderColor: visual.border,
      textColor: visual.foreground,
      extendedProps: { event, visual },
    };
  }), [events, categories, timezone]);

  const eventContent = useCallback((info: EventContentArg) => {
    const visual = info.event.extendedProps.visual ?? resolveCalendarEventVisual([], categories);
    if (info.isMirror) {
      const start = info.event.start;
      const end = info.event.end;
      const preview = start && end ? calendarDragPreview(events, {
        startsAt: fullCalendarDateToInstant(start, timezone), endsAt: fullCalendarDateToInstant(end, timezone), eventId: info.event.id,
      }) : null;
      return <div className={styles.dragPreview} data-overlap={Boolean(preview?.overlaps.length)} aria-hidden="true">
        <strong>{info.event.title || "新日程"}</strong>
        <span>{info.timeText}{info.event.allDay ? "全天" : ` · ${calendarDurationLabel(preview?.durationMinutes ?? null)}`}</span>
        {preview?.overlaps.length ? <span className={styles.overlapHint}>已载入日程重叠 {preview.overlaps.length} 项</span> : <span>松开后核对</span>}
      </div>;
    }
    if (info.view.type === "dayGridMonth") {
      return (
        <div className="flex min-w-0 items-center gap-1.5 px-1 py-0.5 text-[12px] leading-[1.4]">
          <span className="size-[5px] shrink-0 rounded-full" style={{ backgroundColor: visual.dot }} />
          <span className="truncate font-medium text-[var(--text-primary)]">{info.event.title}</span>
        </div>
      );
    }
    const event = info.event.extendedProps.event as CalendarEventRecord | undefined;
    if (!event) return <span>{info.event.title || "新日程"}</span>;
    const durationMinutes = (Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 60_000;
    if (durationMinutes <= 30) {
      return (
        <div className="fc-short-event group relative h-full overflow-visible">
          <p className="flex h-full items-center truncate px-1.5 text-[12px] font-medium">{info.event.title}</p>
          <div className="pointer-events-none absolute left-0 top-full z-50 hidden whitespace-nowrap rounded-[7px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,.96)] px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,.08)] backdrop-blur-md group-hover:block">
            <p className="text-xs font-medium text-[var(--text-primary)]">{info.event.title}</p>
            <p className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">{info.timeText}</p>
          </div>
        </div>
      );
    }
    const location = event.location_name;
    return (
      <div className="h-full overflow-hidden px-1.5 py-1 text-[12px] leading-[1.25]">
        <p className="line-clamp-2 font-medium tracking-[-0.01em]">{info.event.title}</p>
        <p className="mt-1 text-[12px] leading-[1.4]">{info.timeText}</p>
        {durationMinutes >= 90 && location ? <p className="mt-1 line-clamp-1 text-[12px] leading-[1.4]">{location}</p> : null}
      </div>
    );
  }, [categories, events, timezone]);

  return (
    <div ref={canvasRef} className={styles.canvas} aria-busy={loadingRange}>
      <FullCalendar
        ref={calendarRef}
        plugins={calendarPlugins}
        initialView={initialView}
        initialDate={visualInitialDate}
        timeZone="UTC"
        now={nowFn}
        locale={zhCnLocale}
        firstDay={1}
        headerToolbar={false}
        height="100%"
        allDaySlot
        selectable
        selectMirror
        editable
        droppable
        drop={(info)=>{const id=info.draggedEl.dataset.calendarTaskId;if(!id||!onTaskDrop)return;onTaskDrop({id,title:info.draggedEl.dataset.calendarTaskTitle??"任务",modified:info.draggedEl.dataset.calendarTaskModified||null,minutes:Number(info.draggedEl.dataset.calendarTaskMinutes)||null},fullCalendarDateToInstant(info.date,timezone));}}
        dayMaxEvents={4}
        longPressDelay={450}
        selectLongPressDelay={450}
        eventLongPressDelay={450}
        eventDragMinDistance={8}
        dragRevertDuration={reducedMotion ? 0 : 180}
        slotDuration="00:30:00"
        snapDuration="00:15:00"
        slotLabelInterval="01:00"
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false, meridiem: false }}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false, meridiem: false }}
        scrollTime="09:00:00"
        scrollTimeReset={false}
        slotMinTime="08:00:00"
        slotMaxTime="23:00:00"
        nowIndicator
        datesSet={(info) => onRangeChange({ start: info.start, end: info.end })}
        events={calendarEvents}
        eventClick={(info) => onOpen(info.event.extendedProps.event as CalendarEventRecord)}
        eventDrop={persistMove}
        eventResize={persistMove}
        select={(info) => onCreate({ startsAt: fullCalendarDateToInstant(info.start, timezone), endsAt: fullCalendarDateToInstant(info.end, timezone), isAllDay: info.allDay })}
        eventContent={eventContent}
      />
      {loadingRange ? <span className={styles.loading}><span className={styles.loadingDot} />更新中</span> : null}
    </div>
  );
}
