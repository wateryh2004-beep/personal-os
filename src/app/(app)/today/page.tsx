import { NowWorkspaceView } from "@/components/today/now-workspace";
import { DashboardLayout } from "@/components/layout/page-layouts";
import { getTodayWorkspace } from "@/features/today/queries";
export default async function TodayPage() { return <DashboardLayout className="p-0"><NowWorkspaceView workspace={await getTodayWorkspace()} /></DashboardLayout>; }
