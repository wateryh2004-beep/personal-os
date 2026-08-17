import { TaskWorkspaceLoader } from "@/components/tasks/task-workspace-loader";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ create?: string; task?: string }> }) {
  const params = await searchParams;
  return <TaskWorkspaceLoader initialCreateOpen={params.create === "1"} initialTaskId={params.task} />;
}
