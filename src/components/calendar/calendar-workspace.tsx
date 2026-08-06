"use client";

import { useMemo, useState } from "react";
import { CalendarCreateForm } from "@/components/calendar/calendar-create-form";
import { CalendarAssistant } from "@/components/calendar/calendar-assistant";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type CalendarEvent = { id: string; subject: string; starts_at: string; ends_at: string; is_all_day: boolean; location_name: string | null };
type CalendarView = "day" | "week" | "month";

const weekDays = ["一", "二", "三", "四", "五", "六", "日"];
const pad = (value: number) => String(value).padStart(2, "0");
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, amount: number) => { const value = new Date(date); value.setDate(value.getDate() + amount); return value; };
const startOfWeek = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7));
const startOfMonthGrid = (date: Date) => startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
const timeLabel = (value: string) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
const dateLabel = (value: Date) => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(value);

function EventChip({ event }: { event: CalendarEvent }) {
  return <div title={`${event.subject || "无标题日程"}${event.location_name ? ` · ${event.location_name}` : ""}`} className="truncate border-l-2 border-[#365F78] bg-[#EDF3F6] px-1.5 py-1 text-xs leading-4 text-[#24495e]"><span className="mr-1 font-mono text-[10px]">{event.is_all_day ? "全天" : timeLabel(event.starts_at)}</span>{event.subject || "无标题日程"}</div>;
}

export function CalendarWorkspace({ events }: { events: CalendarEvent[] }) {
  const [view, setView] = useState<CalendarView>("week");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) { const key = keyOf(new Date(event.starts_at)); map.set(key, [...(map.get(key) ?? []), event]); }
    return map;
  }, [events]);
  const dates = view === "month" ? Array.from({ length: 42 }, (_, index) => addDays(startOfMonthGrid(cursor), index)) : view === "week" ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)) : [cursor];
  const step = (amount: number) => setCursor((current) => view === "month" ? new Date(current.getFullYear(), current.getMonth() + amount, 1) : addDays(current, amount * (view === "week" ? 7 : 1)));
  const title = view === "month" ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(cursor) : view === "week" ? `${dateLabel(dates[0])} — ${dateLabel(dates[6])}` : dateLabel(cursor);
  const today = keyOf(new Date());
  return <section className="mt-6 flex h-[calc(100dvh-195px)] min-h-[500px] flex-col overflow-hidden border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div className="flex items-center gap-2"><button className="border px-2 py-1 text-sm" onClick={() => step(-1)} aria-label="上一段日期">←</button><button className="border px-2 py-1 text-sm" onClick={() => setCursor(startOfDay(new Date()))}>今天</button><button className="border px-2 py-1 text-sm" onClick={() => step(1)} aria-label="下一段日期">→</button><h2 className="ml-2 text-sm font-medium">{title}</h2></div><div className="flex items-center gap-2"><div className="flex border"><button onClick={() => setView("day")} className={`px-2 py-1 text-xs ${view === "day" ? "bg-[#EDF3F6] text-[#365F78]" : "text-zinc-500"}`}>日</button><button onClick={() => setView("week")} className={`border-l px-2 py-1 text-xs ${view === "week" ? "bg-[#EDF3F6] text-[#365F78]" : "text-zinc-500"}`}>周</button><button onClick={() => setView("month")} className={`border-l px-2 py-1 text-xs ${view === "month" ? "bg-[#EDF3F6] text-[#365F78]" : "text-zinc-500"}`}>月</button></div><button onClick={() => setAssistantOpen(true)} className="hidden border px-2 py-1 text-xs text-[#365F78] sm:block">AI 助手</button><button onClick={() => setCreateOpen(true)} className="bg-[#365F78] px-3 py-1.5 text-xs text-white">新建日程</button></div></div><div className="min-h-0 flex-1 overflow-auto">{view === "month" ? <div className="grid h-full min-w-[620px] grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))]">{weekDays.map((day) => <div key={day} className="border-b px-2 py-2 text-center text-xs text-zinc-500">周{day}</div>)}{dates.map((date) => { const key = keyOf(date); const dayEvents = eventsByDate.get(key) ?? []; return <div key={key} className={`min-h-0 border-b border-r p-1.5 ${date.getMonth() !== cursor.getMonth() ? "bg-[#F7F7F5] text-zinc-400" : ""}`}><div className={`mb-1 flex h-5 w-5 items-center justify-center text-xs ${key === today ? "rounded-full bg-[#365F78] text-white" : ""}`}>{date.getDate()}</div><div className="space-y-1 overflow-hidden">{dayEvents.slice(0, 2).map((event) => <EventChip key={event.id} event={event} />)}{dayEvents.length > 2 ? <p className="px-1 text-[10px] text-zinc-500">+{dayEvents.length - 2} 项</p> : null}</div></div>; })}</div> : view === "week" ? <div className="grid h-full min-w-[720px] grid-cols-7">{dates.map((date) => { const key = keyOf(date); const dayEvents = eventsByDate.get(key) ?? []; return <div key={key} className="min-h-0 border-r last:border-r-0"><div className={`border-b px-3 py-2 text-xs ${key === today ? "bg-[#EDF3F6] text-[#365F78]" : "text-zinc-500"}`}>周{weekDays[(date.getDay() + 6) % 7]} <span className="ml-1 font-mono">{date.getMonth() + 1}/{date.getDate()}</span></div><div className="h-[calc(100%-37px)] space-y-2 overflow-y-auto p-2">{dayEvents.map((event) => <EventChip key={event.id} event={event} />)}{!dayEvents.length ? <p className="pt-3 text-center text-xs text-zinc-300">—</p> : null}</div></div>; })}</div> : <div className="mx-auto h-full max-w-3xl overflow-y-auto p-5"><div className="border-b pb-3 text-sm font-medium">{dateLabel(cursor)}</div><div className="mt-3 space-y-2">{(eventsByDate.get(keyOf(cursor)) ?? []).map((event) => <div key={event.id} className="border-l-2 border-[#365F78] bg-[#EDF3F6] px-3 py-2"><p className="text-sm font-medium">{event.subject || "无标题日程"}</p><p className="mt-1 text-xs text-zinc-600">{event.is_all_day ? "全天" : `${timeLabel(event.starts_at)} — ${timeLabel(event.ends_at)}`}{event.location_name ? ` · ${event.location_name}` : ""}</p></div>)}{!(eventsByDate.get(keyOf(cursor)) ?? []).length ? <p className="py-12 text-center text-sm text-zinc-500">这一天没有日程。</p> : null}</div></div>}</div><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto bg-white p-6 sm:max-w-lg"><div className="border-b pb-4"><h2 className="text-lg font-semibold tracking-tight">新建 Outlook 日程</h2><p className="mt-1 text-sm text-zinc-500">创建后会直接写入 Outlook。</p></div><CalendarCreateForm /></DialogContent></Dialog><Dialog open={assistantOpen} onOpenChange={setAssistantOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto bg-white p-6 sm:max-w-2xl"><CalendarAssistant /></DialogContent></Dialog></section>;
}
