import { TaskWorkspaceLoader } from "@/components/tasks/task-workspace-loader";
import { getMicrosoftTodoWorkspace } from "@/features/tasks/queries";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ create?: string; task?: string }> }) {
  const workspacePromise = getMicrosoftTodoWorkspace();
  const [params, initialWorkspace] = await Promise.all([searchParams, workspacePromise]);
  return <TaskWorkspaceLoader initialWorkspace={initialWorkspace} initialCreateOpen={params.create === "1"} initialTaskId={params.task} />;
}
