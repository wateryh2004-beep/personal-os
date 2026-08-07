import { CareerNav } from "@/components/career/career-nav";
import { Field, PrimaryButton, SelectField, TextField } from "@/components/career/form-controls";
import { createCareerMilestone, createCareerTrack } from "@/features/career/actions";
import { getCareerRoadmap } from "@/features/career/queries";
import { timelineCardRange, timelineDateLabel } from "@/features/career/roadmap-utils";

const months = Array.from({ length: 17 }, (_, index) => new Date(2026, 7 + index, 1));
const trackColors: Record<string, string> = {
  blue: "border-[#365F78] bg-[#EDF3F6] text-[#294B60]",
  slate: "border-slate-600 bg-slate-100 text-slate-800",
  amber: "border-amber-600 bg-amber-50 text-amber-900",
  violet: "border-violet-600 bg-violet-50 text-violet-900",
  teal: "border-teal-600 bg-teal-50 text-teal-900",
};

const trackStatuses = [{ value: "active", label: "进行中" }, { value: "paused", label: "已暂停" }];
const trackColorsOptions = [{ value: "blue", label: "深蓝" }, { value: "slate", label: "石墨灰" }, { value: "amber", label: "琥珀" }, { value: "violet", label: "紫罗兰" }, { value: "teal", label: "青绿" }];
const milestoneStatuses = [{ value: "planned", label: "计划中" }, { value: "in_progress", label: "进行中" }, { value: "completed", label: "已完成" }, { value: "skipped", label: "已跳过" }];
const importanceOptions = [{ value: "high", label: "高" }, { value: "normal", label: "普通" }, { value: "low", label: "低" }];

