import { getGatewayConfig } from "@/features/content-gateway/config";
import { exchangeAuthorizationCode } from "@/features/content-gateway/oauth";
import { GatewayOAuthError, oauthJson, readOAuthForm } from "@/features/content-gateway/oauth-http";
import { withGatewayStore } from "@/lib/adapters/content-gateway/postgres-store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const config = getGatewayConfig();
    const fields = await readOAuthForm(request, ["grant_type", "client_id", "code", "redirect_uri", "code_verifier", "resource"]);
    return await withGatewayStore(async (store) => {
      try { return oauthJson(await exchangeAuthorizationCode(store, config, fields)); }
      catch (error) {
        // A known protocol failure (including wrong PKCE) must COMMIT code
        // consumption. Unexpected/database failures escape and roll back.
        if (error instanceof GatewayOAuthError) return oauthJson({ error: error.code }, error.status);
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof GatewayOAuthError) return oauthJson({ error: error.code }, error.status);
    return oauthJson({ error: "temporarily_unavailable" }, 503);
  }
}
