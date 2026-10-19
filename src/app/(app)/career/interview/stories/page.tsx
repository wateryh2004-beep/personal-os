import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { StoryLibrary } from "@/components/career/interview/story-library";
import { StoryFormDialog } from "@/components/career/interview/story-form-dialog";
import { getInterviewStories } from "@/features/interview/queries";

export default async function InterviewStoriesPage() {
  const data = await getInterviewStories();
  // The browser only needs catalog metadata; full STAR prose stays on the detail route.
  const rows = data.stories.map(story => ({
    id: story.id, title: story.title, oneLine: story.one_line, status: story.status,
    experienceId: story.experience_id,
    experienceLabel: story.experience ? `${story.experience.organization}${story.experience.role ? ` · ${story.experience.role}` : ""}` : story.experience_id ? "原关联经历不可用" : "",
    competencies: story.competencies.map(item => ({ id: item.id, label: item.label })), archetypeCount: story.archetypeCount,
  }));
  return <>
    <PageHeader title="故事库" secondaryActions={<Link href="/career/interview/insights" className="ui-link inline-flex min-h-11 items-center text-sm">查看复盘</Link>} />
    <CareerNav current="/career/interview" />
    <InterviewNav current="/career/interview/stories" />
    <StoryLibrary rows={rows} unavailable={data.unavailable} createControl={<StoryFormDialog experiences={data.experiences} />} />
  </>;
}
