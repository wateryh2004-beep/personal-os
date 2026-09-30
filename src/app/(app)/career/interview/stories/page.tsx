import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createInterviewStory } from "@/features/interview/actions";
import { getInterviewStories } from "@/features/interview/queries";
import { storyStatusLabels } from "@/features/interview/constants";

export default async function InterviewStoriesPage() {
  const data = await getInterviewStories();

  return (
    <>
      <PageHeader
        title="故事库"
        description="把经历拆成可以反复调用的证据故事，而不是为每道题重新写一篇答案。"
        eyebrow={<Link href="/career/interview/insights" className="hover:text-[var(--text-primary)]">面试准备 / 复盘</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/insights" />

      <div className="mb-7 flex items-center justify-between gap-4">
        <p className="text-[11px] text-[var(--text-tertiary)]">{data.stories.length} 个故事资产</p>
        <details className="relative">
          <summary className="pressable cursor-pointer list-none rounded-[8px] px-2 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">+ 新故事</summary>
          <form action={createInterviewStory} className="absolute right-0 z-30 mt-2 grid w-[min(620px,90vw)] gap-3 rounded-[14px] border border-[var(--separator)] bg-[var(--material-popover)] p-4 shadow-[var(--shadow-popover)]">
            <input name="title" required placeholder="故事标题，例如：Viewer 权限原则重构" className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] outline-none" />
            <select name="experience_id" defaultValue="" className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] outline-none">
              <option value="">不绑定经历</option>
              {data.experiences.map((experience: any) => <option key={experience.id} value={experience.id}>{experience.organization}{experience.role ? ` · ${experience.role}` : ""}</option>)}
            </select>
            <textarea name="one_line" rows={2} placeholder="一句话：这段故事证明了什么？" className="resize-none rounded-[9px] bg-[var(--surface-control)] px-3 py-2 text-[13px] outline-none" />
            <input type="hidden" name="situation_markdown" value="" />
            <input type="hidden" name="task_markdown" value="" />
            <input type="hidden" name="action_markdown" value="" />
            <input type="hidden" name="result_markdown" value="" />
            <input type="hidden" name="reflection_markdown" value="" />
            <input type="hidden" name="status" value="draft" />
            <button className="pressable w-fit rounded-[9px] bg-[var(--text-primary)] px-3 py-2 text-[13px] font-medium text-white">创建</button>
          </form>
        </details>
      </div>

      <div className="space-y-px">
        {data.stories.map((story: any) => (
          <Link
            key={story.id}
            href={`/career/interview/stories/${story.id}`}
            className="group grid min-h-16 gap-1 rounded-[10px] px-2.5 py-3 transition-colors ui-transition hover:bg-[var(--surface-hover)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[13.5px] font-medium text-[var(--text-primary)]">{story.title}</h2>
                <span className="text-[10.5px] text-[var(--text-tertiary)]">{storyStatusLabels[story.status] ?? story.status}</span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--text-secondary)]">{story.one_line || "尚未提炼一句话。"}</p>
              <p className="mt-1 text-[10.5px] text-[var(--text-tertiary)]">
                {story.experience ? `${story.experience.organization}${story.experience.role ? ` · ${story.experience.role}` : ""}` : "未绑定经历"}
              </p>
            </div>
            <div className="mt-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[var(--text-tertiary)] sm:mt-0 sm:justify-end">
              <span>{story.archetypeCount} 个母题</span>
              {story.competencies.slice(0, 3).map((item: any) => <span key={item.id}>{item.label}</span>)}
            </div>
          </Link>
        ))}
      </div>

      {!data.stories.length ? <p className="py-14 text-[13px] text-[var(--text-tertiary)]">还没有故事。先把一段经历拆成一个可以复用的具体事件。</p> : null}
    </>
  );
}
