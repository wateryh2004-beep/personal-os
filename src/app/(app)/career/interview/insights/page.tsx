import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { getInterviewInsights } from "@/features/interview/queries";
import { competencyLabels, issueLabels } from "@/features/interview/constants";

export default async function InterviewInsightsPage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const data = await getInterviewInsights(context ?? null);
  const totalAttempts = data.attempts.length;
  const ready = data.preparations.filter((item: any) => item.status === "ready").length;

  return (
    <>
      <PageHeader
        title="复盘"
        description="不做虚假的面试总分，只看反复出现的问题、能力覆盖、经历使用和真实改善轨迹。"
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/insights" />

      <form className="mb-8 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-2">
        <select name="context" defaultValue={context ?? ""} className="min-w-64 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-zinc-200">
          <option value="">全部目标岗位</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100">切换</button>
      </form>

      <section className="mb-10 grid gap-3 sm:grid-cols-3">
        <Metric label="练习次数" value={totalAttempts} />
        <Metric label="已准备题目" value={ready} />
        <Metric label="当前准备题目" value={data.preparations.length} />
      </section>

      <div className="grid gap-12 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-medium">反复出现的问题</h2>
          <p className="mt-1 text-sm text-zinc-500">按近期练习中记录的问题标签聚合。</p>
          <div className="mt-4 space-y-1">
            {data.issueCounts.slice(0,12).map((item) => (
              <div key={item.tag} className="flex items-center justify-between rounded-lg px-2 py-2.5 text-sm hover:bg-zinc-50">
                <span>{issueLabels[item.tag] ?? item.tag}</span>
                <span className="font-mono text-zinc-400">{item.count}</span>
              </div>
            ))}
            {!data.issueCounts.length ? <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">还没有足够的练习数据。</p> : null}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">能力覆盖</h2>
          <p className="mt-1 text-sm text-zinc-500">分别看题目覆盖、已准备数量和真实经历关联数量。</p>
          <div className="mt-4 space-y-1">
            {data.competencyCoverage.slice(0,16).map((item) => (
              <div key={item.tag} className="grid grid-cols-[1fr_52px_52px_52px] gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-zinc-50">
                <span>{competencyLabels[item.tag] ?? item.tag}</span>
                <span className="text-right font-mono text-zinc-400">{item.total}</span>
                <span className="text-right font-mono text-[#365F78]">{item.ready}</span>
                <span className="text-right font-mono text-zinc-400">{item.evidence}</span>
              </div>
            ))}
            {!data.competencyCoverage.length ? <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">还没有能力覆盖数据。</p> : null}
          </div>
          {data.competencyCoverage.length ? (
            <div className="mt-2 grid grid-cols-[1fr_52px_52px_52px] gap-3 px-2 text-[10px] text-zinc-400">
              <span></span><span className="text-right">题目</span><span className="text-right">已准备</span><span className="text-right">经历</span>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="text-lg font-medium">经历使用</h2>
          <p className="mt-1 text-sm text-zinc-500">检查是不是所有题都在反复讲同一个经历。</p>
          <div className="mt-4 space-y-1">
            {data.storyUsage.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 text-sm hover:bg-zinc-50">
                <div>
                  <p>{item.experience?.organization || "已归档经历"}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{item.experience?.role || ""}</p>
                </div>
                <span className="font-mono text-zinc-400">{item.count}</span>
              </div>
            ))}
            {!data.storyUsage.length ? <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">还没有关联经历素材。</p> : null}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">改善趋势</h2>
          <p className="mt-1 text-sm text-zinc-500">用每次练习暴露的问题数量观察趋势，不伪造能力评分。</p>
          <div className="mt-4 space-y-1">
            {data.monthlyTrend.map((item) => (
              <div key={item.month} className="grid grid-cols-[1fr_70px_100px] gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-zinc-50">
                <span>{item.month}</span>
                <span className="text-right font-mono text-zinc-400">{item.attempts} 次</span>
                <span className="text-right font-mono">{item.issuesPerAttempt.toFixed(2)} 个问题/次</span>
              </div>
            ))}
            {!data.monthlyTrend.length ? <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">完成几次练习后，这里才有意义。</p> : null}
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-4 py-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}</p>
    </div>
  );
}
