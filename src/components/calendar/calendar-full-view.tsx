"use client";

import FullCalendar from "@fullcalendar/react";
import { useCallback, useEffect, useRef, useState } from "react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import type { EventDropArg } from "@fullcalendar/core";
import type { CalendarEventRecord } from "@/features/calendar/types";

type CalendarView = "timeGridWeek" | "timeGridDay" | "dayGridMonth";
type Range = { start: Date; end: Date };
const rangeKey = ({ start, end }: Range) => `${start.toISOString()}:${end.toISOString()}`;

export function CalendarFullView({ events, timezone, initialView, initialDate, onOpen, onCreate, onMove }: { events: CalendarEventRecord[]; timezone: string; initialView: CalendarView; initialDate: Date; onOpen: (event: CalendarEventRecord) => void; onCreate: (range: { startsAt: string; endsAt: string }) => void; onMove: (event: CalendarEventRecord, range: { startsAt: string; endsAt: string; isAllDay: boolean }) => Promise<void> }) {
  const calendarRef = useRef<FullCalendar>(null);
  const cacheRef = useRef(new Map<string, CalendarEventRecord[]>());
  const pendingRef = useRef(new Map<string, Promise<CalendarEventRecord[] | null>>());
  const [visibleEvents, setVisibleEvents] = useState(events);
  const [loadingRange, setLoadingRange] = useState(false);

  // Change FullCalendar through its API. This deliberately replaces the old
  // key-based remount: a view/date switch keeps one calendar DOM instance.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (api.view.type !== initialView) api.changeView(initialView);
    if (api.getDate().toDateString() !== initialDate.toDateString()) api.gotoDate(initialDate);
  }, [initialDate, initialView]);

  const fetchRange = useCallback(async (range: Range) => {
    const key = rangeKey(range);
    const cached = cacheRef.current.get(key);
    if (cached) { setVisibleEvents(cached); return; }
    const existing = pendingRef.current.get(key);
    if (existing) { const data = await existing; if (data) setVisibleEvents(data); return; }
    setLoadingRange(true);
    const request = (async () => {
      try {
        const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
        const response = await fetch(`/api/calendar/events?${params}`);
        const body = await response.json() as { events?: CalendarEventRecord[] };
        if (!response.ok) return null;
        const data = body.events ?? [];
        cacheRef.current.set(key, data);
        return data;
      } catch { return null; } finally { pendingRef.current.delete(key); }
    })();
    pendingRef.current.set(key, request);
    const data = await request;
    if (data) setVisibleEvents(data);
    setLoadingRange(false);
  }, []);

  const onDatesSet = useCallback((info: { start: Date; end: Date }) => {
    void fetchRange({ start: info.start, end: info.end });
  }, [fetchRange]);
  const persistMove = (info: EventDropArg | EventResizeDoneArg) => { void (async () => {
    const start = info.event.start; const end = info.event.end;
    if (!start || !end) { info.revert(); return; }
    try { await onMove(info.event.extendedProps.event as CalendarEventRecord, { startsAt: start.toISOString(), endsAt: end.toISOString(), isAllDay: info.event.allDay }); }
    catch { info.revert(); }
  })(); };
  const calendarEvents = visibleEvents.map((event) => ({ id: event.id, title: event.subject, start: event.starts_at, end: event.ends_at, allDay: event.is_all_day, extendedProps: { event } }));

  return <div className="relative min-h-0 flex-1 overflow-hidden"><FullCalendar ref={calendarRef} plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]} initialView={initialView} initialDate={initialDate} timeZone={timezone} headerToolbar={false} height="100%" allDaySlot selectable editable slotDuration="00:30:00" snapDuration="00:15:00" slotLabelInterval="01:00" scrollTime="08:00:00" scrollTimeReset={false} datesSet={onDatesSet} events={calendarEvents} eventClick={(info) => onOpen(info.event.extendedProps.event as CalendarEventRecord)} eventDrop={persistMove} eventResize={persistMove} select={(info) => onCreate({ startsAt: info.start.toISOString(), endsAt: info.end.toISOString() })} eventContent={(info) => <div className="h-full overflow-hidden border-l-[3px] border-[var(--accent)] px-1.5 py-0.5 text-xs"><p className="line-clamp-2 font-medium">{info.event.title}</p><p className="text-[10px] opacity-70">{info.timeText}</p></div>} />{loadingRange ? <span className="pointer-events-none absolute right-3 top-3 rounded bg-white/90 px-2 py-1 text-[11px] text-[var(--text-tertiary)] shadow">更新日程…</span> : null}</div>;
}
