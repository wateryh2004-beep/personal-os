import { getNoteDocumentBootstrap } from "@/features/notes/server-bootstrap";
import { NoteRouteDocument } from "@/components/notes/note-route-document";

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  const bootstrap = getNoteDocumentBootstrap(noteId);
  return <NoteRouteDocument key={noteId} noteId={noteId} bootstrap={bootstrap} />;
}
