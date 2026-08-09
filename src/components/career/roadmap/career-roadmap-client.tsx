"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getCareerMilestoneTemporalState } from "@/features/career/milestone-temporal";
import {
  dateToX,
  getTimelineDomain,
  monthCount,
  packMilestonePoints,
  timelineMonths,
  trackRangeGeometry,
  xToDate,
} from "@/features/career/roadmap-utils";
import { reorderCareerTracks, updateCareerMilestone } from "@/features/career/actions";
import { MilestoneDrawer, type RoadmapMilestone, type RoadmapTrack, TrackDrawer } from "./roadmap-drawers";
import { RoadmapToolbar, type TimelineZoom } from "./roadmap-toolbar";

type Direction = { id: string; name: string };
type Drag = { item: RoadmapMilestone; trackId: string; targetDate: string };
const accent: Record<RoadmapTrack["color"], string> = { blue: "#365F78", slate: "#475569", amber: "#b45309", violet: "#7c3aed", teal: "#0f766e" };
const monthWidths: Record<TimelineZoom, number> = { fit: 56, normal: 92, detailed: 144 };
const planningHorizon = "2027-12-01";

function newMilestone(trackId: string, targetDate: string): Omit<RoadmapMilestone, "id"> {
  return { track_id: trackId, career_direction_id: null, title: "", description: null, starts_on: null, target_date: targetDate, status: "planned", importance: "normal" };
}

