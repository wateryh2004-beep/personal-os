import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import type { getCareerHome } from "@/features/career/queries";
import { getCareerNextActions, getCareerPreparationCounts } from "@/features/career/next-actions";
import { CareerContinue } from "@/components/career/career-continue";

export type CareerHomeData = Awaited<ReturnType<typeof getCareerHome>>;

export function CareerHomeView({ data, showContinue = true }: { data: CareerHomeData; showContinue?: boolean }) {
  const p = data.profile;
  const now = data.now;
  const formatDateTime = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" });

  const activeApplications = data.applications.filter((item) => !["rejected", "withdrawn", "closed"].includes(item.status));
  const activeDirections = data.directions.filter((item) => ["active", "exploring"].includes(item.status));
  const targets = data.interviewTargets.filter((item) => item.status === "active").slice(0, 3);
  const nextActions = getCareerNextActions(data.interviewTargets, data.interviewPreparations, data.milestones, now, data.timezone);

  return (
    <>
      <PageHeader
        title="工作台"
        description={p?.professional_headline || p?.current_stage || "围绕真实岗位推进下一步。"}
      />
      <CareerNav current="/career" />
      {showContinue ? <CareerContinue /> : null}

      {data.unavailable ? (
        <p className="mb-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          部分职业数据暂时不可用。
        </p>
      ) : null}

      <section className="mb-12">
        <div className="flex min-h-6 flex-wrap items-baseline justify-between gap-2.5">
          <h2 className="text-[14px] font-semibold tracking-[-0.008em] text-[var(--text-primary)]">下一步</h2>
          <Link href="/career/roadmap" className="pressable rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">路线图 →</Link>
        </div>

        <div className="mt-3.5 space-y-px">
          {nextActions.map((item) => (
            <Link key={item.key} href={item.href} className="group flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 pressable rounded-[10px] px-2.5 py-2.5 hover:bg-[var(--surface-hover)]">
              <span className="min-w-0 truncate text-[14px] text-[var(--text-primary)]">{item.title}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]">{item.dueAt ? `${item.dueAt.length === 10 ? item.dueAt : formatDateTime(item.dueAt)} · ` : ""}{item.meta}</span>
            </Link>
          ))}

          {!nextActions.length ? (
            <p className="py-3 text-sm text-[var(--text-tertiary)]">目前没有待推进的职业事项。</p>
          ) : null}
        </div>
        {data.pastMilestoneCount > 0 ? (
          <Link href="/career/roadmap" className="mt-3 inline-flex min-h-11 items-center rounded-[7px] px-2.5 py-1 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]">
            {data.pastMilestoneCount} 项历史路线计划状态待确认 →
          </Link>
        ) : null}
      </section>

      <section className="mb-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium text-[var(--text-primary)]">目标岗位</h2>
          <Link href="/career/interview" className="pressable rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">全部 →</Link>
        </div>

        <div className="mt-4 space-y-1">
          {targets.map((target) => {
            const preparations = data.interviewPreparations.filter((prep) => prep.context_id === target.id);
            const { ready, due, unscheduled } = getCareerPreparationCounts(preparations, now);
            return (
              <Link key={target.id} href={`/career/interview?context=${target.id}`} className="group grid min-h-12 gap-1 pressable rounded-[10px] px-2.5 py-2.5 hover:bg-[var(--surface-hover)] sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">{target.role_title_snapshot || target.title}</p>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--text-tertiary)]">{target.organization_snapshot || target.title}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums text-[var(--text-tertiary)]">
                  <span>{preparations.length ? `${ready}/${preparations.length} 已准备` : "尚未开始"}</span>
                  {due ? <span className="text-amber-700">{due} 到期练习</span> : null}
                  {unscheduled ? <span>{unscheduled} 待安排练习</span> : null}
                  {target.next_interview_at ? <span className="w-full sm:w-auto">{formatDateTime(target.next_interview_at)}</span> : null}
                </div>
              </Link>
            );
          })}

          {!targets.length ? (
            <Link href="/career/interview" className="block py-3 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">添加第一个目标岗位 →</Link>
          ) : null}
        </div>
      </section>

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
