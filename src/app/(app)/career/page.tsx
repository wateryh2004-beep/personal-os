import { CareerHomeView } from "@/components/career/career-home-view";
import { WorkspaceReadyMetric } from "@/components/performance/workspace-ready-metric";
import { getCareerHome } from "@/features/career/queries";

export default async function CareerPage() {
  const data = await getCareerHome();
  return <><WorkspaceReadyMetric workspace="career" /><CareerHomeView data={data} /></>;
}
