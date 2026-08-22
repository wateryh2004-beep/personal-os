import { NotesLiveWorkspaceShell } from "@/components/notes/notes-live-workspace-shell";
import { getNotesNavigator } from "@/features/notes/queries";

export default async function NotesLayout({ children }: { children: React.ReactNode }) {
  const { folders, notes } = await getNotesNavigator();
  return <NotesLiveWorkspaceShell folders={folders} notes={notes}>{children}</NotesLiveWorkspaceShell>;
}
