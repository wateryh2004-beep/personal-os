import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { getInterviewInsights } from "@/features/interview/queries";
import { competencyLabels, issueLabels } from "@/features/interview/constants";

export default async function InterviewInsightsPage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const data = await getInterviewInsights(context ?? null);
  const ready = data.preparations.filter((item: any) => item.status === "ready").length;

  return (
    <>
      <PageHeader title="复盘" description="只看反复出现的问题和能力缺口。" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/insights" />

      <form className="mb-8 flex items-center gap-2">
        <select name="context" defaultValue={context ?? ""} className="h-9 max-w-sm rounded-[10px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]">
          <option value="">全部岗位</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="pressable rounded-[7px] px-1.5 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">切换</button>
      </form>

      <div className="mb-10 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] tabular-nums text-[var(--text-tertiary)]">
        <span>{data.attempts.length} 次练习</span>
        <span>{ready}/{data.preparations.length} 道已准备</span>
      </div>

      <section className="mb-14">
        <h2 className="text-[14px] font-semibold tracking-[-0.008em] text-[var(--text-primary)]">反复出现的问题</h2>
        <div className="mt-3.5 space-y-px">
          {data.issueCounts.slice(0,10).map((item) => (
            <div key={item.tag} className="flex min-h-10 items-center justify-between rounded-[9px] px-2.5 py-2 transition-colors ui-transition hover:bg-[var(--surface-hover)]">
              <span className="text-[13px] text-[var(--text-primary)]">{issueLabels[item.tag] ?? item.tag}</span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">{item.count}</span>
            </div>
          ))}
          {!data.issueCounts.length ? <p className="py-4 text-[13px] text-[var(--text-tertiary)]">还没有足够的练习数据。</p> : null}
        </div>
      </section>

      <section className="mb-14">
        <h2 className="text-[14px] font-semibold tracking-[-0.008em] text-[var(--text-primary)]">能力覆盖</h2>
        <div className="mt-3.5 space-y-px">
          {data.competencyCoverage.slice(0,12).map((item) => (
            <div key={item.tag} className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-4 rounded-[9px] px-2.5 py-2 transition-colors ui-transition hover:bg-[var(--surface-hover)]">
              <span className="text-[13px] text-[var(--text-primary)]">{competencyLabels[item.tag] ?? item.tag}</span>
              <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">{item.ready}/{item.total} 已准备 · {item.evidence} 条经历</span>
            </div>
          ))}
          {!data.competencyCoverage.length ? <p className="py-4 text-[13px] text-[var(--text-tertiary)]">还没有能力覆盖数据。</p> : null}
        </div>
      </section>

      <details>
        <summary className="pressable inline-flex cursor-pointer list-none rounded-[8px] px-1 py-0.5 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">更多趋势</summary>
        <div className="mt-4.5 grid gap-8 sm:grid-cols-2">
          <section>
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">经历使用</h3>
            <div className="mt-3 space-y-2">
              {data.storyUsage.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="truncate text-[12.5px] text-[var(--text-secondary)]">{item.experience?.organization || "已归档经历"}</span>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">{item.count}</span>
                </div>
              ))}
              {!data.storyUsage.length ? <p className="text-[12.5px] text-[var(--text-tertiary)]">还没有关联经历。</p> : null}
            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">改善趋势</h3>
            <div className="mt-3 space-y-2">
              {data.monthlyTrend.map((item) => (
                <div key={item.month} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-[12.5px] text-[var(--text-secondary)]">{item.month}</span>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">{item.attempts} 次 · {item.issuesPerAttempt.toFixed(2)} 问题/次</span>
                </div>
              ))}
              {!data.monthlyTrend.length ? <p className="text-[12.5px] text-[var(--text-tertiary)]">完成几次练习后再看趋势。</p> : null}
            </div>
          </section>
        </div>
      </details>
    </>
  );
}
