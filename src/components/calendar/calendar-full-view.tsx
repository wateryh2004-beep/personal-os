"use client";

import FullCalendar from "@fullcalendar/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import type { EventDropArg } from "@fullcalendar/core";
import type { CalendarEventRecord } from "@/features/calendar/types";
import { allDayDateToFullCalendarDate, fullCalendarDateToInstant, instantToDate, instantToFullCalendarDate, wallNowAsUtcDate } from "@/features/calendar/timezone";
import { resolveCalendarEventVisual } from "@/features/calendar/categories/visual";
import type { CalendarCategory } from "@/features/calendar/categories/types";
import styles from "./calendar-native.module.css";

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

  const nowFn = useCallback(() => wallNowAsUtcDate(timezone), [timezone]);

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
  });

  const eventContent = useCallback((info: { event: { title: string; extendedProps: { event: CalendarEventRecord; visual: { dot: string } } }; timeText: string; view: { type: CalendarView } }) => {
    const visual = info.event.extendedProps.visual;
    if (info.view.type === "dayGridMonth") {
      return (
        <div className="flex min-w-0 items-center gap-1.5 px-1 py-0.5 text-[10.5px] leading-4">
          <span className="size-[5px] shrink-0 rounded-full" style={{ backgroundColor: visual.dot }} />
          <span className="truncate font-medium text-[var(--text-primary)]">{info.event.title}</span>
        </div>
      );
    }
    const event = info.event.extendedProps.event;
    const durationMinutes = (Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 60_000;
    if (durationMinutes <= 30) {
      return (
        <div className="fc-short-event group relative h-full overflow-visible">
          <p className="flex h-full items-center truncate px-1.5 text-[10.5px] font-medium">{info.event.title}</p>
          <div className="pointer-events-none absolute left-0 top-full z-50 hidden whitespace-nowrap rounded-[7px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,.96)] px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,.08)] backdrop-blur-md group-hover:block">
            <p className="text-xs font-medium text-[var(--text-primary)]">{info.event.title}</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{info.timeText}</p>
          </div>
        </div>
      );
    }
    const location = event.location_name;
    return (
      <div className="h-full overflow-hidden px-1.5 py-1 text-[11px] leading-[1.25]">
        <p className="line-clamp-2 font-medium tracking-[-0.01em]">{info.event.title}</p>
        <p className="mt-0.5 text-[9.5px] opacity-65">{info.timeText}</p>
        {durationMinutes >= 60 && location ? <p className="mt-0.5 line-clamp-1 text-[9.5px] opacity-55">{location}</p> : null}
      </div>
    );
  }, []);

  return (
    <div className={styles.canvas}>
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
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
        dayMaxEvents={4}
        longPressDelay={450}
        selectLongPressDelay={450}
        eventLongPressDelay={450}
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
