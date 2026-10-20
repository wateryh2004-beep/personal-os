"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { emptyTargetFilters, filterTargets, targetDetailHref, targetFilters, targetLibraryHref, targetStatusLabels, type TargetFilters } from "@/features/career/target-library";
import { getCareerPreparationCounts, type CareerTarget, type CareerPreparation } from "@/features/career/next-actions";
const field = "ui-field min-h-11 w-full min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-control)] px-3 text-base";
export function TargetLibrary({ targets, preparations, now, timezone, unavailable }: { targets: CareerTarget[]; preparations: CareerPreparation[]; now: number; timezone: string; unavailable: boolean }) {
  const filters = targetFilters(useSearchParams());
  const rows = filterTargets(targets, filters);
  const filtered = Boolean(filters.target_q.trim() || filters.target_status !== "all");
  const change = (patch: Partial<TargetFilters>) => window.history.replaceState(null, "", targetLibraryHref({...filters,...patch}));
  return <section id="target-library" aria-labelledby="target-library-heading" className="mb-10 min-w-0 scroll-mt-24 border-t border-[var(--separator)] pt-7">
    <h2 id="target-library-heading" className="mb-2 text-lg font-medium">全部面试准备情境</h2><p className="mb-5 text-[13px] leading-6 text-[var(--text-secondary)]">历史、模拟与未来岗位准备都保留在此；出现于题库不表示正在招聘或已投递。</p>
    <div className="grid gap-4 rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:grid-cols-[minmax(0,1fr)_180px] sm:p-6">
      <label className="grid min-w-0 gap-2 text-sm">搜索情境<input type="search" value={filters.target_q} onChange={event=>change({target_q:event.target.value})} placeholder="组织、岗位或显示名称" className={field}/></label>
      <label className="grid min-w-0 gap-2 text-sm">准备状态<select aria-label="岗位状态" value={filters.target_status} onChange={event=>change({target_status:event.target.value})} className={field}><option value="all">全部准备状态</option>{filters.target_status !== "all" && !Object.hasOwn(targetStatusLabels,filters.target_status) ? <option value={filters.target_status}>当前状态：{filters.target_status}</option> : null}{Object.entries(targetStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 py-4"><p role="status" className="text-sm text-[var(--text-secondary)]">{rows.length} 个准备情境{unavailable ? "（已读取）" : ""}{filtered ? "，已应用搜索或筛选" : ""}</p>{filtered ? <Button variant="ghost" onClick={()=>change(emptyTargetFilters)}>清除情境筛选</Button> : null}</div>
    <ul className="divide-y divide-[var(--separator)]">{rows.map(target=>{ const prep = preparations.filter(p=>p.context_id===target.id); const counts = getCareerPreparationCounts(prep,now); return <li key={target.id}><Link prefetch={false} href={targetDetailHref(target.id,filters)} className="ui-record-link grid min-w-0 gap-3 rounded-xl py-5 pl-3 pr-9 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0"><h3 className="break-words text-base font-medium leading-7 [overflow-wrap:anywhere]">{target.role_title_snapshot || target.title}</h3>{target.organization_snapshot ? <p className="mt-1 break-words text-sm leading-7 text-[var(--text-secondary)]">{target.organization_snapshot}</p>:null}<p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]"><span>{targetStatusLabels[target.status] ?? target.status}</span><span>{counts.ready}/{prep.length} 已准备</span>{counts.due ? <span>{counts.due} 到期练习</span>:null}{counts.unscheduled ? <span>{counts.unscheduled} 待安排练习</span>:null}</p></div>
      <p className="text-sm leading-7 tabular-nums text-[var(--text-secondary)]">{target.next_interview_at ? <time dateTime={target.next_interview_at}>{new Date(target.next_interview_at).toLocaleString("zh-CN",{timeZone:timezone,dateStyle:"medium",timeStyle:"short"})}</time>:"未安排面试时间"}</p>
    </Link></li>;})}</ul>
    {!rows.length ? <p className="py-8 text-sm leading-7 text-[var(--text-secondary)]">{unavailable ? "面试情境未完整读取，请刷新后核对。" : filtered ? "没有匹配的准备情境，请修改筛选。" : "还没有面试情境；可以创建一条模拟练习。"}</p>:null}
  </section>;
}
