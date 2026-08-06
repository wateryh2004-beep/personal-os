import { AppShell } from "@/components/layout/app-shell";
import { requireOwner } from "@/lib/auth/require-owner";

// Private routes depend on the request session. Never prerender a user's app
// view at build time or cache it across users.
export const dynamic = "force-dynamic";

/**
 * The proxy provides an early redirect, but it is intentionally not the
 * authorization boundary. Rendering the shell is private too: this server
 * layout checks the owner before emitting any navigation or application HTML.
 * React cache() inside requireOwner deduplicates this check within one RSC
 * render tree when a page independently asks for the current owner.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <AppShell>{children}</AppShell>;
}
