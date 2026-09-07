import { TaskWorkspaceLoader } from "@/components/tasks/task-workspace-loader";
import { getMicrosoftTodoWorkspace } from "@/features/tasks/queries";
import { getLocalTaskDayBounds } from "@/features/tasks/task-view";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ create?: string; task?: string }> }) {
  const workspacePromise = getMicrosoftTodoWorkspace();
  const initialDayBounds = getLocalTaskDayBounds();
  const [params, initialWorkspace] = await Promise.all([searchParams, workspacePromise]);
  return (
    <TaskWorkspaceLoader
      initialWorkspace={initialWorkspace}
      initialDayBounds={initialDayBounds}
      initialCreateOpen={params.create === "1"}
      initialTaskId={params.task}
    />
  );
}
