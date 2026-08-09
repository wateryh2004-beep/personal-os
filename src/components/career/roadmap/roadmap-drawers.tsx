"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { archiveCareerMilestone, archiveCareerTrack, createCareerMilestone, createCareerTrack, duplicateCareerMilestone, updateCareerMilestone, updateCareerTrack } from "@/features/career/actions";

export type RoadmapTrack = { id: string; name: string; description: string | null; status: "active" | "paused" | "archived"; color: "blue" | "slate" | "amber" | "violet" | "teal"; start_date: string | null; end_date: string | null; position: number };
export type RoadmapMilestone = { id: string; track_id: string; career_direction_id: string | null; title: string; description: string | null; starts_on: string | null; target_date: string; status: "planned" | "in_progress" | "completed" | "skipped"; importance: "low" | "normal" | "high" };
type RoadmapMilestoneInput = RoadmapMilestone | Omit<RoadmapMilestone, "id">;
type Direction = { id: string; name: string };

const trackStatuses = [["active", "进行中"], ["paused", "已暂停"]] as const;
const milestoneStatuses = [["planned", "计划中"], ["in_progress", "进行中"], ["completed", "已完成"], ["skipped", "已跳过"]] as const;

function submit(router: ReturnType<typeof useRouter>, action: (data: FormData) => Promise<void>, close: () => void) {
  return async (data: FormData) => { await action(data); close(); router.refresh(); };
}

export function MilestoneDrawer({ milestone, tracks, directions, onClose }: { milestone: RoadmapMilestoneInput | null; tracks: RoadmapTrack[]; directions: Direction[]; onClose: () => void }) {
  const existing = milestone && "id" in milestone;
  const formKey = milestone ? `${existing ? milestone.id : "new"}:${milestone.starts_on ?? "point"}:${milestone.target_date}` : "empty";
  return <Dialog open={Boolean(milestone)} onOpenChange={(open) => !open && onClose()}><DialogContent className="left-auto right-0 top-0 h-dvh max-w-md translate-x-0 translate-y-0 rounded-none p-5"><DialogHeader><DialogTitle>{existing ? "编辑节点" : "新建节点"}</DialogTitle><DialogDescription>可按内容选择时间点或时间段；路线日期仍表示更高层的职业阶段。</DialogDescription></DialogHeader>{milestone ? <MilestoneForm key={formKey} milestone={milestone} tracks={tracks} directions={directions} onClose={onClose} /> : null}</DialogContent></Dialog>;
}

