import { NotesWorkspaceLoader } from "@/components/notes/notes-workspace-loader";
import { getNotesWorkspace } from "@/features/notes/queries";

export default async function Notes({ searchParams }: { searchParams: Promise<{ folder?: string; daily?: string; view?: string }> }) {
  const workspacePromise = getNotesWorkspace();
  const [{ folder: requestedFolder, daily, view }, initialWorkspace] = await Promise.all([searchParams, workspacePromise]);
  return <NotesWorkspaceLoader initialWorkspace={initialWorkspace} folderId={requestedFolder} initialView={view === "favorites" ? "favorites" : view === "recent" ? "recent" : "all"} dailyError={daily === "error"} />;
}
