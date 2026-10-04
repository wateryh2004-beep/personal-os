import { z } from "zod";
import { CodexConsentView, type CodexConsentState } from "@/components/settings/codex-authorization-view";
import { getGatewayConfig } from "@/features/content-gateway/config";
import { gatewayScopeSchema } from "@/features/content-gateway/contracts";
import { getRegisteredGatewayClient, validatePendingAuthorization } from "@/features/content-gateway/oauth";
import { GatewayOAuthError } from "@/features/content-gateway/oauth-http";
import { withGatewayStore } from "@/lib/adapters/content-gateway/postgres-store";
import { requireOwner } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";

export default async function CodexAuthorizationPage({ searchParams }: {
  searchParams: Promise<{ request_id?: string | string[] }>;
}) {
  const { userId } = await requireOwner();
  const requestId = z.string().uuid().safeParse((await searchParams).request_id);
  if (!requestId.success) return <CodexConsentView state={{ status: "invalid" }} />;

  let state: CodexConsentState;
  try {
    const config = getGatewayConfig();
    state = await withGatewayStore(async (store): Promise<CodexConsentState> => {
      const request = await store.getRequest(requestId.data);
      if (!request || request.clientId !== config.clientId || request.resource !== config.resource) return { status: "invalid" };
      const client = await getRegisteredGatewayClient(store, config);
      const scopes = gatewayScopeSchema.array().min(1).max(4).safeParse(request.scope);
      if (client.ownerId !== userId || !scopes.success || new Set(scopes.data).size !== scopes.data.length) return { status: "invalid" };
      if (request.consumedAt) return { status: "consumed" };
      const expiry = new Date(request.expiresAt).getTime();
      if (!Number.isFinite(expiry)) return { status: "invalid" };
      // eslint-disable-next-line react-hooks/purity -- This dynamic Server Component validates expiry on every authenticated request.
      if (expiry <= Date.now()) return { status: "expired" };
      validatePendingAuthorization(request, client, config);
      // Render only the review DTO. State, PKCE data, codes and tokens never
      // cross the Server Component boundary into the consent form.
      return { status: "ready", requestId: request.id, clientName: client.name, scopes: scopes.data, resource: request.resource, expiresAt: request.expiresAt };
    });
  } catch (error) {
    state = { status: error instanceof GatewayOAuthError ? "invalid" : "unavailable" };
  }
  return <CodexConsentView state={state} />;
}
