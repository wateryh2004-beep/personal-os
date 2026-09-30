import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { createCareerApplication, transitionCareerApplication } from "@/features/career/actions";
import { getApplications } from "@/features/career/queries";

const stages = [
  ["draft","草稿"],
  ["preparing","准备中"],
  ["submitted","已投递"],
  ["interviewing","面试中"],
  ["offer","Offer"],
  ["rejected","未通过"],
  ["withdrawn","已撤回"],
  ["closed","已结束"],
] as const;

const stageLabel = Object.fromEntries(stages);
const controlClass = "h-9 rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]";
const labelClass = "grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]";

export default async function ApplicationsPage() {
  const data = await getApplications();

  return (
    <>
      <PageHeader title="申请" description="只保留真实投递和阶段变化。" />
      <CareerNav current="/career/applications" />

      {data.unavailable ? (
        <p className="mb-6 rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-[12px] leading-5 text-amber-800">
          申请历史数据暂时不可用。
        </p>
      ) : null}

      <div className="mb-7 flex justify-end">
        <details>
          <summary className="pressable cursor-pointer list-none rounded-[8px] px-1.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            + 新建申请
          </summary>
          <form action={createCareerApplication} className="mt-3.5 grid gap-3.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4.5 shadow-[var(--shadow-hairline)] backdrop-blur-xl md:grid-cols-3">
            <label className={labelClass}>
              <span>机会</span>
              <select required name="opportunity_id" className={controlClass}>
                <option value="">选择机会</option>
                {data.opportunities.map((item) => <option key={item.id} value={item.id}>{item.organization} · {item.role_title}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              <span>简历版本</span>
              <select name="resume_version_id" className={controlClass}>
                <option value="">尚未确定</option>
                {data.resumes.map((item) => <option key={item.id} value={item.id}>{item.title}{item.status !== "approved" ? "（草稿）" : ""}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              <span>初始阶段</span>
              <select name="status" defaultValue="preparing" className={controlClass}>
                {stages.slice(0,3).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              <span>投递时间</span>
              <input name="applied_at" type="datetime-local" className={controlClass}/>
            </label>
            <label className={`${labelClass} md:col-span-3`}>
              <span>备注</span>
              <textarea name="notes_markdown" rows={3} className={`min-h-20 resize-y py-2.5 leading-5 ${controlClass}`}/>
            </label>
            <button disabled={!data.opportunities.length} className="pressable h-9 w-fit rounded-[10px] bg-[var(--accent)] px-3.5 text-[13px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-40">
              创建
            </button>
          </form>
        </details>
      </div>

      <div className="space-y-px">
        {data.applications.map((application) => {
          const opportunity = Array.isArray(application.career_opportunities) ? application.career_opportunities[0] : application.career_opportunities;
          const resume = Array.isArray(application.resume_versions) ? application.resume_versions[0] : application.resume_versions;
          const history = data.events.filter((event) => event.application_id === application.id);

          return (
            <article key={application.id} className="rounded-[10px] px-2.5 py-3.5 transition-colors ui-transition hover:bg-[var(--surface-hover)]">
              <div className="grid gap-1.5 sm:grid-cols-[1fr_auto] sm:items-start">
                <div>
                  <h2 className="text-[13.5px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">{opportunity?.role_title || "未知岗位"}</h2>
                  <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{opportunity?.organization || "未知组织"}</p>
                </div>
                <p className="text-[11px] leading-5 text-[var(--text-tertiary)]">{stageLabel[application.status] ?? application.status}</p>
              </div>

              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
                {resume?.title ? <span>{resume.title}</span> : null}
                {application.applied_at ? <span>{new Date(application.applied_at).toLocaleString("zh-CN")}</span> : null}
              </div>

              <details className="mt-2">
                <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[11px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
                  更新与历史
                </summary>
                <form action={transitionCareerApplication} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="application_id" value={application.id}/>
                  <input type="hidden" name="note" value=""/>
                  <select name="status" defaultValue={application.status} className={`${controlClass} h-8 px-2.5 text-[12px]`}>
                    {stages.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button className="pressable h-8 rounded-[8px] px-2 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">
                    更新阶段
                  </button>
                </form>

                {history.length ? (
                  <ol className="mt-3 space-y-1.5 border-l border-[var(--separator)] pl-3">
                    {history.map((event) => (
                      <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] leading-5 text-[var(--text-secondary)]">
                        <span>{event.from_status ? (stageLabel[event.from_status] ?? event.from_status) + " → " : ""}{stageLabel[event.to_status] ?? event.to_status}</span>
                        <time className="tabular-nums text-[var(--text-tertiary)]">{new Date(event.occurred_at).toLocaleString("zh-CN")}</time>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </details>
            </article>
          );
        })}
      </div>

      {!data.applications.length ? <div className="py-14 text-center text-[13px] text-[var(--text-tertiary)]">还没有申请记录。</div> : null}
    </>
  );
}
