"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TimelineZoom = "fit" | "normal" | "detailed";

export function RoadmapToolbar({ zoom, onZoomChange, onToday, hideCompleted, onHideCompleted, selectedTrack, onTrackChange, tracks, onNewMilestone, onNewTrack }: {
  zoom: TimelineZoom;
  onZoomChange: (value: TimelineZoom) => void;
  onToday: () => void;
  hideCompleted: boolean;
  onHideCompleted: (value: boolean) => void;
  selectedTrack: string;
  onTrackChange: (value: string) => void;
  tracks: { id: string; name: string }[];
  onNewMilestone: () => void;
  onNewTrack: () => void;
}) {
  const values: TimelineZoom[] = ["fit", "normal", "detailed"];
  const index = values.indexOf(zoom);
  const label = { fit: "适应规划期", normal: "标准", detailed: "详细" }[zoom];
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={onToday}><RotateCcw />今天</Button><div className="flex items-center rounded-md border bg-white"><Button variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => onZoomChange(values[index - 1])} aria-label="缩小时间轴"><Minus /></Button><span className="min-w-16 text-center text-xs text-zinc-600">{label}</span><Button variant="ghost" size="icon-xs" disabled={index === values.length - 1} onClick={() => onZoomChange(values[index + 1])} aria-label="放大时间轴"><Plus /></Button></div><label className="flex items-center gap-1.5 text-xs text-zinc-500"><input type="checkbox" checked={hideCompleted} onChange={(event) => onHideCompleted(event.target.checked)} />隐藏已完成</label><select aria-label="筛选路线" value={selectedTrack} onChange={(event) => onTrackChange(event.target.value)} className="h-7 rounded-md border bg-white px-2 text-xs"><option value="">所有路线</option>{tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={onNewTrack}>+ 路线</Button><Button size="sm" onClick={onNewMilestone}>+ 节点</Button></div></div>;
}
