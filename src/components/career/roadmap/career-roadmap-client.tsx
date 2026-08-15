"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getCareerMilestoneTemporalState } from "@/features/career/milestone-temporal";
import {
  addDays,
  dateDiffDays,
  dateToX,
  getDurationLabelPosition,
  getTimelineDomain,
  getVisibleItemGeometry,
  isDuration,
  monthCount,
  packTimelineItems,
  timelineMonths,
  trackRangeGeometry,
  xToDate,
} from "@/features/career/roadmap-utils";
import { reorderCareerTracks, updateCareerMilestone } from "@/features/career/actions";
import { MilestoneDrawer, type RoadmapMilestone, type RoadmapTrack, TrackDrawer } from "./roadmap-drawers";
import { RoadmapToolbar, type TimelineZoom } from "./roadmap-toolbar";

type Direction = { id: string; name: string };
type Drag = { item: RoadmapMilestone; mode: "move" | "start" | "end"; grabDate: string; trackId: string; startsOn: string | null; targetDate: string };
type TimelineViewport = { left: number; right: number };
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
  const [timelineViewport, setTimelineViewport] = useState<TimelineViewport>({ left: 0, right: 0 });
  const [, startTransition] = useTransition();
  const monthWidth = monthWidths[zoom];
  const months = useMemo(() => timelineMonths(domain), [domain]);
  const timelineWidth = months.length * monthWidth;
  const visibleTracks = tracks.filter((track) => !selectedTrack || track.id === selectedTrack);
  const todayX = dateToX(todayDate, domain, monthWidth);
  const horizonX = dateToX(planningHorizon, domain, monthWidth);

  const updateTimelineViewport = useCallback(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const left = Math.max(0, viewport.scrollLeft - 200);
    setTimelineViewport({ left, right: Math.min(timelineWidth, left + viewport.clientWidth) });
  }, [timelineWidth]);

  const scrollToToday = () => {
    const viewport = scrollRef.current;
    if (viewport) {
      viewport.scrollTo({ left: Math.max(0, todayX + 200 - viewport.clientWidth * 0.2), behavior: "smooth" });
      window.requestAnimationFrame(updateTimelineViewport);
    }
  };

  useEffect(() => {
    const viewport = scrollRef.current;
    if (viewport) {
      viewport.scrollTo({ left: Math.max(0, todayX + 200 - viewport.clientWidth * 0.2) });
      window.requestAnimationFrame(updateTimelineViewport);
    }
  }, [monthWidth, todayX, updateTimelineViewport]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(updateTimelineViewport);
    observer.observe(viewport);
    updateTimelineViewport();
    return () => observer.disconnect();
  }, [updateTimelineViewport]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const viewport = scrollRef.current;
      const canvas = document.querySelector<HTMLElement>("[data-timeline-canvas]");
      if (!viewport || !canvas) return;
      const pointerDate = xToDate(event.clientX - canvas.getBoundingClientRect().left, domain, monthWidth);
      const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-track-id]")?.dataset.trackId;
      setDrag((current) => {
        if (!current) return current;
        let startsOn = current.startsOn;
        let targetDate = current.targetDate;
        if (current.mode === "move") {
          const shift = dateDiffDays(current.grabDate, pointerDate);
          startsOn = current.item.starts_on ? addDays(current.item.starts_on, shift) : null;
          targetDate = addDays(current.item.target_date, shift);
        } else if (current.mode === "start") {
          startsOn = pointerDate <= current.targetDate ? pointerDate : current.targetDate;
        } else {
          targetDate = pointerDate >= (current.startsOn ?? pointerDate) ? pointerDate : (current.startsOn ?? pointerDate);
        }
        return { ...current, trackId: lane || current.trackId, startsOn, targetDate };
      });
      const rect = viewport.getBoundingClientRect();
      if (event.clientX > rect.right - 44) viewport.scrollLeft += 18;
      if (event.clientX < rect.left + 44) viewport.scrollLeft -= 18;
    };
    const onUp = () => {
      setDrag((current) => {
        if (current && (current.trackId !== current.item.track_id || current.startsOn !== current.item.starts_on || current.targetDate !== current.item.target_date)) {
          const data = milestoneFormData({ ...current.item, track_id: current.trackId, starts_on: current.startsOn, target_date: current.targetDate });
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
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-5"><div><h1 className="text-3xl font-semibold tracking-tight">职业路线</h1><p className="mt-1 text-sm text-zinc-500">节点可设为精确时间点，也可设为持续时间段；历史日期不会被自动移到今天。</p></div><p className="font-mono text-xs text-zinc-400">{monthCount(domain)} 个月可编辑视图</p></header>
    <RoadmapToolbar zoom={zoom} onZoomChange={setZoom} onToday={scrollToToday} hideCompleted={hideCompleted} onHideCompleted={setHideCompleted} selectedTrack={selectedTrack} onTrackChange={setSelectedTrack} tracks={tracks} onNewMilestone={() => tracks[0] ? setSelectedMilestone(newMilestone(tracks[0].id, todayDate)) : setEditingTrack({ name: "", description: null, status: "active", color: "blue", start_date: null, end_date: null })} onNewTrack={() => setEditingTrack({ name: "", description: null, status: "active", color: "blue", start_date: null, end_date: null })} />
    {tracks.length ? <div ref={scrollRef} onScroll={updateTimelineViewport} className="max-h-[calc(100dvh-13rem)] overflow-auto border-y bg-white"><div className="min-w-[760px]" style={{ width: timelineWidth + 200 }}><div className="sticky top-0 z-30 flex border-b bg-white"><div className="md:sticky md:left-0 md:z-40 w-[200px] shrink-0 border-r bg-[#F7F7F5] px-4 py-3 text-xs font-medium text-zinc-500">路线 / 阶段</div><div className="relative h-14" style={{ width: timelineWidth }}>{months.map((month, index) => { const monthKey = month.toISOString().slice(0, 7); return <div key={month.toISOString()} className={`absolute top-0 h-full border-l ${month.getUTCMonth() === 0 || month.getUTCMonth() % 3 === 0 ? "border-zinc-300" : "border-zinc-100"} ${monthKey === todayDate.slice(0, 7) ? "bg-[#EDF3F6]/55" : ""}`} style={{ left: index * monthWidth, width: monthWidth }}><p className="px-2 pt-2 font-mono text-[10px] text-zinc-400">{month.getUTCMonth() === 0 || index === 0 ? `${month.getUTCFullYear()} · ` : ""}{String(month.getUTCMonth() + 1).padStart(2, "0")}</p></div>; })}<span className="pointer-events-none absolute top-8 z-10 border-l border-dashed border-amber-600/70 pl-1 text-[9px] text-amber-700" style={{ left: horizonX }}>规划期</span></div></div>
      {visibleTracks.map((track) => <TimelineLane key={track.id} track={track} items={milestones.filter((item) => item.track_id === track.id && (!hideCompleted || item.status !== "completed"))} domain={domain} monthWidth={monthWidth} timelineWidth={timelineWidth} timelineViewport={timelineViewport} todayDate={todayDate} todayX={todayX} horizonX={horizonX} drag={drag} onDrag={setDrag} onOpenMilestone={setSelectedMilestone} onOpenTrack={setEditingTrack} onCreate={(date) => setSelectedMilestone(newMilestone(track.id, date))} onTrackDragStart={() => setDraggedTrack(track.id)} onTrackDrop={() => { if (draggedTrack) reorder(draggedTrack, track.id); setDraggedTrack(null); }} />)}</div></div> : <div className="py-24 text-center"><p className="text-zinc-500">先创建一条路线，再把重要阶段和节点放到时间轴上。</p><Button className="mt-4" onClick={() => setEditingTrack({ name: "", description: null, status: "active", color: "blue", start_date: null, end_date: null })}>+ 路线</Button></div>}
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
  data.set("starts_on", item.starts_on ?? "");
  data.set("target_date", item.target_date);
  data.set("status", item.status);
  data.set("importance", item.importance);
  return data;
}

function TimelineLane({ track, items, domain, monthWidth, timelineWidth, timelineViewport, todayDate, todayX, horizonX, drag, onDrag, onOpenMilestone, onOpenTrack, onCreate, onTrackDragStart, onTrackDrop }: { track: RoadmapTrack; items: RoadmapMilestone[]; domain: ReturnType<typeof getTimelineDomain>; monthWidth: number; timelineWidth: number; timelineViewport: TimelineViewport; todayDate: string; todayX: number; horizonX: number; drag: Drag | null; onDrag: (value: Drag) => void; onOpenMilestone: (item: RoadmapMilestone) => void; onOpenTrack: (item: RoadmapTrack) => void; onCreate: (date: string) => void; onTrackDragStart: () => void; onTrackDrop: () => void }) {
  const rows = useMemo(() => packTimelineItems(items), [items]);
  const laneHeight = Math.max(82, rows.length * 54 + 34);
  const range = trackRangeGeometry(track, domain, monthWidth);
  return <div className="group flex border-b last:border-b-0" style={{ minHeight: laneHeight }}><div draggable onDragStart={onTrackDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onTrackDrop} className="md:sticky md:left-0 md:z-20 flex w-[200px] shrink-0 cursor-grab items-start gap-2 border-r bg-[#F7F7F5] px-3 py-4 active:cursor-grabbing"><span className="mt-0.5 h-8 w-[3px] shrink-0 rounded" style={{ backgroundColor: accent[track.color] }} /><button onClick={() => onOpenTrack(track)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-medium text-zinc-900">{track.name}</p>{track.start_date && track.end_date ? <p className="mt-1 truncate font-mono text-[10px] text-zinc-400">{track.start_date} — {track.end_date}</p> : track.description ? <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{track.description}</p> : null}</button><Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" onClick={() => onCreate(todayDate)} aria-label={`在 ${track.name} 新建节点`}><Plus /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" aria-label={`管理 ${track.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onOpenTrack(track)}>路线设置</DropdownMenuItem><DropdownMenuItem onSelect={() => onCreate(todayDate)}>新建节点</DropdownMenuItem></DropdownMenuContent></DropdownMenu><GripVertical className="mt-1 size-3.5 text-zinc-300" /></div><div data-track-id={track.id} data-timeline-canvas onDoubleClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onCreate(xToDate(event.clientX - rect.left, domain, monthWidth)); }} className="relative cursor-crosshair overflow-hidden" style={{ width: timelineWidth, minHeight: laneHeight, backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${monthWidth - 1}px, #f1efeb ${monthWidth - 1}px, #f1efeb ${monthWidth}px)` }}><span className="pointer-events-none absolute inset-y-0 z-0 border-l border-dashed border-[#365F78]/60" style={{ left: todayX }} /><span className="pointer-events-none absolute inset-y-0 z-0 border-l border-dashed border-amber-600/60" style={{ left: horizonX }} />{range ? <span className="pointer-events-none absolute top-3 h-1.5 rounded-full" title={`${track.name}：${track.start_date} — ${track.end_date}`} style={{ left: range.left, width: range.width, backgroundColor: `${accent[track.color]}35` }} /> : null}{rows.flatMap((row, rowIndex) => row.map((item) => <TimelineMilestone key={item.id} item={item} track={track} row={rowIndex} domain={domain} monthWidth={monthWidth} timelineViewport={timelineViewport} todayDate={todayDate} drag={drag?.item.id === item.id ? drag : null} onDrag={onDrag} onOpen={() => onOpenMilestone(item)} />))}</div></div>;
}

function TimelineMilestone({ item, track, row, domain, monthWidth, timelineViewport, todayDate, drag, onDrag, onOpen }: { item: RoadmapMilestone; track: RoadmapTrack; row: number; domain: ReturnType<typeof getTimelineDomain>; monthWidth: number; timelineViewport: TimelineViewport; todayDate: string; drag: Drag | null; onDrag: (value: Drag) => void; onOpen: () => void }) {
  const startsOn = drag?.startsOn ?? item.starts_on;
  const targetDate = drag?.targetDate ?? item.target_date;
  const duration = isDuration({ starts_on: startsOn, target_date: targetDate });
  const left = dateToX(startsOn ?? targetDate, domain, monthWidth);
  const temporalState = getCareerMilestoneTemporalState({ ...item, target_date: targetDate }, todayDate);
  const completed = item.status === "completed";
  const resolved = completed || item.status === "skipped";
  const meta = temporalState === "past_unresolved" ? "状态待确认" : temporalState === "today" ? "今天" : targetDate.slice(5);
  const begin = (event: React.PointerEvent, mode: Drag["mode"]) => {
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.closest<HTMLElement>("[data-timeline-canvas]");
    if (!canvas) return;
    const grabDate = xToDate(event.clientX - canvas.getBoundingClientRect().left, domain, monthWidth);
    onDrag({ item, mode, grabDate, trackId: item.track_id, startsOn: item.starts_on, targetDate: item.target_date });
  };
  if (!duration) return <button onPointerDown={(event) => begin(event, "move")} onClick={onOpen} title={`${item.title} · ${targetDate}\n${temporalState === "past_unresolved" ? "历史计划日期，状态待确认" : item.status}${item.description ? `\n${item.description}` : ""}`} className={`absolute z-10 grid max-w-48 cursor-grab grid-cols-[10px_minmax(0,1fr)] items-start gap-x-1.5 text-left text-xs active:cursor-grabbing ${resolved ? "opacity-50" : ""}`} style={{ left, top: row * 54 + 28, color: accent[track.color] }}><span className={`mt-1 size-2 rotate-45 border ${temporalState === "today" ? "ring-2 ring-[#365F78]/20" : ""}`} style={{ borderColor: accent[track.color], backgroundColor: completed ? accent[track.color] : "white" }} /><span className="min-w-0"><span className={`flex items-center gap-1 font-medium text-zinc-700 ${item.status === "skipped" ? "line-through" : ""}`}><span className="truncate">{item.title}</span>{completed ? <Check className="size-3 shrink-0" /> : null}</span><span className={`mt-0.5 block font-mono text-[9px] ${temporalState === "past_unresolved" ? "text-zinc-500" : "text-zinc-400"}`}>{meta}</span></span></button>;

  const width = Math.max(38, dateToX(targetDate, domain, monthWidth) - left + 5);
  const viewportStart = xToDate(timelineViewport.left, domain, monthWidth);
  const viewportEnd = xToDate(timelineViewport.right, domain, monthWidth);
  const visible = getVisibleItemGeometry({ itemStart: startsOn!, itemEnd: targetDate, viewportStart, viewportEnd });
  const label = getDurationLabelPosition({ barLeft: left, barRight: left + width, viewportLeft: timelineViewport.left, viewportRight: timelineViewport.right, padding: visible.clippedLeft ? 18 : 8 });
  const continuation = `${visible.clippedLeft ? "\n← 从当前视图之前开始" : ""}${visible.clippedRight ? "\n→ 延续到当前视图之后" : ""}`;

  return <div onPointerDown={(event) => begin(event, "move")} onClick={onOpen} title={`${item.title}\n${startsOn} — ${targetDate}\n${item.status}${continuation}${item.description ? `\n${item.description}` : ""}`} className={`absolute z-10 h-9 cursor-grab rounded-md border text-xs active:cursor-grabbing ${resolved ? "opacity-50" : ""}`} style={{ left, top: row * 54 + 23, width, borderColor: accent[track.color], backgroundColor: `${accent[track.color]}14`, color: accent[track.color] }}>
    <span aria-label="调整开始日期" onPointerDown={(event) => begin(event, "start")} className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize rounded-l-md hover:bg-black/5" />
    {visible.clippedLeft ? <span aria-hidden className="pointer-events-none absolute top-0 z-10 leading-9" style={{ left: Math.max(3, label.left - 12) }}>←</span> : null}
    {label.intersectsViewport && label.maxWidth > 22 ? <span className="pointer-events-none absolute top-0 z-10 flex h-9 min-w-0 items-center gap-1.5" style={{ left: label.left, maxWidth: Math.max(0, label.maxWidth - (visible.clippedRight ? 14 : 0)) }}><span className={`truncate font-medium text-zinc-700 ${item.status === "skipped" ? "line-through" : ""}`}>{item.title}</span>{completed ? <Check className="size-3 shrink-0" /> : null}</span> : null}
    {visible.clippedRight ? <span aria-hidden className="pointer-events-none absolute top-0 z-10 leading-9" style={{ left: Math.max(0, Math.min(width - 13, timelineViewport.right - left - 11)) }}>→</span> : null}
    <span aria-label="调整结束日期" onPointerDown={(event) => begin(event, "end")} className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize rounded-r-md hover:bg-black/5" />
  </div>;
}
