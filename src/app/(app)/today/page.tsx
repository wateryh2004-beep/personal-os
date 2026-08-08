import { NowWorkspaceView } from "@/components/today/now-workspace";
import { getTodayWorkspace } from "@/features/today/queries";
export default async function TodayPage() { return <NowWorkspaceView workspace={await getTodayWorkspace()} />; }
