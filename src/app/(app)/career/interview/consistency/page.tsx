import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { getNarrativeConsistencyData } from "@/features/interview/narrative-queries";
import {
  confirmNarrativeReference,
  registerNarrativeReference,
  selectNarrativeBaselineVersion,
} from "@/features/interview/narrative-actions";

const statusLabels = {
  stale: "引用版本已变化",
  needs_link: "需要建立关联",
  needs_review: "待人工核对",
  linked: "已登记并核对",
} as const;

export default async function InterviewConsistencyPage() {
  const { narratives, versionsByNarrative, rows, summary } = await getNarrativeConsistencyData();

  return <>
    <PageHeader
      title="内容一致性"
      description="跟踪自我介绍的母版版本和事实引用。自动识别版本漂移，但不把缺少证据判定为事实错误。"
      secondaryActions={<Link href="/career/interview" className="ui-link text-sm">返回面试学习</Link>}
    />
    <CareerNav current="/career/interview" />
    <InterviewNav current="/career/interview/consistency" />

    {!narratives.length ? (
      <section className="rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-7">
        <h2 className="text-lg font-semibold">尚无已登记的统一叙事母版</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          如已完成数据库迁移，请检查通用自我介绍的口述版本。创建或选择母版基线后才会出现岗位引用状态；系统不会把缺失记录报告为“全部一致”。
        </p>
        <Link href="/career/interview" className="ui-link mt-4 inline-block text-sm">查看通用自我介绍</Link>
      </section>
    ) : <>
      <dl className="mb-8 grid grid-cols-2 gap-5 border-y border-[var(--separator)] py-5 sm:grid-cols-4">
        <div><dt className="text-[13px] text-[var(--text-secondary)]">岗位版本</dt><dd className="mt-2 text-2xl tabular-nums">{summary.total}</dd></div>
        <div><dt className="text-[13px] text-[var(--text-secondary)]">需检查版本变更</dt><dd className="mt-2 text-2xl tabular-nums">{summary.stale}</dd></div>
        <div><dt className="text-[13px] text-[var(--text-secondary)]">尚未建立引用</dt><dd className="mt-2 text-2xl tabular-nums">{summary.needsLink}</dd></div>
        <div><dt className="text-[13px] text-[var(--text-secondary)]">已绑定，待核对</dt><dd className="mt-2 text-2xl tabular-nums">{summary.needsReview}</dd></div>
      </dl>

      <section aria-labelledby="narrative-master-title" className="mb-9 rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="narrative-master-title" className="text-lg font-semibold">个人叙事母版</h2>
          <span className="text-[13px] text-[var(--text-secondary)]">切换版本后立即重新计算下方引用状态</span>
        </div>
        <div className="space-y-6">
          {narratives.map((narrative) => {
            const options = versionsByNarrative[narrative.id] ?? [];
            return <div key={narrative.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-medium">{narrative.title}</h3>
                <span className="text-xs text-[var(--text-secondary)]">
                  {narrative.review_status === "approved" ? "母版已确认" : "母版待确认（草稿基线）"}
                </span>
              </div>
              <form action={selectNarrativeBaselineVersion} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="narrative_id" value={narrative.id}/>
                <label className="flex min-w-[220px] flex-1 flex-col gap-2 text-sm" htmlFor={`baseline-${narrative.id}`}>
                  <span className="text-[13px] text-[var(--text-secondary)]">当前选定的母版版本</span>
                  <select id={`baseline-${narrative.id}`} name="selected_version_id"
                    defaultValue={narrative.selected_version_id}
                    className="min-h-11 w-full rounded-lg border border-[var(--separator)] bg-[var(--surface-canvas)] px-3 text-base">
                    {options.map((v) => <option value={v.id} key={v.id}>
                      {v.language.toUpperCase()} · v{v.version_number} · {v.status === "current" ? "已采纳" : "AI或人工草稿"}
                    </option>)}
                  </select>
                </label>
                <button type="submit" className="ui-navigation-item min-h-11 rounded-lg border border-[var(--separator)] px-4 text-sm font-medium">
                  更新基线
                </button>
              </form>
              <p className="text-[13px] leading-6 text-[var(--text-secondary)]">
                更新基线只影响审计结果，不修改任何岗位答案，也不自动确认草稿。新生成的草稿不会自行替换当前基线。
              </p>
            </div>;
          })}
        </div>
      </section>

      <section aria-labelledby="narrative-audit-title" className="mb-9">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="narrative-audit-title" className="text-lg font-semibold">岗位答案引用</h2>
          <span className="text-[13px] text-[var(--text-secondary)]">
            {summary.total - summary.noFactReferences}/{summary.total} 份已有逐条事实版本绑定
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
          “版本已变化”是可以确定的结构性差异；“待人工核对”表示缺少语义确认，均不代表发现了真实履历矛盾。
          旧版答案和历史快照继续保留。
        </p>
        <div className="mt-5 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
          {rows.map((row) => {
            const link = row.preparation.context_id && row.answer
              ? `/career/interview/questions/${row.preparation.question_id}?context=${encodeURIComponent(row.preparation.context_id)}&answer=${row.answer.id}`
              : `/career/interview/questions/${row.preparation.question_id}`;
            return <article key={row.preparation.id} className="grid gap-3 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words text-[15px] font-medium">{row.preparation.target_title}</h3>
                  <span className="text-xs text-[var(--text-secondary)]">{statusLabels[row.state]}</span>
                </div>
                <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                  {row.answer ? `${row.answer.language.toUpperCase()} · 口述 v${row.answer.version_number} · ${row.answer.status === "current" ? "已采纳" : "草稿"}` : "尚无口述稿"}
                  {row.link ? ` · 引用母版版本 ${row.link.based_on_version_id.slice(0,8)}` : ""}
                </p>
                <ul className="mt-3 space-y-1.5 text-[13px] leading-6 text-[var(--text-secondary)]">
                  {row.findings.filter((finding) => finding.code !== "fact_missing").map((finding) =>
                    <li key={finding.code}>{finding.label}</li>
                  )}
                  {!row.factReferenceCount ? <li>事实版本引用尚未建立，实际内容准确性仍需人工核验</li> : null}
                </ul>
                {row.state === "linked" ? <p className="mt-2 text-[13px] text-[var(--text-secondary)]">引用关系已核对；不等于全文事实已经经过外部认证。</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <Link href={link} className="ui-link inline-flex min-h-11 items-center text-sm">查看答案</Link>
                {row.answer && row.narrative && !row.link ? (
                  <form action={registerNarrativeReference}>
                    <input type="hidden" name="narrative_id" value={row.narrative.id}/>
                    <input type="hidden" name="answer_version_id" value={row.answer.id}/>
                    <button type="submit" className="min-h-11 rounded-lg border border-[var(--separator)] px-3 text-sm">
                      登记引用（待审）
                    </button>
                  </form>
                ) : null}
                {row.link && row.narrative && row.link.based_on_version_id === row.narrative.selected_version_id && row.link.review_state === "unreviewed" ? (
                  <form action={confirmNarrativeReference} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="link_id" value={row.link.id}/>
                    <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                      <input type="checkbox" name="review_ack" value="yes" required className="h-4 w-4"/>
                      已逐段核对
                    </label>
                    <button type="submit" className="min-h-11 rounded-lg border border-[var(--separator)] px-3 text-sm">
                      确认引用关系
                    </button>
                  </form>
                ) : null}
              </div>
            </article>;
          })}
        </div>
        {!rows.length ? <p className="mt-5 text-sm text-[var(--text-secondary)]">当前没有可审计的岗位自我介绍准备。</p> : null}
      </section>
    </>}
  </>;
}
