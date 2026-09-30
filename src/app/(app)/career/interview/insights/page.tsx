import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { getInterviewInsights } from "@/features/interview/queries";
import { issueLabels } from "@/features/interview/constants";

export default async function InterviewInsightsPage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const data = await getInterviewInsights(context ?? null);
  const ready = data.preparations.filter((item: any) => item.status === "ready").length;

  return (
    <>
      <PageHeader title="复盘" description="回答三个问题：哪里缺故事，哪里没练够，哪些素材用得太集中。" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/insights" />

      <form className="mb-8 flex items-center gap-2">
        <select name="context" defaultValue={context ?? ""} className="h-9 max-w-sm rounded-[10px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none">
          <option value="">全部岗位</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="pressable rounded-[7px] px-1.5 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)]">切换</button>
      </form>

      <div className="mb-10 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] tabular-nums text-[var(--text-tertiary)]">
        <span>{data.attempts.length} 次练习</span>
        <span>{ready}/{data.preparations.length} 道已准备</span>
        <Link href="/career/interview/stories" className="hover:text-[var(--text-primary)]">故事库 {data.stories.length} →</Link>
      </div>

      <section className="mb-14">
        <h2 className="text-[14px] font-semibold tracking-[-0.008em] text-[var(--text-primary)]">优先补齐</h2>
        <div className="mt-3.5 space-y-px">
          {data.priorityGaps.map((item: any) => (
            <div key={item.tag} className="grid min-h-11 grid-cols-[1fr_auto] items-center gap-4 rounded-[9px] px-2.5 py-2 hover:bg-[var(--surface-hover)]">
              <div>
                <p className="text-[13px] text-[var(--text-primary)]">{item.label}</p>
                <p className="mt-0.5 text-[10.5px] text-[var(--text-tertiary)]">{item.diagnosis}</p>
              </div>
              <span className="text-right text-[10.5px] tabular-nums text-[var(--text-tertiary)]">{item.strongStoryCount} 强故事 · {item.practiceCount} 次练习</span>
            </div>
          ))}
          {!data.priorityGaps.length ? <p className="py-4 text-[13px] text-[var(--text-tertiary)]">当前没有明显能力缺口。</p> : null}
        </div>
      </section>

      <section className="mb-14">
        <h2 className="text-[14px] font-semibold tracking-[-0.008em] text-[var(--text-primary)]">能力覆盖</h2>
        <div className="mt-3.5 space-y-px">
          {data.competencyCoverage.map((item: any) => (
            <div key={item.tag} className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-4 rounded-[9px] px-2.5 py-2 hover:bg-[var(--surface-hover)]">
              <span className="text-[13px] text-[var(--text-primary)]">{item.label}</span>
              <span className="text-[10.5px] tabular-nums text-[var(--text-tertiary)]">
                {item.ready}/{item.total} 已准备 · {item.strongStoryCount}/{item.storyCount} 可用故事 · {item.practiceCount} 次练习
              </span>
            </div>
          ))}
          {!data.competencyCoverage.length ? <p className="py-4 text-[13px] text-[var(--text-tertiary)]">还没有能力覆盖数据。</p> : null}
        </div>
      </section>

      <section className="mb-14">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold tracking-[-0.008em] text-[var(--text-primary)]">故事使用</h2>
          <Link href="/career/interview/stories" className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">管理故事 →</Link>
        </div>
        <div className="mt-3.5 space-y-px">
          {data.storyUsage.map((item: any) => (
            <div key={item.id} className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-4 rounded-[9px] px-2.5 py-2 hover:bg-[var(--surface-hover)]">
              <Link href={`/career/interview/stories/${item.id}`} className="truncate text-[13px] text-[var(--text-primary)]">{item.story?.title || "已归档故事"}</Link>
              <span className="text-[10.5px] tabular-nums text-[var(--text-tertiary)]">{item.count} 个母题 · {(item.share * 100).toFixed(0)}%</span>
            </div>
          ))}
          {!data.storyUsage.length ? <p className="py-4 text-[13px] text-[var(--text-tertiary)]">还没有故事使用数据。</p> : null}
        </div>
      </section>

      <details>
        <summary className="pressable inline-flex cursor-pointer list-none rounded-[8px] px-1 py-0.5 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">更多趋势</summary>
        <div className="mt-4.5 grid gap-8 sm:grid-cols-2">
          <section>
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">反复出现的问题</h3>
            <div className="mt-3 space-y-2">
              {data.issueCounts.slice(0,10).map((item) => (
                <div key={item.tag} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-[12.5px] text-[var(--text-secondary)]">{issueLabels[item.tag] ?? item.tag}</span>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">{item.count}</span>
                </div>
              ))}
              {!data.issueCounts.length ? <p className="text-[12.5px] text-[var(--text-tertiary)]">完成几次练习后再看错误模式。</p> : null}
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
