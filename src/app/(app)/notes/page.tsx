import { Suspense } from "react";
import { NotesWorkspaceLoader, NotesShell } from "@/components/notes/notes-workspace-loader";
import { getNotesServerBootstrap } from "@/features/notes/server-bootstrap";

type Params = Promise<{ folder?: string; daily?: string; view?: string }>;
async function NotesData({ searchParams }: { searchParams: Params }) {
  const [params, bootstrap] = await Promise.all([searchParams, getNotesServerBootstrap()]);
  return <NotesWorkspaceLoader folderId={params.folder} initialView={params.view === "favorites" ? "favorites" : params.view === "recent" ? "recent" : "all"} dailyError={params.daily === "error"} bootstrap={bootstrap} />;
}
export default function Notes({ searchParams }: { searchParams: Params }) {
  return <Suspense fallback={<NotesShell />}><NotesData searchParams={searchParams} /></Suspense>;
}
