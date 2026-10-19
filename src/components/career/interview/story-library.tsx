"use client";

import Link from "next/link";
import { useMemo, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { storyStatusLabels } from "@/features/interview/constants";
import { emptyStoryFilters, filterStoryLibrary, storyFilters, storyFilterQuery, storyLibraryHref, type StoryFilters, type StoryLibraryRow } from "@/features/interview/story-library";

const controlClass = "ui-field min-h-11 w-full min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-control)] px-3 text-base text-[var(--text-primary)]";

export function StoryLibrary({ rows, unavailable, createControl }: { rows: StoryLibraryRow[]; unavailable: boolean; createControl: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const raw = params.toString();
  const filters = useMemo(() => storyFilters(new URLSearchParams(raw)), [raw]);
  const visible = useMemo(() => filterStoryLibrary(rows, filters), [rows, filters]);
  const experiences = useMemo(() => [...new Map(rows.filter(row => row.experienceId).map(row => [row.experienceId!, row.experienceLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN")), [rows]);
  const competencies = useMemo(() => [...new Map(rows.flatMap(row => row.competencies.map(item => [item.id, item.label] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN")), [rows]);
  const filtered = Boolean(filters.q.trim() || filters.status !== "all" || filters.experience !== "all" || filters.competency !== "all");
  const usable = rows.filter(row => row.status === "usable" || row.status === "strong").length;
  // Next's native-history integration needs a fresh state object, without internal __NA markers.
  const change = (patch: Partial<StoryFilters>) => window.history.replaceState(null, "", storyLibraryHref({ ...filters, ...patch }));

  return <section aria-label="故事浏览" className="min-w-0">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm leading-6 text-[var(--text-secondary)]">{rows.length} 个故事，{usable} 个标记为可用或强故事</p>
      {createControl}
    </div>
    {unavailable ? <div role="alert" className="mb-5 rounded-[var(--radius-lg)] border border-[var(--control-border)] bg-[var(--surface-canvas)] p-4 text-sm leading-6"><p>部分资料未能读取，故事和关联数量可能不完整。</p><Button type="button" variant="link" disabled={refreshing} aria-busy={refreshing} onClick={() => {
      // A partial server read cannot be repaired from the existing local catalog.
      startRefresh(() => router.refresh());
    }}>{refreshing ? "重新读取中…" : "重新读取故事库"}</Button></div> : null}
    <div className="rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6">
      <label className="grid gap-2 text-sm font-medium">搜索故事<input type="search" value={filters.q} onChange={event => change({ q: event.target.value })} placeholder="标题、概括、经历或能力" className={controlClass} /></label>
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-3">
        <label className="grid min-w-0 gap-2 text-sm">使用状态<select aria-label="使用状态" value={filters.status} onChange={event => change({ status: event.target.value })} className={controlClass}>
          <option value="all">全部状态</option>
          {filters.status !== "all" && !storyStatusLabels[filters.status] ? <option value={filters.status}>当前状态：{filters.status}</option> : null}
          {Object.entries(storyStatusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>
        <label className="grid min-w-0 gap-2 text-sm">关联经历<select aria-label="关联经历" value={filters.experience} onChange={event => change({ experience: event.target.value })} className={controlClass}>
          <option value="all">全部经历</option><option value="unbound">未绑定经历</option>
          {filters.experience !== "all" && filters.experience !== "unbound" && !experiences.some(([id]) => id === filters.experience) ? <option value={filters.experience}>当前经历不可用</option> : null}
          {experiences.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <label className="grid min-w-0 gap-2 text-sm">关联能力<select aria-label="关联能力" value={filters.competency} onChange={event => change({ competency: event.target.value })} className={controlClass}>
          <option value="all">全部能力</option>
          {filters.competency !== "all" && !competencies.some(([id]) => id === filters.competency) ? <option value={filters.competency}>当前能力不可用</option> : null}
          {competencies.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <p role="status" className="text-sm text-[var(--text-secondary)]">{visible.length} 个结果{filtered ? "，已应用搜索或筛选" : ""}</p>
      {filtered ? <Button variant="ghost" onClick={() => change(emptyStoryFilters)}>清除搜索与筛选</Button> : null}
    </div>
    <ul className="divide-y divide-[var(--separator)]">
      {visible.map(row => <li key={row.id}>
        <Link href={`/career/interview/stories/${encodeURIComponent(row.id)}${storyFilterQuery(filters)}`} prefetch={false} className="ui-record-link block min-w-0 rounded-[var(--radius-md)] py-5 pl-3 pr-9">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2"><h2 className="min-w-0 break-words text-base font-medium leading-7 [overflow-wrap:anywhere]">{row.title}</h2><span className="text-[13px] text-[var(--text-secondary)]">{storyStatusLabels[row.status] ?? row.status}</span></div>
          <p className="mt-2 break-words text-sm leading-7 text-[var(--text-secondary)]">{row.oneLine || "尚未填写一句话概括。"}</p>
          <p className="mt-2 break-words text-[13px] leading-6 text-[var(--text-secondary)]">{row.experienceLabel || "未绑定经历"}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-6 text-[var(--text-secondary)]"><span>{row.archetypeCount} 个母题关联</span>{row.competencies.map(item => <span key={item.id}>{item.label}</span>)}</div>
        </Link>
      </li>)}
    </ul>
    {!visible.length ? <div className="py-12 text-sm leading-7 text-[var(--text-secondary)]"><p>{rows.length ? "没有匹配的故事，可调整条件或清除筛选。" : unavailable ? "暂时无法读取故事，请重新读取。" : "还没有故事，先记录一段具体经历。"}</p></div> : null}
  </section>;
}
