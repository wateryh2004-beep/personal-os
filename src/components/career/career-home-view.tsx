import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import type { getCareerHome } from "@/features/career/queries";
import { CareerContinue } from "@/components/career/career-continue";
import { formatDateTime } from "@/features/interview/utils";

type HomeResult = Awaited<ReturnType<typeof getCareerHome>>;
export type CareerHomeData = Omit<HomeResult, "recentReadings"> & { recentReadings?: HomeResult["recentReadings"] };

export function CareerHomeView({ data, showContinue = true }: { data: CareerHomeData; showContinue?: boolean }) {
  const targets = data.interviewTargets.filter((item) => item.status === "active").slice(0, 3);
  const targetIds = new Set(targets.map((target) => target.id));
  const readings = data.recentReadings ?? [];
  const duePreparations = data.interviewPreparations.filter((item) => item.context_id && targetIds.has(item.context_id) && item.status !== "paused" && (!item.next_practice_at || Date.parse(item.next_practice_at) <= data.now)).sort((a, b) => (a.next_practice_at ? Date.parse(a.next_practice_at) : 0) - (b.next_practice_at ? Date.parse(b.next_practice_at) : 0)).slice(0, 3);
  const nextInterview = targets.filter((target) => target.next_interview_at && Date.parse(target.next_interview_at) >= data.now).sort((a, b) => Date.parse(a.next_interview_at!) - Date.parse(b.next_interview_at!))[0];

  return <>
    <PageHeader title="目标岗位" description={data.profile?.professional_headline || "从目标岗位出发，阅读已整理的内容，再练习一次。"}
      action={<Link href="/career/interview" className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-4 text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--surface-selected)]">打开面试学习 →</Link>} />
    <CareerNav current="/career" />
    {data.unavailable ? <p role="status" className="mb-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">部分职业数据暂时不可用，以下内容可能不完整。</p> : null}

    <section aria-labelledby="career-targets-heading" className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="career-targets-heading" className="text-[16px] font-medium text-[var(--text-primary)]">当前关注</h2>
        <Link href="/career/interview" className="inline-flex min-h-9 items-center text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">全部岗位 →</Link>
      </div>
      <div className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
        {targets.map((target) => {
          const preparations = data.interviewPreparations.filter((prep) => prep.context_id === target.id && prep.status !== "paused");
          const due = preparations.filter((prep) => !prep.next_practice_at || Date.parse(prep.next_practice_at) <= data.now).length;
          return <article key={target.id} className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              {target.organization_snapshot ? <p className="mb-1 text-[12px] font-medium text-[var(--text-secondary)]">{target.organization_snapshot}</p> : null}
              <h3 className="break-words text-[19px] font-medium tracking-[-0.015em] text-[var(--text-primary)]"><Link href={`/career/interview?context=${target.id}`} className="hover:text-[var(--accent)]">{target.role_title_snapshot || target.title}</Link></h3>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-tertiary)]"><span>{preparations.length ? `${preparations.length} 道学习内容` : "学习内容待整理"}</span>{due ? <span>{due} 道待练</span> : null}{target.next_interview_at ? <span>面试 · {formatDateTime(target.next_interview_at)}</span> : null}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <Link href={`/career/interview?context=${target.id}`} className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--surface-control)] px-4 font-medium text-[var(--text-primary)] hover:bg-[var(--surface-control-hover)]">阅读岗位内容 →</Link>
              <Link href={`/career/interview/practice?context=${target.id}`} className="inline-flex min-h-11 items-center px-1 text-[var(--text-secondary)] hover:text-[var(--accent)]">练习</Link>
            </div>
          </article>;
        })}
        {!targets.length ? <div className="max-w-2xl py-6"><p className="text-[15px] text-[var(--text-primary)]">从一个想去的岗位开始</p><p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">把岗位描述交给 Codex / Claude，整理岗位要求、经历依据与面试学习内容。写入后，这里会显示你的目标和下一步练习。</p><Link href="/career/interview" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)]">先阅读通用面试内容 →</Link></div> : null}
      </div>
    </section>

    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)] lg:gap-12">
      <section aria-labelledby="career-reading-heading">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3"><h2 id="career-reading-heading" className="text-[16px] font-medium text-[var(--text-primary)]">继续阅读</h2><Link href="/career/interview" className="inline-flex min-h-9 items-center text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">搜索学习内容 →</Link></div>
        {showContinue ? <CareerContinue /> : null}
        {readings.length ? <><p className="mb-2 text-[12px] text-[var(--text-tertiary)]">最近更新</p><div className="divide-y divide-[var(--separator)]">{readings.slice(0, 4).map((reading) => {
          const params = new URLSearchParams({ question: reading.questionId });
          if (reading.contextId) params.set("context", reading.contextId);
          const target = targets.find((item) => item.id === reading.contextId);
          return <Link key={reading.id} href={`/career/interview?${params}`} className="group block py-4">
            <p className="text-[15px] leading-6 text-[var(--text-primary)] group-hover:text-[var(--accent)]">{reading.title}</p>
            {reading.summary ? <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{reading.summary}</p> : null}
            <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">{target ? target.organization_snapshot || target.title : "通用面试"} · {new Date(reading.updatedAt).toLocaleDateString("zh-CN", { timeZone: "UTC" })}</p>
          </Link>;
        })}</div></> : <p className="text-sm leading-7 text-[var(--text-secondary)]">从面试学习中选择一个问题，阅读思路与参考答案。上次阅读的位置会保留在这里。</p>}
      </section>

      <aside className="space-y-8">
        <section aria-labelledby="career-practice-heading" className="rounded-[var(--radius-lg)] bg-[var(--surface-control)] px-5 py-5">
          <h2 id="career-practice-heading" className="text-[16px] font-medium text-[var(--text-primary)]">下一次练习</h2>
          {nextInterview ? <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">最近面试：{nextInterview.organization_snapshot || nextInterview.title} · {formatDateTime(nextInterview.next_interview_at)}</p> : null}
          {duePreparations.length ? <div className="mt-3 divide-y divide-[var(--separator)]">{duePreparations.map((preparation) => {
            const reading = readings.find((item) => item.id === preparation.id);
            const target = targets.find((item) => item.id === preparation.context_id);
            return <Link key={preparation.id} href={`/career/interview/practice/${preparation.id}`} className="block py-3 text-[14px] leading-6 text-[var(--text-primary)] hover:text-[var(--accent)]">{reading?.title || `${target?.role_title_snapshot || target?.title || "目标岗位"} · 练习一道题`} →</Link>;
          })}</div> : <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{nextInterview ? "先读一遍岗位内容，再用自己的话讲一遍。" : "选一道熟悉的问题，合上答案，再讲一遍。"}</p>}
          <Link href={nextInterview ? `/career/interview/practice?context=${nextInterview.id}` : "/career/interview/practice"} className="mt-3 inline-flex min-h-11 items-center text-[13px] font-medium text-[var(--accent)]">打开练习队列 →</Link>
        </section>
        <section>
          <h2 className="text-[16px] font-medium text-[var(--text-primary)]">带着材料学习</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">需要核对经历或数据时，回到简历和原始证明材料。</p>
          <Link href="/career/materials" className="mt-2 inline-flex min-h-11 items-center text-[13px] font-medium text-[var(--accent)]">阅读我的材料 →</Link>
        </section>
      </aside>
    </div>
  </>;
}
