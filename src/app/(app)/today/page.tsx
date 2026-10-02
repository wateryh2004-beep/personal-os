import { TodayWorkspaceLoader } from "@/components/today/today-workspace-loader";
import { getTodayWorkspace } from "@/features/today/queries";

export default async function TodayPage() {
  const initialWorkspace = await getTodayWorkspace();
  // NowWorkspaceView owns its responsive width and gutters, just like the
  // edge-to-edge Tasks and Calendar workspaces.
  return <TodayWorkspaceLoader initialWorkspace={initialWorkspace} />;
}
