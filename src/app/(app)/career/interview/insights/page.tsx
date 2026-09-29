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

      <form className="mb-10 flex items-center gap-2">
        <select name="context" defaultValue={context ?? ""} className="max-w-sm px-3 py-2 text-sm">
          <option value="">全部岗位</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="text-xs text-zinc-400 hover:text-zinc-700">切换</button>
      </form>

      <div className="mb-12 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400">
        <span>{data.attempts.length} 次练习</span>
        <span>{ready}/{data.preparations.length} 道已准备</span>
      </div>

      <section className="mb-14">
        <h2 className="text-[15px] font-medium text-zinc-950">反复出现的问题</h2>
        <div className="mt-4 space-y-1">
          {data.issueCounts.slice(0,10).map((item) => (
            <div key={item.tag} className="flex items-center justify-between rounded-lg px-2 py-2.5 text-sm hover:bg-white/70">
              <span className="text-zinc-700">{issueLabels[item.tag] ?? item.tag}</span>
              <span className="font-mono text-xs text-zinc-400">{item.count}</span>
            </div>
          ))}
          {!data.issueCounts.length ? <p className="py-3 text-sm text-zinc-400">还没有足够的练习数据。</p> : null}
        </div>
      </section>

      <section className="mb-14">
        <h2 className="text-[15px] font-medium text-zinc-950">能力覆盖</h2>
        <div className="mt-4 space-y-1">
          {data.competencyCoverage.slice(0,12).map((item) => (
            <div key={item.tag} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-lg px-2 py-2.5 text-sm hover:bg-white/70">
              <span className="text-zinc-700">{competencyLabels[item.tag] ?? item.tag}</span>
              <span className="text-xs text-zinc-400">{item.ready}/{item.total} 已准备 · {item.evidence} 条经历</span>
            </div>
          ))}
          {!data.competencyCoverage.length ? <p className="py-3 text-sm text-zinc-400">还没有能力覆盖数据。</p> : null}
        </div>
      </section>

      <details>
        <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">更多趋势</summary>
        <div className="mt-5 grid gap-10 sm:grid-cols-2">
          <section>
            <h3 className="text-sm font-medium text-zinc-800">经历使用</h3>
            <div className="mt-3 space-y-2">
              {data.storyUsage.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="truncate text-zinc-600">{item.experience?.organization || "已归档经历"}</span>
                  <span className="font-mono text-xs text-zinc-400">{item.count}</span>
                </div>
              ))}
              {!data.storyUsage.length ? <p className="text-sm text-zinc-400">还没有关联经历。</p> : null}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-zinc-800">改善趋势</h3>
            <div className="mt-3 space-y-2">
              {data.monthlyTrend.map((item) => (
                <div key={item.month} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-zinc-600">{item.month}</span>
                  <span className="font-mono text-xs text-zinc-400">{item.attempts} 次 · {item.issuesPerAttempt.toFixed(2)} 问题/次</span>
                </div>
              ))}
              {!data.monthlyTrend.length ? <p className="text-sm text-zinc-400">完成几次练习后再看趋势。</p> : null}
            </div>
          </section>
        </div>
      </details>
    </>
  );
}
