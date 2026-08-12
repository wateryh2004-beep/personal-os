import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";
import { getNotesNavigator } from "@/features/notes/queries";

export default async function NotesLayout({ children }: { children: React.ReactNode }) {
  const { folders, notes } = await getNotesNavigator();
  return <NotesWorkspaceShell folders={folders} notes={notes}>{children}</NotesWorkspaceShell>;
}
