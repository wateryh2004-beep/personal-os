import { ProjectsWorkspace } from "@/components/projects/projects-workspace";
import { getProjects } from "@/features/projects/queries";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const [{ projects, unavailable }, params] = await Promise.all([getProjects(), searchParams]);
  if (unavailable) return <p role="alert" className="border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-900">Projects 数据暂时无法读取，请检查数据库连接后重试。</p>;
  return <ProjectsWorkspace projects={projects} initialCreateOpen={params.create === "1"} />;
}
