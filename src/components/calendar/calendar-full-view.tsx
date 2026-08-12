"use client";

import FullCalendar from "@fullcalendar/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import type { EventDropArg } from "@fullcalendar/core";
import type { CalendarEventRecord } from "@/features/calendar/types";
import { allDayDateToFullCalendarDate, fullCalendarDateToInstant, instantToDate, instantToFullCalendarDate } from "@/features/calendar/timezone";
import { resolveCalendarEventVisual } from "@/features/calendar/categories/visual";
import type { CalendarCategory } from "@/features/calendar/categories/types";

type CalendarView = "timeGridWeek" | "timeGridDay" | "dayGridMonth";
type Range = { start: Date; end: Date };

export function CalendarFullView({ events, categories, timezone, initialView, initialDate, onOpen, onCreate, onMove, onRangeChange, loadingRange }: {
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
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const visualInitialDate = useMemo(() => instantToFullCalendarDate(initialDate.toISOString(), timezone), [initialDate, timezone]);

  // One stable FullCalendar instance; all date equality is UTC-field based
  // because the component intentionally uses UTC-coerced wall-time Dates.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (api.view.type !== initialView) api.changeView(initialView);
    if (api.getDate().getTime() !== visualInitialDate.getTime()) api.gotoDate(visualInitialDate);
  }, [initialView, visualInitialDate]);

  const persistMove = (info: EventDropArg | EventResizeDoneArg) => { void (async () => {
    const start = info.event.start;
    const end = info.event.end;
    if (!start || !end) { info.revert(); return; }
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

  const calendarEvents = events.map((event) => {
    const visual = resolveCalendarEventVisual(event.categories, categories);
    return {
      id: event.id,
      title: event.subject,
      start: event.is_all_day ? allDayDateToFullCalendarDate(instantToDate(event.starts_at, timezone)) : instantToFullCalendarDate(event.starts_at, timezone),
      end: event.is_all_day ? allDayDateToFullCalendarDate(instantToDate(event.ends_at, timezone)) : instantToFullCalendarDate(event.ends_at, timezone),
      allDay: event.is_all_day,
      backgroundColor: visual.background,
      borderColor: visual.border,
      textColor: visual.foreground,
      extendedProps: { event, visual },
    };
  });

  const eventContent = useCallback((info: { event: { title: string; extendedProps: { event: CalendarEventRecord; visual: { dot: string } } }; timeText: string; view: { type: CalendarView } }) => {
    if (info.view.type === "dayGridMonth") return <div className="flex min-w-0 items-center gap-1 px-1 py-0.5 text-[11px]"><span className="size-1.5 shrink-0 rounded-full" style={{ background: info.event.extendedProps.visual.dot }} /><span className="truncate font-medium">{info.event.title}</span></div>;
    const event = info.event.extendedProps.event;
    const durationMinutes = (Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 60_000;
    if (durationMinutes <= 30) return <div className="h-full overflow-hidden px-1.5 py-0.5 text-xs leading-4"><p className="truncate font-medium">{info.event.title}</p></div>;
    const location = event.location_name;
    return <div className="h-full overflow-hidden px-1.5 py-0.5 text-xs leading-4"><p className="line-clamp-2 font-medium">{info.event.title}</p><p className="text-[10px] opacity-70">{info.timeText}</p>{durationMinutes >= 60 && location ? <p className="line-clamp-1 text-[10px] opacity-60">{location}</p> : null}</div>;
  }, []);

  return <div className="calendar-canvas relative min-h-0 flex-1 overflow-hidden"><FullCalendar ref={calendarRef} plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]} initialView={initialView} initialDate={visualInitialDate} timeZone="UTC" locale="zh-cn" headerToolbar={false} height="100%" allDaySlot selectable editable slotDuration="00:30:00" snapDuration="00:15:00" slotLabelInterval="01:00" slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false, meridiem: false }} eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false, meridiem: false }} scrollTime="07:30:00" scrollTimeReset={false} slotMinTime="06:00:00" slotMaxTime="23:00:00" nowIndicator eventMaxStack={1} moreLinkClick="popover" moreLinkContent={(info) => <span className="calendar-more-events">另有 {info.num} 项日程</span>} datesSet={(info) => onRangeChange({ start: info.start, end: info.end })} events={calendarEvents} eventClick={(info) => onOpen(info.event.extendedProps.event as CalendarEventRecord)} eventDrop={persistMove} eventResize={persistMove} select={(info) => onCreate({ startsAt: fullCalendarDateToInstant(info.start, timezone), endsAt: fullCalendarDateToInstant(info.end, timezone), isAllDay: info.allDay })} eventContent={eventContent} />{loadingRange ? <span className="pointer-events-none absolute right-3 top-3 rounded bg-white/90 px-2 py-1 text-[11px] text-[var(--text-tertiary)] shadow">更新日程…</span> : null}</div>;
}
