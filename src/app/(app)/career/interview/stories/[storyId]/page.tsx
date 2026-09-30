import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { archiveInterviewStory, updateInterviewStory } from "@/features/interview/actions";
import { getInterviewStoryDetail } from "@/features/interview/queries";
import { storyStatusLabels } from "@/features/interview/constants";

export default async function InterviewStoryPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const data = await getInterviewStoryDetail(storyId);
  if (!data) notFound();
  const story: any = data.story;

  return (
    <>
      <PageHeader
        title={story.title}
        description={story.one_line || "把事实整理成可以在不同问题中复用的故事。"}
        eyebrow={<Link href="/career/interview/stories" className="hover:text-[var(--text-primary)]">面试准备 / 故事库</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/insights" />

      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
        <span>{storyStatusLabels[story.status] ?? story.status}</span>
        {data.competencies.slice(0, 5).map((item: any) => <span key={item.competency_id}>{item.competency.label}</span>)}
      </div>

      <form action={updateInterviewStory} className="max-w-3xl">
        <input type="hidden" name="story_id" value={story.id} />

        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-[var(--text-tertiary)]">故事标题</span>
            <input name="title" required defaultValue={story.title} className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] outline-none" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-[var(--text-tertiary)]">状态</span>
            <select name="status" defaultValue={story.status} className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] outline-none">
              {Object.entries(storyStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <label className="mt-4 grid gap-1.5">
          <span className="text-[11px] font-medium text-[var(--text-tertiary)]">对应经历</span>
          <select name="experience_id" defaultValue={story.experience_id ?? ""} className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] outline-none">
            <option value="">不绑定经历</option>
            {data.experiences.map((experience: any) => <option key={experience.id} value={experience.id}>{experience.organization}{experience.role ? ` · ${experience.role}` : ""}</option>)}
          </select>
        </label>

        <label className="mt-7 block">
          <span className="text-[11px] font-medium text-[var(--text-tertiary)]">一句话</span>
          <textarea name="one_line" defaultValue={story.one_line} rows={2} className="mt-1.5 w-full resize-y bg-transparent py-2 text-[15px] leading-7 text-[var(--text-primary)] outline-none" />
        </label>

        <div className="mt-7 space-y-6">
          <StoryField name="situation_markdown" label="Situation" value={story.situation_markdown} placeholder="发生了什么？只保留面试官需要知道的背景。" />
          <StoryField name="task_markdown" label="Task" value={story.task_markdown} placeholder="你真正承担的任务和边界是什么？" />
          <StoryField name="action_markdown" label="Action" value={story.action_markdown} rows={7} placeholder="你具体做了什么？判断、取舍、影响机制是什么？" />
          <StoryField name="result_markdown" label="Result" value={story.result_markdown} placeholder="形成了什么可验证结果？" />
          <StoryField name="reflection_markdown" label="Reflection" value={story.reflection_markdown} placeholder="这件事改变了你的什么方法或判断？" />
        </div>

        <button className="mt-7 rounded-[9px] bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-white">保存故事</button>
      </form>

      <section className="mt-12 max-w-3xl">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">可以回答</h2>
          <span className="text-[10.5px] text-[var(--text-tertiary)]">{data.archetypes.length} 个母题</span>
        </div>
        <div className="mt-3 space-y-px">
          {data.archetypes.map((item: any) => (
            <div key={item.archetype_id} className="rounded-[9px] px-2.5 py-2.5 hover:bg-[var(--surface-hover)]">
              <p className="text-[13px] text-[var(--text-primary)]">{item.archetype.title}</p>
              {item.fit_note ? <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{item.fit_note}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <form action={archiveInterviewStory} className="mt-10">
        <input type="hidden" name="story_id" value={story.id} />
        <button className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--danger)]">归档故事</button>
      </form>
    </>
  );
}

function StoryField({ name, label, value, placeholder, rows = 4 }: { name: string; label: string; value: string; placeholder: string; rows?: number }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-[var(--text-tertiary)]">{label}</span>
      <textarea name={name} defaultValue={value} rows={rows} placeholder={placeholder} className="mt-1.5 w-full resize-y bg-transparent py-2 text-[15px] leading-7 text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-tertiary)]" />
    </label>
  );
}
