import { requireOwner } from "@/lib/auth/require-owner";
import { getNotesWorkspace } from "./queries";

/** Private metadata only; this read performs no write or reminder reconciliation. */
export async function getNotesServerBootstrap() {
  const owner = await requireOwner();
  const data = await getNotesWorkspace(owner);
  return { ownerId: owner.userId, generatedAt: Date.now(), data };
}
