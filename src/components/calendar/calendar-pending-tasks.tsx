"use client";
import { useEffect, useRef, useState } from "react";
import { Draggable } from "@fullcalendar/interaction";
import { readPendingCalendarTasks } from "@/features/calendar/actions";
import { Button } from "@/components/ui/button";
export type PendingCalendarTask = Awaited<ReturnType<typeof readPendingCalendarTasks>>["tasks"][number];
export function CalendarPendingTasks({ onSchedule }: { onSchedule: (task: PendingCalendarTask) => void }) {
 const root=useRef<HTMLDivElement>(null); const [tasks,setTasks]=useState<PendingCalendarTask[]>([]);const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let current=true;void readPendingCalendarTasks().then(value=>{if(current){setTasks(value.tasks);setStatus("ready");}}).catch(()=>{if(current)setStatus("error");});return()=>{current=false;};},[attempt]);
 useEffect(()=>{if(!root.current)return;const draggable=new Draggable(root.current,{itemSelector:"[data-calendar-task-id]",eventData:element=>({title:element.dataset.calendarTaskTitle,duration:"00:45",create:false})});return()=>draggable.destroy();},[]);
 return <div ref={root} className="flex max-h-36 shrink-0 flex-wrap items-center gap-2 overflow-auto border-b border-[var(--separator)] px-4 py-2" aria-label="待安排任务" aria-busy={status==="loading"}><p className="text-sm font-medium">待安排</p><p className="text-xs text-[var(--text-tertiary)]">拖到时间格，或点击安排</p>{tasks.map(task=><div key={task.id} className="flex items-center rounded-lg border border-[var(--separator)]"><button type="button" data-calendar-task-id={task.id} data-calendar-task-title={task.title} data-calendar-task-modified={task.provider_last_modified_at??""} className="min-h-11 max-w-44 cursor-grab truncate px-2 text-sm" aria-label={`拖动安排 ${task.title}`}>{task.title}</button><Button size="sm" variant="ghost" onClick={()=>onSchedule(task)}>安排</Button></div>)}{status==="loading"?<p role="status" className="text-sm text-[var(--text-tertiary)]">正在读取待安排任务…</p>:status==="error"?<p role="status">待安排任务暂时无法读取。<button type="button" className="ml-2 underline" onClick={()=>{setStatus("loading");setAttempt(value=>value+1);}}>重试</button></p>:!tasks.length?<p role="status" className="text-sm text-[var(--text-tertiary)]">没有未完成任务</p>:null}</div>;
}
