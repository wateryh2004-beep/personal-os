import { getNoteDocumentBootstrap } from "@/features/notes/server-bootstrap";
import { NoteRouteDocument } from "@/components/notes/note-route-document";
import { parseSourceLocator } from "@/features/links/source-locator";
import { NoteSourceExcerpt } from "@/components/notes/note-source-excerpt";

export default async function NotePage({ params, searchParams }: { params: Promise<{ noteId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { noteId } = await params;
  const search = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (typeof value === "string") query.set(key, value);
  const locator = parseSourceLocator(`/notes/${noteId}?${query}`);
  const bootstrap = getNoteDocumentBootstrap(noteId);
  return <div className="flex h-full min-h-0 flex-col">{locator?.kind === "note" ? <NoteSourceExcerpt locator={locator} /> : null}<div className="min-h-0 flex-1"><NoteRouteDocument key={noteId} noteId={noteId} bootstrap={bootstrap} /></div></div>;
}