function MilestoneForm({ milestone, tracks, directions, onClose }: { milestone: RoadmapMilestoneInput; tracks: RoadmapTrack[]; directions: Direction[]; onClose: () => void }) {
  const router = useRouter();
  const existing = "id" in milestone;
  const [timeMode, setTimeMode] = useState<"point" | "range">(milestone.starts_on ? "range" : "point");
  const [startsOn, setStartsOn] = useState(milestone.starts_on ?? milestone.target_date);
  const [targetDate, setTargetDate] = useState(milestone.target_date);

  return <form action={submit(router, existing ? updateCareerMilestone : createCareerMilestone, onClose)} className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-1">
    <input type="hidden" name="milestone_id" value={existing ? milestone.id : ""} />
    <input type="hidden" name="starts_on" value={timeMode === "range" ? startsOn : ""} />
    <label className="grid gap-1 text-sm">名称<input name="title" required maxLength={240} defaultValue={milestone.title} className="h-8 rounded-md border bg-white px-2" /></label>
    <label className="grid gap-1 text-sm">说明<textarea name="description" defaultValue={milestone.description ?? ""} className="min-h-20 rounded-md border bg-white px-2 py-1.5" /></label>
    <label className="grid gap-1 text-sm">所属路线<select name="track_id" defaultValue={milestone.track_id} className="h-8 rounded-md border bg-white px-2">{tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
    <fieldset className="grid gap-2">
      <legend className="text-sm">时间呈现</legend>
      <div className="grid grid-cols-2 rounded-md bg-zinc-100 p-1" aria-label="时间呈现方式">
        <button type="button" aria-pressed={timeMode === "point"} onClick={() => setTimeMode("point")} className={`h-8 rounded text-sm transition-colors ${timeMode === "point" ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}>时间点</button>
        <button type="button" aria-pressed={timeMode === "range"} onClick={() => setTimeMode("range")} className={`h-8 rounded text-sm transition-colors ${timeMode === "range" ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}>时间段</button>
      </div>
    </fieldset>
    {timeMode === "point" ? <label className="grid gap-1 text-sm">日期<input name="target_date" type="date" required value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="h-8 rounded-md border bg-white px-2" /></label> : <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">开始日期<input type="date" required value={startsOn} max={targetDate} onChange={(event) => setStartsOn(event.target.value)} className="h-8 rounded-md border bg-white px-2" /></label><label className="grid gap-1 text-sm">结束日期<input name="target_date" type="date" required value={targetDate} min={startsOn} onChange={(event) => setTargetDate(event.target.value)} className="h-8 rounded-md border bg-white px-2" /></label></div>}
    <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">状态<select name="status" defaultValue={milestone.status} className="h-8 rounded-md border bg-white px-2">{milestoneStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid gap-1 text-sm">重要程度<select name="importance" defaultValue={milestone.importance} className="h-8 rounded-md border bg-white px-2"><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label></div>
    <label className="grid gap-1 text-sm">关联职业方向<select name="career_direction_id" defaultValue={milestone.career_direction_id ?? ""} className="h-8 rounded-md border bg-white px-2"><option value="">不关联</option>{directions.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select></label>
    <DialogFooter className="mt-2"><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>{existing ? <><button type="button" onClick={() => { const data = new FormData(); data.set("milestone_id", milestone.id); void duplicateCareerMilestone(data).then(() => { onClose(); router.refresh(); }); }} className="text-xs text-zinc-500 hover:text-zinc-900">复制</button><button type="button" onClick={() => { const data = new FormData(); data.set("milestone_id", milestone.id); void archiveCareerMilestone(data).then(() => { onClose(); router.refresh(); }); }} className="text-xs text-red-700 hover:text-red-900">归档</button></> : null}<Button type="submit">保存</Button></DialogFooter>
  </form>;
}

export function TrackDrawer({ track, onClose }: { track: RoadmapTrack | Omit<RoadmapTrack, "id" | "position"> | null; onClose: () => void }) {
  const router = useRouter(); const existing = track && "id" in track;
  return <Dialog open={Boolean(track)} onOpenChange={(open) => !open && onClose()}><DialogContent className="left-auto right-0 top-0 h-dvh max-w-md translate-x-0 translate-y-0 rounded-none p-5"><DialogHeader><DialogTitle>{existing ? "路线设置" : "新建路线"}</DialogTitle><DialogDescription>路线代表一段职业阶段，可以填写开始和结束日期。</DialogDescription></DialogHeader>{track ? <form action={submit(router, existing ? updateCareerTrack : createCareerTrack, onClose)} className="grid content-start gap-4"><input type="hidden" name="track_id" value={existing ? track.id : ""} /><label className="grid gap-1 text-sm">名称<input name="name" required maxLength={120} defaultValue={track.name} className="h-8 rounded-md border bg-white px-2" /></label><label className="grid gap-1 text-sm">说明<textarea name="description" defaultValue={track.description ?? ""} className="min-h-24 rounded-md border bg-white px-2 py-1.5" /></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">阶段开始<input name="start_date" type="date" defaultValue={track.start_date ?? ""} className="h-8 rounded-md border bg-white px-2" /></label><label className="grid gap-1 text-sm">阶段结束<input name="end_date" type="date" defaultValue={track.end_date ?? ""} className="h-8 rounded-md border bg-white px-2" /></label></div><label className="grid gap-1 text-sm">状态<select name="status" defaultValue={track.status} className="h-8 rounded-md border bg-white px-2">{trackStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid gap-1 text-sm">颜色<select name="color" defaultValue={track.color} className="h-8 rounded-md border bg-white px-2"><option value="blue">深蓝</option><option value="slate">石墨灰</option><option value="amber">琥珀</option><option value="violet">紫罗兰</option><option value="teal">青绿</option></select></label><DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>{existing ? <button type="button" onClick={() => { const data = new FormData(); data.set("track_id", track.id); void archiveCareerTrack(data).then(() => { onClose(); router.refresh(); }); }} className="text-xs text-red-700 hover:text-red-900">归档</button> : null}<Button type="submit">保存</Button></DialogFooter></form> : null}</DialogContent></Dialog>;
}
