import { getGatewayConfig } from "@/features/content-gateway/config";
import { parseAuthorizationRequest, prepareAuthorization } from "@/features/content-gateway/oauth";
import { GatewayOAuthError, oauthHeaders, oauthJson, oauthProtocolResponse } from "@/features/content-gateway/oauth-http";
import { withGatewayStore } from "@/lib/adapters/content-gateway/postgres-store";
import { OwnerAuthenticationError, requireOwnerApi } from "@/lib/auth/require-owner";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const config = getGatewayConfig();
    const input = parseAuthorizationRequest(request, config);
    let owner;
    try { owner = await requireOwnerApi(); }
    catch (error) {
      if (error instanceof OwnerAuthenticationError && error.code === "unauthenticated") {
        // Authenticate before creating any persistent pending request. Keep
        // PKCE/state intact, but never derive this login origin/path from Host.
        const login = new URL("/login", config.issuer);
        login.searchParams.set("next", `/api/oauth/authorize${new URL(request.url).search}`);
        return new Response(null, { status: 303, headers: { ...oauthHeaders, Location: login.href } });
      }
      if (error instanceof OwnerAuthenticationError && error.code === "not-authorized") return oauthJson({ error: "access_denied" }, 403);
      throw error;
    }
    return await withGatewayStore((store) => oauthProtocolResponse(() => prepareAuthorization(store, config, input, owner.userId)));
  } catch (error) {
    if (error instanceof GatewayOAuthError) return oauthJson({ error: error.code }, error.status);
    return oauthJson({ error: "temporarily_unavailable" }, 503);
  }
}