export function CareerRoadmapClient({ tracks, milestones, directions, todayDate }: { tracks: RoadmapTrack[]; milestones: RoadmapMilestone[]; directions: Direction[]; todayDate: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const domain = useMemo(() => getTimelineDomain(new Date(`${todayDate}T12:00:00Z`), milestones, tracks), [milestones, todayDate, tracks]);
  const [zoom, setZoom] = useState<TimelineZoom>("normal");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState("");
  const [selectedMilestone, setSelectedMilestone] = useState<RoadmapMilestone | Omit<RoadmapMilestone, "id"> | null>(null);
  const [editingTrack, setEditingTrack] = useState<RoadmapTrack | Omit<RoadmapTrack, "id" | "position"> | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draggedTrack, setDraggedTrack] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const monthWidth = monthWidths[zoom];
  const months = useMemo(() => timelineMonths(domain), [domain]);
  const timelineWidth = months.length * monthWidth;
  const visibleTracks = tracks.filter((track) => !selectedTrack || track.id === selectedTrack);
  const todayX = dateToX(todayDate, domain, monthWidth);
  const horizonX = dateToX(planningHorizon, domain, monthWidth);

  const scrollToToday = () => {
    const viewport = scrollRef.current;
    if (viewport) viewport.scrollTo({ left: Math.max(0, todayX + 200 - viewport.clientWidth * 0.2), behavior: "smooth" });
  };

  useEffect(() => {
    const viewport = scrollRef.current;
    if (viewport) viewport.scrollTo({ left: Math.max(0, todayX + 200 - viewport.clientWidth * 0.2) });
  }, [monthWidth, todayX]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const viewport = scrollRef.current;
      const canvas = document.querySelector<HTMLElement>("[data-timeline-canvas]");
      if (!viewport || !canvas) return;
      const targetDate = xToDate(event.clientX - canvas.getBoundingClientRect().left, domain, monthWidth);
      const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-track-id]")?.dataset.trackId;
      setDrag((current) => current ? { ...current, trackId: lane || current.trackId, targetDate } : current);
      const rect = viewport.getBoundingClientRect();
      if (event.clientX > rect.right - 44) viewport.scrollLeft += 18;
      if (event.clientX < rect.left + 44) viewport.scrollLeft -= 18;
    };
    const onUp = () => {
      setDrag((current) => {
        if (current && (current.trackId !== current.item.track_id || current.targetDate !== current.item.target_date || current.item.starts_on)) {
          const data = milestoneFormData({ ...current.item, track_id: current.trackId, starts_on: null, target_date: current.targetDate });
          startTransition(() => { void updateCareerMilestone(data); });
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [domain, drag, monthWidth, startTransition]);

  const reorder = (from: string, to: string) => {
    if (from === to) return;
    const ids = tracks.map((track) => track.id);
    const fromIndex = ids.indexOf(from);
    const toIndex = ids.indexOf(to);
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, from);
    const data = new FormData();
    data.set("track_ids", JSON.stringify(ids));
    startTransition(() => { void reorderCareerTracks(data); });
  };

  return <>
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-5"><div><h1 className="text-3xl font-semibold tracking-tight">职业路线</h1><p className="mt-1 text-sm text-zinc-500">路线显示职业阶段，里程碑固定在计划日期；历史节点不会被自动移到今天。</p></div><p className="font-mono text-xs text-zinc-400">{monthCount(domain)} 个月可编辑视图</p></header>
    <RoadmapToolbar zoom={zoom} onZoomChange={setZoom} onToday={scrollToToday} hideCompleted={hideCompleted} onHideCompleted={setHideCompleted} selectedTrack={selectedTrack} onTrackChange={setSelectedTrack} tracks={tracks} onNewMilestone={() => tracks[0] ? setSelectedMilestone(newMilestone(tracks[0].id, todayDate)) : setEditingTrack({ name: "", description: null, status: "active", color: "blue", start_date: null, end_date: null })} onNewTrack={() => setEditingTrack({ name: "", description: null, status: "active", color: "blue", start_date: null, end_date: null })} />
    {tracks.length ? <div ref={scrollRef} className="max-h-[calc(100dvh-13rem)] overflow-auto border-y bg-white"><div className="min-w-[760px]" style={{ width: timelineWidth + 200 }}><div className="sticky top-0 z-30 flex border-b bg-white"><div className="sticky left-0 z-40 w-[200px] shrink-0 border-r bg-[#F7F7F5] px-4 py-3 text-xs font-medium text-zinc-500">路线 / 阶段</div><div className="relative h-14" style={{ width: timelineWidth }}>{months.map((month, index) => { const monthKey = month.toISOString().slice(0, 7); return <div key={month.toISOString()} className={`absolute top-0 h-full border-l ${month.getUTCMonth() === 0 || month.getUTCMonth() % 3 === 0 ? "border-zinc-300" : "border-zinc-100"} ${monthKey === todayDate.slice(0, 7) ? "bg-[#EDF3F6]/55" : ""}`} style={{ left: index * monthWidth, width: monthWidth }}><p className="px-2 pt-2 font-mono text-[10px] text-zinc-400">{month.getUTCMonth() === 0 || index === 0 ? `${month.getUTCFullYear()} · ` : ""}{String(month.getUTCMonth() + 1).padStart(2, "0")}</p></div>; })}<span className="pointer-events-none absolute top-8 z-10 border-l border-dashed border-amber-600/70 pl-1 text-[9px] text-amber-700" style={{ left: horizonX }}>规划期</span></div></div>
      {visibleTracks.map((track) => <TimelineLane key={track.id} track={track} items={milestones.filter((item) => item.track_id === track.id && (!hideCompleted || item.status !== "completed"))} domain={domain} monthWidth={monthWidth} timelineWidth={timelineWidth} todayDate={todayDate} todayX={todayX} horizonX={horizonX} drag={drag} onDrag={setDrag} onOpenMilestone={setSelectedMilestone} onOpenTrack={setEditingTrack} onCreate={(date) => setSelectedMilestone(newMilestone(track.id, date))} onTrackDragStart={() => setDraggedTrack(track.id)} onTrackDrop={() => { if (draggedTrack) reorder(draggedTrack, track.id); setDraggedTrack(null); }} />)}</div></div> : <div className="py-24 text-center"><p className="text-zinc-500">先创建一条路线，再把重要阶段和节点放到时间轴上。</p><Button className="mt-4" onClick={() => setEditingTrack({ name: "", description: null, status: "active", color: "blue", start_date: null, end_date: null })}>+ 路线</Button></div>}
    <MilestoneDrawer milestone={selectedMilestone} tracks={tracks} directions={directions} onClose={() => setSelectedMilestone(null)} />
    <TrackDrawer track={editingTrack} onClose={() => setEditingTrack(null)} />
  </>;
}

function milestoneFormData(item: RoadmapMilestone) {
  const data = new FormData();
  data.set("milestone_id", item.id);
  data.set("track_id", item.track_id);
  data.set("career_direction_id", item.career_direction_id ?? "");
  data.set("title", item.title);
  data.set("description", item.description ?? "");
  data.set("starts_on", "");
  data.set("target_date", item.target_date);
  data.set("status", item.status);
  data.set("importance", item.importance);
  return data;
}

function TimelineLane({ track, items, domain, monthWidth, timelineWidth, todayDate, todayX, horizonX, drag, onDrag, onOpenMilestone, onOpenTrack, onCreate, onTrackDragStart, onTrackDrop }: { track: RoadmapTrack; items: RoadmapMilestone[]; domain: ReturnType<typeof getTimelineDomain>; monthWidth: number; timelineWidth: number; todayDate: string; todayX: number; horizonX: number; drag: Drag | null; onDrag: (value: Drag) => void; onOpenMilestone: (item: RoadmapMilestone) => void; onOpenTrack: (item: RoadmapTrack) => void; onCreate: (date: string) => void; onTrackDragStart: () => void; onTrackDrop: () => void }) {
  const rows = useMemo(() => packMilestonePoints(items), [items]);
  const laneHeight = Math.max(82, rows.length * 54 + 34);
  const range = trackRangeGeometry(track, domain, monthWidth);
  return <div className="group flex border-b last:border-b-0" style={{ minHeight: laneHeight }}><div draggable onDragStart={onTrackDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onTrackDrop} className="sticky left-0 z-20 flex w-[200px] shrink-0 cursor-grab items-start gap-2 border-r bg-[#F7F7F5] px-3 py-4 active:cursor-grabbing"><span className="mt-0.5 h-8 w-[3px] shrink-0 rounded" style={{ backgroundColor: accent[track.color] }} /><button onClick={() => onOpenTrack(track)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-medium text-zinc-900">{track.name}</p>{track.start_date && track.end_date ? <p className="mt-1 truncate font-mono text-[10px] text-zinc-400">{track.start_date} — {track.end_date}</p> : track.description ? <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{track.description}</p> : null}</button><Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" onClick={() => onCreate(todayDate)} aria-label={`在 ${track.name} 新建节点`}><Plus /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" aria-label={`管理 ${track.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onOpenTrack(track)}>路线设置</DropdownMenuItem><DropdownMenuItem onSelect={() => onCreate(todayDate)}>新建节点</DropdownMenuItem></DropdownMenuContent></DropdownMenu><GripVertical className="mt-1 size-3.5 text-zinc-300" /></div><div data-track-id={track.id} data-timeline-canvas onDoubleClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onCreate(xToDate(event.clientX - rect.left, domain, monthWidth)); }} className="relative cursor-crosshair overflow-hidden" style={{ width: timelineWidth, minHeight: laneHeight, backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${monthWidth - 1}px, #f1efeb ${monthWidth - 1}px, #f1efeb ${monthWidth}px)` }}><span className="pointer-events-none absolute inset-y-0 z-0 border-l border-dashed border-[#365F78]/60" style={{ left: todayX }} /><span className="pointer-events-none absolute inset-y-0 z-0 border-l border-dashed border-amber-600/60" style={{ left: horizonX }} />{range ? <span className="pointer-events-none absolute top-3 h-1.5 rounded-full" title={`${track.name}：${track.start_date} — ${track.end_date}`} style={{ left: range.left, width: range.width, backgroundColor: `${accent[track.color]}35` }} /> : null}{rows.flatMap((row, rowIndex) => row.map((item) => <TimelineMilestone key={item.id} item={item} track={track} row={rowIndex} domain={domain} monthWidth={monthWidth} todayDate={todayDate} drag={drag?.item.id === item.id ? drag : null} onDrag={onDrag} onOpen={() => onOpenMilestone(item)} />))}</div></div>;
}

function TimelineMilestone({ item, track, row, domain, monthWidth, todayDate, drag, onDrag, onOpen }: { item: RoadmapMilestone; track: RoadmapTrack; row: number; domain: ReturnType<typeof getTimelineDomain>; monthWidth: number; todayDate: string; drag: Drag | null; onDrag: (value: Drag) => void; onOpen: () => void }) {
  const targetDate = drag?.targetDate ?? item.target_date;
  const left = dateToX(targetDate, domain, monthWidth);
  const temporalState = getCareerMilestoneTemporalState({ ...item, target_date: targetDate }, todayDate);
  const completed = item.status === "completed";
  const resolved = completed || item.status === "skipped";
  const meta = temporalState === "past_unresolved" ? "状态待确认" : temporalState === "today" ? "今天" : targetDate.slice(5);
  const begin = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onDrag({ item, trackId: item.track_id, targetDate: item.target_date });
  };
  return <button onPointerDown={begin} onClick={onOpen} title={`${item.title} · ${targetDate}\n${temporalState === "past_unresolved" ? "历史计划日期，状态待确认" : item.status}${item.description ? `\n${item.description}` : ""}`} className={`absolute z-10 grid max-w-48 cursor-grab grid-cols-[10px_minmax(0,1fr)] items-start gap-x-1.5 text-left text-xs active:cursor-grabbing ${resolved ? "opacity-50" : ""}`} style={{ left, top: row * 54 + 28, color: accent[track.color] }}><span className={`mt-1 size-2 rotate-45 border ${temporalState === "today" ? "ring-2 ring-[#365F78]/20" : ""}`} style={{ borderColor: accent[track.color], backgroundColor: completed ? accent[track.color] : "white" }} /><span className="min-w-0"><span className={`flex items-center gap-1 font-medium text-zinc-700 ${item.status === "skipped" ? "line-through" : ""}`}><span className="truncate">{item.title}</span>{completed ? <Check className="size-3 shrink-0" /> : null}</span><span className={`mt-0.5 block font-mono text-[9px] ${temporalState === "past_unresolved" ? "text-zinc-500" : "text-zinc-400"}`}>{meta}</span></span></button>;
}
