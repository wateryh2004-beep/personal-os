import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { PracticeScope, PracticeUnavailable, practiceScopeHref } from "@/components/career/interview/practice-scope";
import { Button } from "@/components/ui/button";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { getInterviewInsights } from "@/features/interview/queries";
import { issueLabels } from "@/features/interview/constants";

export default async function InterviewInsightsPage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const data = await getInterviewInsights(context ?? null);
  const ready = data.preparations.filter((item) => item.status === "ready").length;
  const practiceHref = practiceScopeHref("/career/interview/practice", context);
  const learningHref = practiceScopeHref("/career/interview", context);

  return <>
    <PageHeader title="复盘" action={<Button asChild><Link href={practiceHref}>继续练习</Link></Button>} />
    <CareerNav current="/career/interview" />
    <InterviewNav current="/career/interview/insights" context={context} />
    <PracticeScope contexts={data.contexts} context={context} />
    {data.unavailable ? <PracticeUnavailable href={practiceScopeHref("/career/interview/insights", context)} /> : null}
    <dl className="mb-8 grid grid-cols-2 gap-5 border-y border-[var(--separator)] py-5 sm:grid-cols-3">
      <div><dt className="text-[13px] text-[var(--text-secondary)]">已保存练习</dt><dd className="mt-2 text-2xl tabular-nums text-[var(--text-primary)]">{data.attempts.length}<span className="ml-1 text-sm">次</span></dd></div>
      <div><dt className="text-[13px] text-[var(--text-secondary)]">标记为已准备</dt><dd className="mt-2 text-2xl tabular-nums text-[var(--text-primary)]">{ready}<span className="ml-1 text-sm">/ {data.preparations.length} 道</span></dd></div>
      <div><dt className="text-[13px] text-[var(--text-secondary)]">有待补齐的能力</dt><dd className="mt-2 text-2xl tabular-nums text-[var(--text-primary)]">{data.competencyCoverage.filter((item) => item.diagnosis).length}<span className="ml-1 text-sm">项</span></dd></div>
    </dl>

    <section aria-labelledby="insights-priority-title" className="mb-9 rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-7">
      <h2 id="insights-priority-title" className="text-lg font-semibold text-[var(--text-primary)]">优先补齐</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">依据已关联的故事、准备状态和练习记录整理。</p>
      <ul className="mt-4 divide-y divide-[var(--separator)]">
        {data.priorityGaps.map((item) => <li key={item.tag} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <h3 className="break-words text-[15px] font-medium text-[var(--text-primary)]">{item.label}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.diagnosis}</p>
            <p className="mt-1 text-[13px] leading-6 tabular-nums text-[var(--text-secondary)]">{item.requiresStory ? `${item.strongStoryCount} 个可用故事，` : ""}{item.practiceCount} 次练习</p>
          </div>
          <Button asChild variant="outline"><Link href={item.requiresStory && item.strongStoryCount === 0 ? "/career/interview/stories" : item.ready < item.total ? learningHref : practiceHref}>{item.requiresStory && item.strongStoryCount === 0 ? "补充故事" : item.ready < item.total ? "继续准备" : "选择练习"}</Link></Button>
        </li>)}
      </ul>
      {!data.priorityGaps.length ? <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{data.unavailable ? "资料不完整，暂不判断缺口。" : !data.preparations.length ? "当前范围还没有准备记录。" : !data.competencyCoverage.length ? "题目尚未关联能力，暂不能分析缺口。" : "当前记录未显示待补齐项，可继续练习检验回答。"}</p> : null}
      {!data.preparations.length && !data.unavailable ? <Link href={learningHref} className="ui-link mt-3 inline-block text-sm">前往学习库</Link> : null}
    </section>

    <section aria-labelledby="insights-coverage-title" className="mb-9">
      <h2 id="insights-coverage-title" className="text-base font-semibold text-[var(--text-primary)]">能力覆盖</h2>
      <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">已准备是题目的手动状态；可用故事包含“可用”和“强故事”。</p>
      <div className="mt-4 divide-y divide-[var(--separator)]">
        {data.competencyCoverage.map((item) => <div key={item.tag} className="grid min-w-0 gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <h3 className="break-words text-sm font-medium text-[var(--text-primary)]">{item.label}</h3>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] leading-6 tabular-nums text-[var(--text-secondary)]">
            <span>{item.ready}/{item.total} 道已准备</span>{item.requiresStory ? <span>{item.strongStoryCount}/{item.storyCount} 个故事可用</span> : null}<span>{item.practiceCount} 次练习</span>
          </div>
        </div>)}
      </div>
      {!data.competencyCoverage.length ? <p className="mt-4 text-sm text-[var(--text-secondary)]">{data.unavailable ? "暂未读到能力覆盖资料。" : "还没有可分析的能力关联。"}</p> : null}
    </section>

    <section aria-labelledby="insights-stories-title" className="mb-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="insights-stories-title" className="text-base font-semibold text-[var(--text-primary)]">故事使用</h2>
        <Link href="/career/interview/stories" className="ui-link text-sm">管理故事</Link>
      </div>
      <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{data.storyUsage[0]?.source === "practice" ? "按已保存练习中记录的故事统计，比例为各故事的使用次数占比。" : "尚无实际故事使用记录，以下为题目母题的故事计划关联。"}</p>
      <ul className="mt-4 divide-y divide-[var(--separator)]">
        {data.storyUsage.map((item) => <li key={item.id}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-4 text-sm">
            {item.story ? <Link href={`/career/interview/stories/${item.id}`} className="ui-link min-w-0 break-words">{item.story.title}</Link> : <span className="text-[var(--text-secondary)]">已归档故事</span>}
            <span className="text-[13px] tabular-nums text-[var(--text-secondary)]">{item.count} {item.source === "practice" ? "次练习使用" : "个母题关联"}，占 {(item.share * 100).toFixed(0)}%</span>
          </div>
        </li>)}
      </ul>
      {!data.storyUsage.length ? <p className="mt-4 text-sm text-[var(--text-secondary)]">{data.unavailable ? "暂未读到故事使用资料。" : "还没有关联故事的题目或练习。"}</p> : null}
    </section>

    <details>
      <DisclosureSummary>练习趋势与常见卡点</DisclosureSummary>
      <div className="mt-5 grid gap-8 md:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">反复出现的卡点</h3>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">来自每次练习保存时勾选的卡点，可多选。</p>
          <ul className="mt-3 space-y-3">{data.issueCounts.slice(0, 10).map((item) => <li key={item.tag} className="flex justify-between gap-4 text-sm text-[var(--text-secondary)]"><span>{issueLabels[item.tag] ?? item.tag}</span><span className="shrink-0 tabular-nums">{item.count} 次</span></li>)}</ul>
          {!data.issueCounts.length ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{data.unavailable ? "暂未读到卡点记录。" : "还没有保存过卡点。"}</p> : null}
        </section>
        <section>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">每月练习记录</h3>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">每次平均卡点数受勾选习惯影响，不代表能力评分。</p>
          <ul className="mt-3 space-y-3">{data.monthlyTrend.map((item) => <li key={item.month} className="flex flex-wrap justify-between gap-2 text-[13px] text-[var(--text-secondary)]"><span>{item.month}</span><span className="tabular-nums">{item.attempts} 次练习，{item.issuesPerAttempt.toFixed(2)} 个卡点/次</span></li>)}</ul>
          {!data.monthlyTrend.length ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{data.unavailable ? "暂未读到月度记录。" : "保存练习后显示月度记录。"}</p> : null}
        </section>
      </div>
    </details>
  </>;
}
