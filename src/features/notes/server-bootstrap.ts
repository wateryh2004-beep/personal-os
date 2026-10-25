import { requireOwner } from "@/lib/auth/require-owner";
import { getNoteDocument, getNotesWorkspace } from "./queries";

/** Private metadata only; this read performs no write or reminder reconciliation. */
export async function getNotesServerBootstrap() {
  const owner = await requireOwner();
  const data = await getNotesWorkspace(owner);
  return { ownerId: owner.userId, generatedAt: Date.now(), data };
}

/** Begin the body read independently of the route shell and inspector. */
export async function getNoteDocumentBootstrap(noteId: string) {
  const owner = await requireOwner();
  const generatedAt = Date.now();
  try {
    return { ownerId: owner.userId, generatedAt, data: await getNoteDocument(noteId, owner) };
  } catch {
    // Keep a warm document mounted when the server read fails. The client retries
    // through the owner-guarded API; authentication redirects above are not swallowed.
    return { ownerId: owner.userId, generatedAt, data: null, unavailable: true as const };
  }
}
