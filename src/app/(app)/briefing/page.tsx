import { BriefingWorkspaceView } from "@/components/briefing/briefing-workspace-view";
import { getBriefingWorkspace } from "@/features/briefing/queries";
export default async function BriefingPage() {
  return <BriefingWorkspaceView data={await getBriefingWorkspace()} />;
}
