"use client";
import FullCalendar from "@fullcalendar/react";
import { useEffect, useRef, useState } from "react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import type { EventDropArg } from "@fullcalendar/core";
import type { CalendarEventRecord } from "@/features/calendar/types";

export function CalendarFullView({ events, timezone, initialView, initialDate, onOpen, onCreate, onMove }: { events: CalendarEventRecord[]; timezone: string; initialView: "timeGridWeek" | "timeGridDay" | "dayGridMonth"; initialDate: Date; onOpen: (event: CalendarEventRecord) => void; onCreate: (range: { startsAt: string; endsAt: string }) => void; onMove: (event: CalendarEventRecord, range: { startsAt: string; endsAt: string; isAllDay: boolean }) => Promise<void> }) {
  const [visibleEvents, setVisibleEvents] = useState(events); const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const loadRange = async (start: Date, end: Date) => { abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller; try { const params = new URLSearchParams({ start:start.toISOString(), end:end.toISOString() }); const response = await fetch(`/api/calendar/events?${params}`, { signal:controller.signal }); const body = await response.json() as { events?: CalendarEventRecord[] }; if (!response.ok || controller.signal.aborted) return; setVisibleEvents(body.events ?? []); } catch { /* Existing events remain visible on a transient range fetch failure. */ } };
  const persistMove = (info: EventDropArg | EventResizeDoneArg) => { void (async () => {
    const start = info.event.start; const end = info.event.end;
    if (!start || !end) { info.revert(); return; }
    try { await onMove(info.event.extendedProps.event as CalendarEventRecord, { startsAt: start.toISOString(), endsAt: end.toISOString(), isAllDay: info.event.allDay }); }
    catch { info.revert(); }
  })(); };
  return <div className="min-h-0 flex-1 overflow-hidden"><FullCalendar plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]} initialView={initialView} initialDate={initialDate} timeZone={timezone} headerToolbar={false} height="100%" allDaySlot selectable editable slotDuration="00:30:00" snapDuration="00:15:00" slotLabelInterval="01:00" scrollTime="08:00:00" scrollTimeReset={false} datesSet={(info) => void loadRange(info.start, info.end)} events={visibleEvents.map((event) => ({ id:event.id, title:event.subject, start:event.starts_at, end:event.ends_at, allDay:event.is_all_day, extendedProps:{event} }))} eventClick={(info) => onOpen(info.event.extendedProps.event as CalendarEventRecord)} eventDrop={persistMove} eventResize={persistMove} select={(info) => onCreate({ startsAt: info.start.toISOString(), endsAt: info.end.toISOString() })} eventContent={(info) => <div className="h-full overflow-hidden border-l-[3px] border-[var(--accent)] px-1.5 py-0.5 text-xs"><p className="line-clamp-2 font-medium">{info.event.title}</p><p className="text-[10px] opacity-70">{info.timeText}</p></div>} /> </div>;
}
