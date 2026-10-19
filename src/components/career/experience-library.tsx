"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { careerLabel } from "@/features/career/labels";
import { experienceTypes } from "@/features/career/experience-types";
import { emptyExperienceFilters, experienceDates, experienceFilters, experienceLibraryHref, experienceQuery, filterExperiences, type ExperienceFilters, type ExperienceRow } from "@/features/career/experience-library";
import { Button } from "@/components/ui/button";
import { ExperienceReadNotice } from "./experience-read-notice";

const controlClass = "ui-field min-h-11 w-full min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-control)] px-3 text-base";
const periods = { current: "进行中", past: "非进行中" };
const statuses = { draft: "草稿", confirmed: "已确认" };

export function ExperienceLibrary({ rows, unavailable }: { rows: ExperienceRow[]; unavailable: boolean }) {
  const filters = experienceFilters(useSearchParams());
  const visible = filterExperiences(rows, filters);
  const filtered = Boolean(filters.q.trim() || filters.type !== "all" || filters.period !== "all" || filters.status !== "all");
  // Pass fresh state: Next's native-history integration ignores its own internal markers.
  const change = (patch: Partial<ExperienceFilters>) => window.history.replaceState(null, "", experienceLibraryHref({ ...filters, ...patch }));
  return <section aria-label="经历浏览" className="min-w-0">
    <ExperienceReadNotice unavailable={unavailable} />
    <div className="rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6">
      <label className="grid gap-2 text-sm font-medium">搜索经历<input type="search" value={filters.q} onChange={event => change({ q: event.target.value })} placeholder="组织、角色、部门、地点或类别" className={controlClass} /></label>
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-3">
        <label className="grid min-w-0 gap-2 text-sm">经历类别<select aria-label="经历类别" value={filters.type} onChange={event => change({ type: event.target.value })} className={controlClass}><option value="all">全部类别</option>{filters.type !== "all" && !experienceTypes.some(value => value === filters.type) ? <option value={filters.type}>当前类别：{filters.type}</option> : null}{experienceTypes.map(value => <option key={value} value={value}>{careerLabel(value)}</option>)}</select></label>
        <label className="grid min-w-0 gap-2 text-sm">进行情况<select aria-label="进行情况" value={filters.period} onChange={event => change({ period: event.target.value })} className={controlClass}><option value="all">全部经历</option>{filters.period !== "all" && !Object.hasOwn(periods, filters.period) ? <option value={filters.period}>当前条件：{filters.period}</option> : null}{Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="grid min-w-0 gap-2 text-sm">确认状态<select aria-label="确认状态" value={filters.status} onChange={event => change({ status: event.target.value })} className={controlClass}><option value="all">全部状态</option>{filters.status !== "all" && !Object.hasOwn(statuses, filters.status) ? <option value={filters.status}>当前状态：{filters.status}</option> : null}{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 py-4"><p role="status" className="text-sm text-[var(--text-secondary)]">{visible.length} 个结果{unavailable ? "（已读取）" : ""}{filtered ? "，已应用搜索或筛选" : ""}</p>{filtered ? <Button variant="ghost" onClick={() => change(emptyExperienceFilters)}>清除搜索与筛选</Button> : null}</div>
    <ul className="divide-y divide-[var(--separator)]">{visible.map(row => <li key={row.id}><Link prefetch={false} href={`/career/experiences/${encodeURIComponent(row.id)}${experienceQuery(filters)}`} className="ui-record-link grid min-w-0 gap-3 rounded-[var(--radius-md)] py-5 pl-3 pr-9 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0"><h2 className="break-words text-base font-medium leading-7 [overflow-wrap:anywhere]">{row.organization}{row.role ? ` · ${row.role}` : ""}</h2><p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-6 text-[var(--text-secondary)]"><span>{careerLabel(row.experience_type)}</span><span>{row.is_current ? "进行中" : "非进行中"}</span><span>{careerLabel(row.status)}</span>{row.location ? <span>{row.location}</span> : null}</p>{row.department ? <p className="mt-1 break-words text-sm leading-6 text-[var(--text-secondary)]">{row.department}</p> : null}</div>
      <p className="text-sm leading-7 tabular-nums text-[var(--text-secondary)]">{experienceDates(row)}</p>
    </Link></li>)}</ul>
    {!visible.length ? <p className="py-12 text-sm leading-7 text-[var(--text-secondary)]">{unavailable ? "暂未读取到匹配的经历，请重新读取或调整条件。" : rows.length ? "没有匹配的经历，可调整条件或清除筛选。" : "还没有经历，先记录一段真实发生的经历。"}</p> : null}
  </section>;
}
