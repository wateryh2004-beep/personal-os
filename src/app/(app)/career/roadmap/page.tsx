import { CareerNav } from "@/components/career/career-nav";
import { CareerRoadmapClient } from "@/components/career/roadmap/career-roadmap-client";
import { WorkspaceLayout } from "@/components/layout/page-layouts";
import { getCareerRoadmap } from "@/features/career/queries";
import { getDateKeyInTimeZone } from "@/lib/date-keys";

export default async function CareerRoadmapPage({ searchParams }: { searchParams: Promise<{ milestone?: string }> }) {
  const params = await searchParams;
  const { tracks, milestones, directions, timezone, unavailable } = await getCareerRoadmap();
  const todayDate = getDateKeyInTimeZone(new Date(), timezone)!;
  return <WorkspaceLayout className="flex flex-col bg-[var(--surface-canvas)] p-0">
    <div className="shrink-0 px-4 pt-1 sm:px-6 lg:px-8"><CareerNav current="/career/roadmap" /></div>
    {unavailable ? <p className="mx-4 rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-[12px] leading-5 text-amber-800 sm:mx-6 lg:mx-8">职业路线数据尚未完成升级。</p> : <CareerRoadmapClient key={params.milestone ?? "roadmap"} initialMilestoneId={params.milestone} tracks={tracks} milestones={milestones} directions={directions} todayDate={todayDate} />}
  </WorkspaceLayout>;
}
