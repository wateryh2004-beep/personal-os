import { ProjectsWorkspace } from "@/components/projects/projects-workspace";
import { getProjects } from "@/features/projects/queries";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const [{ projects, unavailable }, params] = await Promise.all([getProjects(), searchParams]);
  if (unavailable) return <p role="alert" className="max-w-xl rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-[12px] leading-5 text-amber-900">项目数据暂时无法读取，请稍后重试。</p>;
  return <ProjectsWorkspace projects={projects} initialCreateOpen={params.create === "1"} />;
}
