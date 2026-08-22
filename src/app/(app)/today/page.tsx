import { DashboardLayout } from "@/components/layout/page-layouts";
import { TodayWorkspaceLoader } from "@/components/today/today-workspace-loader";
import { getTodayWorkspace } from "@/features/today/queries";

export default async function TodayPage() {
  const initialWorkspace = await getTodayWorkspace();
  return <DashboardLayout className="p-0"><TodayWorkspaceLoader initialWorkspace={initialWorkspace} /></DashboardLayout>;
}
