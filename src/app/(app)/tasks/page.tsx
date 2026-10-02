import { TaskWorkspaceLoader } from "@/components/tasks/task-workspace-loader";
import { getLocalTaskDayBounds } from "@/features/tasks/task-view";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ create?: string; task?: string }> }) {
  const params = await searchParams;
  return <TaskWorkspaceLoader initialDayBounds={getLocalTaskDayBounds()} initialCreateOpen={params.create === "1"} initialTaskId={params.task} />;
}
