import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { StoryFormDialog } from "@/components/career/interview/story-form-dialog";
import { StoryArchiveDialog } from "@/components/career/interview/story-archive-dialog";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { getInterviewStoryDetail } from "@/features/interview/queries";
import { storyEvidenceRoleLabels, storyStatusLabels } from "@/features/interview/constants";
import { storyFilters, storyLibraryHref, storySections, type EditableStory } from "@/features/interview/story-library";

type ReturnParams = Record<string, string | string[] | undefined>;
export default async function InterviewStoryPage({ params, searchParams }: { params: Promise<{ storyId: string }>; searchParams?: Promise<ReturnParams> }) {
  const [{ storyId }, returnParams] = await Promise.all([params, searchParams ?? Promise.resolve({} as ReturnParams)]);
  const data = await getInterviewStoryDetail(storyId);
  if (!data) notFound();
  const story = data.story;
  const query = new URLSearchParams();
  for (const key of ["q", "status", "experience", "competency"]) {
    const value = returnParams[key];
    if (value) query.set(key, Array.isArray(value) ? value[0] : value);
  }
  const returnHref = storyLibraryHref(storyFilters(query));
  const experience = data.experiences.find(item => item.id === story.experience_id);
  const editable: EditableStory = { id: story.id, title: story.title, one_line: story.one_line, status: story.status, experience_id: story.experience_id,
    situation_markdown: story.situation_markdown, task_markdown: story.task_markdown, action_markdown: story.action_markdown, result_markdown: story.result_markdown, reflection_markdown: story.reflection_markdown };
  return <>
    <div className="mb-4"><Link href={returnHref} className="ui-link inline-flex min-h-11 items-center text-sm">返回故事库</Link></div>
    <PageHeader title={story.title} description={story.one_line || undefined} action={<StoryFormDialog story={editable} experiences={data.experiences} />} />
    <CareerNav current="/career/interview" />
    <InterviewNav current="/career/interview/stories" />
    <p className="mb-6 text-sm text-[var(--text-secondary)]">使用状态：{storyStatusLabels[story.status] ?? story.status}</p>
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
      <article aria-label="故事正文" className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-7">
        <div className="space-y-8">
          {storySections.map(section => <section key={section.name} aria-labelledby={`story-${section.name}`}>
            <h2 id={`story-${section.name}`} className="mb-3 text-lg font-semibold text-[var(--text-primary)]">{section.label}</h2>
            {story[section.name]?.trim() ? <EntityMarkdown body={story[section.name]} headingOffset={2} className="min-w-0 text-base leading-7 [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:rounded-[var(--radius-md)] [&_pre]:bg-[var(--surface-control)] [&_pre]:text-[var(--text-primary)] [&_img]:max-w-full [&_p]:leading-7 [&_li]:leading-7" /> : <p className="text-sm leading-7 text-[var(--text-secondary)]">尚未补充{section.label}。</p>}
          </section>)}
        </div>
      </article>
      <aside aria-label="故事关联" className="min-w-0 space-y-8">
        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">关联经历</h2>
          {experience ? <Link href={`/career/experiences/${experience.id}`} className="ui-link mt-3 inline-block break-words text-sm leading-7">{experience.organization}{experience.role ? ` · ${experience.role}` : ""}</Link> : <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{story.experience_id ? "原关联经历已归档或暂不可用。" : "未绑定经历，可在编辑故事时选择。"}</p>}
        </section>
        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">关联能力</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-[13px] leading-6 text-[var(--text-secondary)]">{data.competencies.map(item => <li key={item.competency_id} className="rounded-[var(--radius-sm)] bg-[var(--surface-control)] px-2 py-1">{item.competency.label}{item.is_primary ? "（主要）" : ""}</li>)}</ul>
          {!data.competencies.length ? <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">尚未关联能力。</p> : null}
        </section>
        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">已关联母题</h2>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{data.archetypes.length} 个母题关联，不代表练习次数</p>
          <ul className="mt-3 divide-y divide-[var(--separator)]">{data.archetypes.map(item => <li key={item.archetype_id} className="py-3 text-sm leading-7">
            <h3 className="break-words font-medium text-[var(--text-primary)]">{item.archetype.title}</h3>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{storyEvidenceRoleLabels[item.evidence_role] ?? item.evidence_role}</p>
            {item.fit_note ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">{item.fit_note}</p> : null}
          </li>)}</ul>
          {!data.archetypes.length ? <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">尚未关联母题。</p> : null}
        </section>
        <details><DisclosureSummary>更多操作</DisclosureSummary><div className="mt-4"><StoryArchiveDialog storyId={story.id} title={story.title} /></div></details>
      </aside>
    </div>
  </>;
}
