import { CareerNav } from "@/components/career/career-nav";
import { CareerRoadmapClient } from "@/components/career/roadmap/career-roadmap-client";
import { getCareerRoadmap } from "@/features/career/queries";

export default async function CareerRoadmapPage() {
  const { tracks, milestones, directions, unavailable } = await getCareerRoadmap();
  return <>
    <CareerNav current="/career/roadmap" />
    {unavailable ? <p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-800">职业路线数据库尚未升级。应用 migration 后即可使用。</p> : <CareerRoadmapClient tracks={tracks} milestones={milestones} directions={directions} />}
  </>;
}
