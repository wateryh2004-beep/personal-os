import { WorkspaceReadyMetric } from "@/components/performance/workspace-ready-metric";
import { LeisureHome } from "@/components/leisure/leisure-home";
import { getLeisureExperiences } from "@/features/leisure/queries";

export const metadata = { title: "闲暇 · Personal OS" };
export default async function LeisurePage() {
  const { experiences, unavailable, hasMore } = await getLeisureExperiences();
  return <><WorkspaceReadyMetric workspace="leisure" /><LeisureHome experiences={experiences} unavailable={unavailable} hasMore={hasMore} /></>;
}
