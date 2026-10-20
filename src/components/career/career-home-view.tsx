"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowUpRight } from "lucide-react";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "./career-nav";
import { CareerContinue } from "./career-continue";
import { getCareerNextActions } from "@/features/career/next-actions";
import type { getCareerHome } from "@/features/career/queries";

export type CareerHomeData = Awaited<ReturnType<typeof getCareerHome>>;
const submittedStages = new Set(["submitted", "interviewing", "offer", "rejected", "withdrawn", "closed"]);

export function CareerHomeView({ data, showContinue = true }: { data: CareerHomeData; showContinue?: boolean }) {
  const router = useRouter();
  const [reloading, startReload] = useTransition();
  const now = data.now;
  const formatDate = (value: string) => new Date(value).toLocaleString("zh-CN", {
    timeZone: data.timezone, dateStyle: "medium",
  });
  // A saved preparation or draft must never count as an actual submitted application.
  const submitted = data.applications.filter(item => submittedStages.has(item.status) && Boolean(item.applied_at));
  const drafts = data.applications.filter(item => ["draft", "preparing"].includes(item.status));
  const openOpportunities = data.opportunities.filter(item => item.status !== "closed" && (!item.deadline_at || Date.parse(item.deadline_at) >= now));
  // A deadline is actionable only when it comes from a sourced opportunity, never
  // from a speculative interview target. Do not remind about already submitted jobs.
  const alreadyApplied = new Set(data.applications.filter(item => Boolean(item.applied_at)).map(item => item.opportunity_id));
  const deadlineActions = openOpportunities
    .filter(item => item.deadline_at && !alreadyApplied.has(item.id))
    .map(item => ({
      key: `opportunity-${item.id}`,
      href: `/career/opportunities#opportunity-${item.id}`,
      title: `${item.organization} · ${item.role_title}`,
      meta: "招聘投递截止（未记录实际提交）",
      dueAt: item.deadline_at!,
    }));
  const milestoneActions = getCareerNextActions([], [], data.milestones, now, data.timezone);
  const nextActions = [...deadlineActions, ...milestoneActions]
    .sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))
    .slice(0, 6);

  return <>
    <PageHeader title="职业中心" description={data.profile?.professional_headline || "职业目标、真实机会、投递进展与面试学习分别管理。"} />
    <CareerNav current="/career" />
    {showContinue ? <CareerContinue /> : null}
    {data.unavailable ? <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface-control)] px-4 py-3 text-sm text-[var(--danger)]">
      部分职业数据暂时不可用。
      <button type="button" disabled={reloading} onClick={() => startReload(() => router.refresh())} className="ui-link min-h-11">重新加载</button>
    </div> : null}

    <div className="mb-9 grid items-start gap-5 lg:grid-cols-2">
      <section aria-labelledby="career-directions-heading" className="rounded-[20px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="career-directions-heading" className="text-base font-medium">职业目标</h2>
          <Link href="/career/directions" className="ui-link inline-flex min-h-11 items-center text-[13px]">管理方向 →</Link>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[var(--text-tertiary)]">长期选择与判断，不等于企业正在招聘。</p>
        <div className="mt-4 divide-y divide-[var(--separator)]">
          {data.directions.map(item => <Link key={item.id} href="/career/directions" className="ui-record-link block py-3">
            <span className="block text-[15px] font-medium leading-6">{item.name}</span>
            <span className="mt-1 block text-[12px] leading-5 text-[var(--text-secondary)]">{item.current_decision || (item.status === "active" ? "主攻方向" : "探索方向")}</span>
          </Link>)}
          {!data.directions.length ? <p className="py-3 text-sm leading-6 text-[var(--text-secondary)]">暂无职业方向。先明确目标，再筛真实岗位。</p> : null}
        </div>
      </section>

      <section aria-labelledby="career-opportunities-heading" className="rounded-[20px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="career-opportunities-heading" className="text-base font-medium">真实招聘机会</h2>
          <Link href="/career/opportunities" className="ui-link inline-flex min-h-11 items-center text-[13px]">查看机会 →</Link>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[var(--text-tertiary)]">只展示已单独记录招聘来源、届次的职位，不自动导入面试占位。</p>
        <div className="mt-4 divide-y divide-[var(--separator)]">
          {openOpportunities.slice(0, 4).map(item => <Link key={item.id} href={`/career/opportunities#opportunity-${item.id}`} className="ui-record-link flex min-w-0 items-start justify-between gap-3 py-3">
            <span className="min-w-0"><span className="block text-[14px] font-medium leading-6">{item.role_title}</span>
              <span className="mt-1 block text-[12px] leading-5 text-[var(--text-secondary)]">{item.organization}{item.recruitment_cycle ? ` · ${item.recruitment_cycle}` : ""}</span>
            </span>
            <span className="shrink-0 text-[12px] leading-6 text-[var(--text-tertiary)]">{item.deadline_at ? `${formatDate(item.deadline_at)} 截止` : "未公布截止"}</span>
          </Link>)}
          {!openOpportunities.length ? <p className="py-3 text-sm leading-6 text-[var(--text-secondary)]">尚无记录的开放机会。面试准备中的历史题库情境不会自动算作在招岗位。</p> : null}
        </div>
      </section>

      <section aria-labelledby="career-applications-heading" className="rounded-[20px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="career-applications-heading" className="text-base font-medium">投递记录</h2>
          <Link href="/career/applications" className="ui-link inline-flex min-h-11 items-center text-[13px]">查看进展 →</Link>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[var(--text-tertiary)]">真实提交与选拔进展；保存草稿不等于已申请。</p>
        <p className="mt-5 text-[14px] leading-7"><span className="text-[25px] font-semibold tabular-nums">{submitted.length}</span> <span className="text-[var(--text-secondary)]">有投递时间的申请</span></p>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{drafts.length} 条尚未提交的草稿／准备记录</p>
      </section>

      <section aria-labelledby="career-interview-heading" className="rounded-[20px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="career-interview-heading" className="text-base font-medium">面试准备情境</h2>
          <Link href="/career/interview/targets" className="ui-link inline-flex min-h-11 items-center text-[13px]">管理情境 →</Link>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[var(--text-tertiary)]">题目、答案、故事与练习放在 Interview Lab；准备状态不代表岗位开放或已投递。</p>
        <Link href="/career/interview" className="ui-action-secondary mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-[13px]">进入 Interview Lab <ArrowUpRight size={14} /></Link>
      </section>
    </div>

    <section aria-labelledby="career-next-heading" className="mb-9 rounded-[20px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="career-next-heading" className="text-base font-medium">下一步</h2>
        <Link href="/career/roadmap" className="ui-link inline-flex min-h-11 items-center text-[13px]">路线图 →</Link>
      </div>
      <div className="mt-3 divide-y divide-[var(--separator)]">
        {nextActions.map(item => <Link key={item.key} href={item.href} className="ui-record-link block py-3">
          <span className="block text-sm font-medium">{item.title}</span>
          <span className="mt-1 block text-xs text-[var(--text-secondary)]">{item.dueAt ? `${item.dueAt} · ` : ""}{item.meta}</span>
        </Link>)}
        {!nextActions.length ? <p className="py-3 text-sm text-[var(--text-secondary)]">当前没有到期的路线事项。真实机会和申请进展分别在上方查看。</p> : null}
      </div>
      {data.pastMilestoneCount > 0 ? <Link href="/career/roadmap" className="ui-link mt-2 inline-flex min-h-11 items-center text-[12px]">{data.pastMilestoneCount} 项历史路线计划状态待确认 →</Link> : null}
    </section>

    <details className="border-t border-[var(--separator)] pt-2">
      <DisclosureSummary className="min-h-11 text-sm">职业资料与管理</DisclosureSummary>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 py-5 sm:grid-cols-4">
        <Asset href="/career/experiences" label="经历" value={data.experienceCount} />
        <Asset href="/career/resumes" label="简历" value={data.resumeCount} />
        <Asset href="/career/skills" label="能力" value={data.skillCount} />
        <Asset href="/career/applications" label="投递记录" value={submitted.length} />
      </div>
    </details>
  </>;
}

function Asset({ href, label, value }: { href: string; label: string; value: number }) {
  return <Link href={href} className="group">
    <p className="text-[23px] font-semibold tabular-nums leading-none tracking-[-0.025em] text-[var(--text-primary)]">{value}</p>
    <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]">{label}</p>
  </Link>;
}
