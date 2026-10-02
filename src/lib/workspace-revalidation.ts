import { revalidatePath as revalidateNextPath } from "next/cache";
import { cookies } from "next/headers";

export const workspaceRevisionCookie = "personal-os-workspace-revision";

/** Preserve Next invalidation and notify the memory-only read models after writes.
 * Cookie updates in Server Actions rerender layouts without remounting editors.
 * This is an opaque cache revision, never an authentication/authorization input.
 */
export async function revalidatePath(path: string, type?: "page" | "layout") {
  if (/^\/(today|tasks|calendar|notes)(?:\/|$)/.test(path)) {
    (await cookies()).set(workspaceRevisionCookie, crypto.randomUUID(), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    });
  }
  revalidateNextPath(path, type);
}
