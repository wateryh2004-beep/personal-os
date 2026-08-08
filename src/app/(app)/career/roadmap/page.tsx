import { CareerNav } from "@/components/career/career-nav";
import { CareerRoadmapClient } from "@/components/career/roadmap/career-roadmap-client";
import { WorkspaceLayout } from "@/components/layout/page-layouts";
import { getCareerRoadmap } from "@/features/career/queries";

export default async function CareerRoadmapPage() {
  const { tracks, milestones, directions, unavailable } = await getCareerRoadmap();
  return <WorkspaceLayout className="flex flex-col bg-[var(--surface-canvas)] p-0">
    <div className="shrink-0 px-4 pt-2"><CareerNav current="/career/roadmap" /></div>
    {unavailable ? <p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-800">职业路线数据库尚未升级。应用 migration 后即可使用。</p> : <CareerRoadmapClient tracks={tracks} milestones={milestones} directions={directions} />}
  </WorkspaceLayout>;
}
