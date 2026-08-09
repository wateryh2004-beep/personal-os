"use client";

import type { CSSProperties, MouseEvent } from "react";
import { ArrowDown, ArrowUp, Circle } from "lucide-react";
import type { CalendarCategory } from "@/features/calendar/categories/types";
import { resolveCalendarEventVisual } from "@/features/calendar/categories/visual";
import type { TimedEventLayout } from "@/features/calendar/view-utils";

export type CalendarEventRecord = {
  id: string;
  provider_event_id: string;
  subject: string;
  body_text: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  location_name: string | null;
  categories: string[];
  importance: "low" | "normal" | "high";
  show_as: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
  last_synced_at: string;
};

const timeLabel = (value: string, timezone: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

export function CalendarEventCard({ layout, timezone, categories, hourHeight, visibleStartHour, onOpen }: { layout: TimedEventLayout<CalendarEventRecord>; timezone: string; categories: CalendarCategory[]; hourHeight: number; visibleStartHour: number; onOpen: () => void }) {
  const { event } = layout;
  const visual = resolveCalendarEventVisual(event.categories, categories);
  const height = Math.max(24, ((layout.endMinutes - layout.startMinutes) / 60) * hourHeight);
  const showTime = height >= 32;
  const dense = layout.laneCount >= 3;
  const showLocation = height >= 56 && layout.width >= 48;
  const gutter = dense ? 2 : 5;
  const style: CSSProperties = {
    top: ((layout.startMinutes - visibleStartHour * 60) / 60) * hourHeight,
    height,
    left: `calc(${layout.left}% + ${gutter / 2}px)`,
    width: `calc(${layout.width}% - ${gutter}px)`,
    background: visual.background,
    borderLeftColor: visual.border,
    color: visual.foreground,
    zIndex: 10,
  };
  const open = (click: MouseEvent<HTMLButtonElement>) => { click.stopPropagation(); onOpen(); };
  return <button type="button" onClick={open} onDoubleClick={(event) => event.stopPropagation()} title={`${event.subject || "无标题日程"}\n${timeLabel(event.starts_at, timezone)} — ${timeLabel(event.ends_at, timezone)}${event.location_name ? `\n${event.location_name}` : ""}`} className={`group/event absolute overflow-hidden rounded-md border border-l-[3px] border-y-black/5 border-r-black/5 py-1 text-left text-xs outline-none transition-[filter] hover:z-50 hover:brightness-[0.98] focus-visible:z-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 ${dense ? "px-1" : "px-2"}`} style={style} aria-label={`${event.subject || "无标题日程"}，${timeLabel(event.starts_at, timezone)} 到 ${timeLabel(event.ends_at, timezone)}`}>
    <span className="flex min-w-0 items-center gap-1 font-medium leading-4"><span className="truncate">{event.subject || "无标题日程"}</span>{event.importance === "high" ? <Circle className="size-1.5 shrink-0 fill-current" aria-label="高重要性" /> : null}</span>
    {showTime ? <span className="mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] opacity-80">{layout.continuesBefore || layout.clippedBefore ? <ArrowUp className="size-2.5 shrink-0" aria-hidden="true" /> : null}{dense ? timeLabel(event.starts_at, timezone) : `${timeLabel(event.starts_at, timezone)} — ${timeLabel(event.ends_at, timezone)}`}{layout.continuesAfter || layout.clippedAfter ? <ArrowDown className="size-2.5 shrink-0" aria-hidden="true" /> : null}</span> : null}
    {showLocation && event.location_name ? <span className="mt-0.5 block truncate text-[10px] opacity-75">{event.location_name}</span> : null}
  </button>;
}

export function MonthEventButton({ event, timezone, categories, onOpen }: { event: CalendarEventRecord; timezone: string; categories: CalendarCategory[]; onOpen: () => void }) {
  const visual = resolveCalendarEventVisual(event.categories, categories);
  return <button type="button" onClick={(click) => { click.stopPropagation(); onOpen(); }} className="flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-black/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><span className="size-1.5 shrink-0 rounded-full" style={{ background: visual.dot }} /><span className="shrink-0 font-mono text-[9px] text-zinc-500">{event.is_all_day ? "全天" : timeLabel(event.starts_at, timezone)}</span><span className="truncate text-zinc-700">{event.subject || "无标题日程"}</span></button>;
}
