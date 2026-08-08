import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { getNotesWorkspace } from "@/features/notes/queries";

export default async function Notes({ searchParams }: { searchParams: Promise<{ folder?: string; daily?: string; view?: string }> }) {
  const { notes, folders, timezone, state } = await getNotesWorkspace();
  const { folder: requestedFolder, daily, view } = await searchParams;
  const selectedFolder = folders.find((folder) => folder.id === requestedFolder) ?? null;
  return <NotesWorkspace notes={notes} folders={folders} timezone={timezone} state={state} selectedFolder={selectedFolder} initialView={view === "favorites" ? "favorites" : view === "recent" ? "recent" : "all"} dailyError={daily === "error"} />;
}
