import { NotesWorkspaceShellLoader } from "@/components/notes/notes-workspace-shell-loader";

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return <NotesWorkspaceShellLoader>{children}</NotesWorkspaceShellLoader>;
}
