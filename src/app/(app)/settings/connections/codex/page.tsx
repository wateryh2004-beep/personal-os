import { z } from "zod";
import { CodexAuthorizationsView } from "@/components/settings/codex-authorization-view";
import { getGatewayConfig } from "@/features/content-gateway/config";
import { gatewayScopeSchema } from "@/features/content-gateway/contracts";
import { revokeCodexAuthorization } from "@/features/content-gateway/owner-actions";
import { requireOwner } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";

const grantSchema = z.object({
  id: z.string().uuid(), clientName: z.string().min(1).max(200),
  scope: gatewayScopeSchema.array().min(1).max(4), resource: z.string().url(),
  createdAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }), revokedAt: z.iso.datetime({ offset: true }).nullable(),
});

export default async function CodexConnectionsPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { supabase } = await requireOwner();
  const params = await searchParams;
  let configured = true;
  try { getGatewayConfig(); } catch { configured = false; }
  // Listing and revocation use the authenticated owner's RPCs, even if new
  // gateway connections have been disabled. Never hide an existing grant.
  let available = false;
  let grants: z.infer<typeof grantSchema>[] = [];
  try {
    const { data, error } = await supabase.rpc("list_content_authorizations");
    const parsed = grantSchema.array().safeParse(data);
    if (!error && parsed.success) { available = true; grants = parsed.data; }
  } catch { /* A missing migration or service outage is an unavailable state. */ }
  // eslint-disable-next-line react-hooks/purity -- The private dynamic server page supplies one request-time snapshot to the pure view.
  const now = Date.now();
  return <CodexAuthorizationsView grants={grants} available={available} configured={configured} revokeAction={revokeCodexAuthorization} revokeError={params.error === "revoke"} now={now} />;
}
