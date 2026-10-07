import { NotesRouteWorkspace } from "@/components/notes/notes-route-workspace";
import { getNotesServerBootstrap } from "@/features/notes/server-bootstrap";

export default async function Notes({ searchParams }: { searchParams: Promise<{ folder?: string; daily?: string; view?: string }> }) {
  const bootstrap = getNotesServerBootstrap();
  const params = await searchParams;
  return <NotesRouteWorkspace folderId={params.folder} initialView={params.view === "favorites" ? "favorites" : params.view === "recent" ? "recent" : "all"} dailyError={params.daily === "error"} bootstrap={bootstrap} />;
}
