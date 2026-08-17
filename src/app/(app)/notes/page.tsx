import { NotesWorkspaceLoader } from "@/components/notes/notes-workspace-loader";

export default async function Notes({ searchParams }: { searchParams: Promise<{ folder?: string; daily?: string; view?: string }> }) {
  const { folder: requestedFolder, daily, view } = await searchParams;
  return <NotesWorkspaceLoader folderId={requestedFolder} initialView={view === "favorites" ? "favorites" : view === "recent" ? "recent" : "all"} dailyError={daily === "error"} />;
}