export default async function CareerRoadmapPage() {
  const { tracks, milestones, directions, unavailable } = await getCareerRoadmap();
  return <>
    <CareerNav current="/career/roadmap" />
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[#e7e5e4] pb-5">
      <div><h1 className="text-3xl font-semibold tracking-tight">职业路线</h1><p className="mt-1 text-sm text-zinc-500">把未来的重要阶段放在并行时间线上，持续推进到 2027 年末。</p></div>
      <p className="font-mono text-xs text-zinc-400">2026.08 — 2027.12</p>
    </header>
    {unavailable ? <p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-800">职业路线数据库尚未升级。应用 migration 后即可使用。</p> : <>
      <section className="overflow-x-auto border border-[#e7e5e4] bg-white">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[210px_1fr] border-b border-[#e7e5e4]">
            <div className="px-5 py-3 text-xs font-medium tracking-wide text-zinc-500">路线</div>
            <div className="grid grid-cols-[repeat(17,minmax(0,1fr))]">{months.map((month) => <div key={month.toISOString()} className="border-l border-[#f0eeea] py-3 text-center font-mono text-[10px] text-zinc-500">{month.getFullYear() % 100}.{String(month.getMonth() + 1).padStart(2, "0")}</div>)}</div>
          </div>
          {tracks.length ? tracks.map((track) => {
            const items = milestones.filter((item) => item.track_id === track.id);
            return <div key={track.id} className="grid min-h-32 grid-cols-[210px_1fr] border-b border-[#eceae6] last:border-b-0">
              <div className="border-r border-[#eceae6] px-5 py-5"><p className="text-sm font-semibold text-zinc-900">{track.name}</p>{track.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{track.description}</p> : <p className="mt-1 text-xs text-zinc-400">尚未添加说明</p>}</div>
              <div className="relative overflow-hidden bg-[linear-gradient(to_right,#f1efeb_1px,transparent_1px)] bg-[size:5.882%_100%]">
                {items.length ? items.map((item, index) => {
                  const range = timelineCardRange(item);
                  const dateLabel = timelineDateLabel(item);
                  const details = `${item.title} · ${item.starts_on ?? item.target_date} 至 ${item.target_date}${item.description ? `\n${item.description}` : ""}`;
                  const top = `${18 + (index % 2) * 58}px`;
                  if (range.isPoint) return <div key={item.id} className="absolute z-10 h-[78px] border-l-2 border-[#365F78]" style={{ left: `${range.left}%`, top }} aria-label={`${item.title}，${dateLabel}${item.description ? `，${item.description}` : ""}`}><div title={details} className={`absolute top-0 w-40 rounded-sm border-l-4 px-2.5 py-2 shadow-sm ${range.left > 82 ? "right-2" : "left-2"} ${trackColors[track.color] ?? trackColors.blue}`}><p className="line-clamp-2 break-words text-xs font-semibold leading-4">{item.title}</p><p className="mt-1 whitespace-nowrap font-mono text-[10px] opacity-75">{dateLabel}</p>{item.description ? <p className="mt-1 line-clamp-1 text-[10px] leading-4 opacity-70">{item.description}</p> : null}</div></div>;
                  return <div key={item.id} title={details} aria-label={`${item.title}，${dateLabel}${item.description ? `，${item.description}` : ""}`} className={`absolute rounded-sm border-l-4 px-2.5 py-2 shadow-sm ${trackColors[track.color] ?? trackColors.blue}`} style={{ left: `${range.left}%`, width: `${range.width}%`, top }}><p className="line-clamp-2 break-words text-xs font-semibold leading-4">{item.title}</p><p className="mt-1 whitespace-nowrap font-mono text-[10px] opacity-75">{dateLabel}</p>{item.description ? <p className="mt-1 line-clamp-1 text-[10px] leading-4 opacity-70">{item.description}</p> : null}</div>;
                }) : <p className="px-5 py-11 text-xs text-zinc-400">这条路线还没有关键节点。</p>}
              </div>
            </div>;
          }) : <p className="px-4 py-14 text-center text-sm text-zinc-500">先创建一条路线，再把关键节点排到时间轴上。</p>}
        </div>
      </section>
      <section className="mt-8 grid gap-8 border-t border-[#e7e5e4] pt-8 lg:grid-cols-2">
        <form action={createCareerTrack} className="grid gap-3"><h2 className="font-semibold">新建路线</h2><Field label="路线名称" name="name" required placeholder="例如：金融投研与产业资本" /><TextField label="说明（可选）" name="description" /><div className="grid grid-cols-2 gap-3"><SelectField label="状态" name="status" values={trackStatuses} defaultValue="active" /><SelectField label="颜色" name="color" values={trackColorsOptions} defaultValue="blue" /></div><input type="hidden" name="start_date" value="" /><input type="hidden" name="end_date" value="" /><div><PrimaryButton>创建路线</PrimaryButton></div></form>
        <form action={createCareerMilestone} className="grid gap-3"><h2 className="font-semibold">添加关键节点</h2>{tracks.length ? <><label className="grid gap-1 text-sm"><span>所属路线</span><select name="track_id" className="border bg-white px-3 py-2">{tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label><Field label="节点名称" name="title" required placeholder="例如：完成论文完整初稿" /><TextField label="说明（可选）" name="description" /><div className="grid grid-cols-2 gap-3"><Field label="开始日期（可选）" name="starts_on" type="date" /><Field label="目标日期" name="target_date" type="date" required /></div><div className="grid grid-cols-2 gap-3"><SelectField label="状态" name="status" values={milestoneStatuses} defaultValue="planned" /><SelectField label="重要程度" name="importance" values={importanceOptions} defaultValue="normal" /></div><label className="grid gap-1 text-sm"><span>关联职业方向（可选）</span><select name="career_direction_id" className="border bg-white px-3 py-2 text-sm"><option value="">不关联</option>{directions.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select></label><div><PrimaryButton>添加节点</PrimaryButton></div></> : <p className="text-sm text-zinc-500">先创建至少一条路线。</p>}</form>
      </section>
    </>}
  </>;
}
