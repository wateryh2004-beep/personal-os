import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { getInterviewInsights } from "@/features/interview/queries";

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

      <form className="mb-7 flex flex-wrap items-end gap-3 border-y py-4">
        <label className="grid min-w-64 gap-1 text-sm">
          <span>目标岗位</span>
          <select name="context" defaultValue={context ?? ""} className="border bg-white px-3 py-2">
            <option value="">全部目标</option>
            {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <button className="bg-zinc-900 px-3 py-2 text-sm text-white">查看</button>
      </form>

      <section className="mb-10 grid gap-4 sm:grid-cols-3">
        <Metric label="练习次数" value={totalAttempts} />
        <Metric label="已准备题目" value={ready} />
        <Metric label="当前准备题目" value={data.preparations.length} />
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-medium">反复出现的问题</h2>
          <p className="mt-1 text-sm text-zinc-500">按近期练习中记录的问题标签聚合。</p>
          <div className="mt-4 divide-y border-y">
            {data.issueCounts.slice(0,12).map((item) => (
              <div key={item.tag} className="flex items-center justify-between py-3 text-sm">
                <span>{item.tag}</span>
                <span className="font-mono text-zinc-500">{item.count}</span>
              </div>
            ))}
            {!data.issueCounts.length ? <p className="py-4 text-sm text-zinc-500">还没有足够的练习数据。</p> : null}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">能力覆盖</h2>
          <p className="mt-1 text-sm text-zinc-500">分别看题目覆盖、已准备数量和真实经历关联数量。</p>
          <div className="mt-4 divide-y border-y">
            {data.competencyCoverage.slice(0,16).map((item) => (
              <div key={item.tag} className="grid grid-cols-[1fr_52px_52px_52px] gap-3 py-3 text-sm">
                <span>{item.tag}</span>
                <span className="text-right font-mono text-zinc-500">{item.total}</span>
                <span className="text-right font-mono text-[#365F78]">{item.ready}</span>
                <span className="text-right font-mono text-zinc-500">{item.evidence}</span>
              </div>
            ))}
            {!data.competencyCoverage.length ? <p className="py-4 text-sm text-zinc-500">还没有能力覆盖数据。</p> : null}
          </div>
          {data.competencyCoverage.length ? <div className="mt-2 grid grid-cols-[1fr_52px_52px_52px] gap-3 text-[10px] uppercase tracking-wide text-zinc-400"><span></span><span className="text-right">题目</span><span className="text-right">已准备</span><span className="text-right">经历</span></div> : null}
        </section>

        <section>
          <h2 className="text-lg font-medium">经历使用</h2>
          <p className="mt-1 text-sm text-zinc-500">检测是不是所有题都在讲同一个经历。</p>
          <div className="mt-4 divide-y border-y">
            {data.storyUsage.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div><p>{item.experience?.organization || "已归档经历"}</p><p className="mt-0.5 text-xs text-zinc-400">{item.experience?.role || ""}</p></div>
                <span className="font-mono text-zinc-500">{item.count}</span>
              </div>
            ))}
            {!data.storyUsage.length ? <p className="py-4 text-sm text-zinc-500">还没有关联经历素材。</p> : null}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">改善趋势</h2>
          <p className="mt-1 text-sm text-zinc-500">先用每次练习暴露的问题数量观察趋势，不伪造能力评分。</p>
          <div className="mt-4 divide-y border-y">
            {data.monthlyTrend.map((item) => (
              <div key={item.month} className="grid grid-cols-[1fr_70px_90px] gap-3 py-3 text-sm">
                <span>{item.month}</span>
                <span className="text-right font-mono text-zinc-500">{item.attempts} 次</span>
                <span className="text-right font-mono">{item.issuesPerAttempt.toFixed(2)} 个问题/次</span>
              </div>
            ))}
            {!data.monthlyTrend.length ? <p className="py-4 text-sm text-zinc-500">完成几次练习后，这里才有意义。</p> : null}
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border-t pt-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 font-mono text-2xl">{value}</p></div>;
}
