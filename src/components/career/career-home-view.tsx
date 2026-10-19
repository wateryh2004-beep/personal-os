"use client";

import Link from "next/link";
import { CareerFocusPicker, useCareerFocus } from "@/components/career/career-focus-picker";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import type { getCareerHome } from "@/features/career/queries";
import { getCareerNextActions, getCareerPreparationCounts } from "@/features/career/next-actions";
import { CareerContinue } from "@/components/career/career-continue";
import { ArrowUpRight, CalendarDays, ChevronRight } from "lucide-react";

export type CareerHomeData = Awaited<ReturnType<typeof getCareerHome>>;

export function CareerHomeView({ data, showContinue = true }: { data: CareerHomeData; showContinue?: boolean }) {
  const p = data.profile;
  const now = data.now;
  const formatDateTime = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" });

  const activeApplications = data.applications.filter((item) => !["rejected", "withdrawn", "closed"].includes(item.status));
  const activeDirections = data.directions.filter((item) => ["active", "exploring"].includes(item.status));
  const activeTargets = data.interviewTargets.filter((item) => item.status === "active");
  const focus = useCareerFocus(data.ownerId);
  const targets = activeTargets.filter((item) => focus.ids.includes(item.id));
  const otherTargets = activeTargets.filter((item) => !focus.ids.includes(item.id));
  const nextActions = getCareerNextActions(data.interviewTargets, data.interviewPreparations, data.milestones, now, data.timezone, new Set(focus.ids));

  return (
    <>
      <PageHeader
        title="目标岗位"
        description={p?.professional_headline || p?.current_stage || undefined}
      />
      <CareerNav current="/career" />
      {showContinue ? <CareerContinue /> : null}

      {data.unavailable ? (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface-control)] px-4 py-3 text-sm text-[var(--danger)]">部分职业数据暂时不可用。<button type="button" onClick={() => window.location.reload()} className="ui-link min-h-11">重新加载</button></div>
      ) : null}

      <div className="mb-10 grid items-start gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <section aria-labelledby="career-next-heading" className="career-next-panel min-w-0 rounded-[20px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6">
        <div className="flex min-h-6 flex-wrap items-baseline justify-between gap-2.5">
          <h2 id="career-next-heading" className="text-base font-medium text-[var(--text-primary)]">下一步</h2>
          <Link href="/career/roadmap" className="ui-link inline-flex min-h-11 items-center text-[13px]">路线图 →</Link>
        </div>

        <div className="mt-3.5 space-y-px">
          {nextActions.map((item, index) => (
            <Link key={item.key} href={item.href} className={`ui-record-link group flex min-h-16 items-start gap-3 rounded-[10px] px-2 py-3 hover:bg-[var(--surface-hover)] ${index === 0 ? "mb-2 bg-[var(--accent-soft)] px-4 py-4" : ""}`}>
              <span className="min-w-0 flex-1"><span className={`block break-words leading-7 text-[var(--text-primary)] ${index === 0 ? "text-lg font-medium" : "text-[15px]"}`}>{item.title}</span>
              <span className="mt-1 block text-[13px] leading-6 tabular-nums text-[var(--text-secondary)]">{item.dueAt ? `${item.dueAt.length === 10 ? item.dueAt : formatDateTime(item.dueAt)} · ` : ""}{item.meta}</span></span>
            </Link>
          ))}

          {!nextActions.length ? (
            <p className="py-3 text-sm text-[var(--text-tertiary)]">目前没有待推进的职业事项。可先选择近期关注岗位，或阅读通用面试内容。</p>
          ) : null}
        </div>
        {data.pastMilestoneCount > 0 ? (
          <Link href="/career/roadmap" className="mt-3 inline-flex min-h-11 items-center rounded-[7px] px-2.5 py-1 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]">
            {data.pastMilestoneCount} 项历史路线计划状态待确认 →
          </Link>
        ) : null}
      </section>
      <div>
      <section aria-labelledby="career-targets-heading" className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="career-targets-heading" className="text-base font-medium text-[var(--text-primary)]">近期关注</h2>
          <CareerFocusPicker targets={activeTargets} focus={focus} />
        </div>

        <div className="mt-3 grid gap-4">
          {targets.map((target) => {
            const preparations = data.interviewPreparations.filter((prep) => prep.context_id === target.id);
            const { ready, due, unscheduled } = getCareerPreparationCounts(preparations, now);
            return (
              <Link key={target.id} href={`/career/interview?context=${target.id}`} className="career-target-card group relative block rounded-[20px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6">
                <div className="min-w-0">
                  <p className="pr-8 text-[13px] leading-6 text-[var(--text-secondary)]">{target.organization_snapshot || target.title}</p>
                  <h3 className="mt-1 break-words pr-6 font-[family-name:var(--font-serif)] text-[24px] font-normal leading-snug text-[var(--text-primary)]">{target.role_title_snapshot || target.title}</h3>
                  <ArrowUpRight aria-hidden="true" className="career-target-arrow absolute right-5 top-6 size-5 text-[var(--accent)] sm:right-6" />
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--separator)] pt-4 text-[13px] tabular-nums text-[var(--text-secondary)]">
                  <span>{preparations.length ? `${ready}/${preparations.length} 已准备` : "尚未开始"}</span>
                  {due ? <span className="text-amber-700">{due} 到期练习</span> : null}
                  {unscheduled ? <span>{unscheduled} 待安排练习</span> : null}
                  {target.next_interview_at ? <span className="flex w-full items-start gap-2 leading-6"><CalendarDays aria-hidden="true" className="mt-1 size-4 shrink-0" /><time dateTime={target.next_interview_at}>{formatDateTime(target.next_interview_at)}</time></span> : null}
                </div>
              </Link>
            );
          })}

          {!targets.length ? (
            <div className="rounded-[20px] border border-dashed border-[var(--separator)] p-6"><p className="text-sm leading-7 text-[var(--text-secondary)]">选择近期要推进的岗位。其他目标仍保留在下方，关注不会更改申请状态。</p><Link href="/career/interview" className="ui-link mt-3 inline-flex min-h-11 items-center text-sm">先阅读通用面试内容 →</Link></div>
          ) : null}
        </div>
      </section>
      {otherTargets.length ? <details className="mt-6 border-t border-[var(--separator)] pt-2"><DisclosureSummary className="min-h-11 text-sm">其他目标 · {otherTargets.length}</DisclosureSummary><div className="mt-2 divide-y divide-[var(--separator)]">{otherTargets.map(target => <Link key={target.id} href={`/career/interview?context=${target.id}`} className="ui-record-link flex min-h-16 items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block text-[13px] text-[var(--text-secondary)]">{target.organization_snapshot}</span><span className="mt-1 block break-words text-[15px]">{target.role_title_snapshot || target.title}</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0" /></Link>)}</div>{activeTargets.length === 100 ? <Link href="/career/interview" className="ui-link inline-flex min-h-11 items-center text-sm">更多岗位 →</Link> : null}</details> : null}

      </div>
      </div>

      <details className="border-t border-[var(--separator)] pt-2">
        <DisclosureSummary className="min-h-11 text-sm">职业资料与管理</DisclosureSummary>
        <div className="pt-5">
          <section className="mb-10">
            <h2 className="text-[15px] font-medium text-[var(--text-primary)]">关键资产</h2>
            <div className="mt-3.5 grid grid-cols-2 gap-x-8 gap-y-3.5 sm:grid-cols-4">
              <Asset href="/career/experiences" label="经历" value={data.experienceCount} />
              <Asset href="/career/resumes" label="简历" value={data.resumeCount} />
              <Asset href="/career/skills" label="能力" value={data.skillCount} />
              <Asset href="/career/applications" label="申请" value={activeApplications.length} />
            </div>
          </section>

          {activeDirections.length ? (
            <section className="pt-2">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-medium text-[var(--text-primary)]">职业方向</h2>
                <Link href="/career/directions" className="pressable rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">管理 →</Link>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {activeDirections.slice(0, 3).map((item) => item.name).join(" · ")}
              </p>
            </section>
          ) : null}
        </div>
      </details>
    </>
  );
}

function Asset({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="group">
      <p className="text-[23px] font-semibold leading-none tracking-[-0.025em] text-[var(--text-primary)]">{value}</p>
      <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]">{label}</p>
    </Link>
  );
}
