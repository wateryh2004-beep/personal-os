import { AppShell } from "@/components/layout/app-shell";

// Private routes depend on the request session. Never prerender a user's app
// view at build time or cache it across users.
export const dynamic = "force-dynamic";

/**
 * Keep the shared shell free of request-time data. App access is enforced in
 * the server-side proxy, while pages with private data and all mutations still
 * call requireOwner(). This lets Next.js keep the shell interactive during a
 * route transition instead of waiting for an auth round trip first.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
