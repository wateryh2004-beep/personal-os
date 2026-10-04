import { getGatewayConfig } from "@/features/content-gateway/config";
import { revokeGatewayToken } from "@/features/content-gateway/oauth";
import { GatewayOAuthError, oauthHeaders, oauthJson, oauthProtocolResponse, readOAuthForm } from "@/features/content-gateway/oauth-http";
import { withGatewayStore } from "@/lib/adapters/content-gateway/postgres-store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const config = getGatewayConfig();
    const fields = await readOAuthForm(request, ["client_id", "token", "token_type_hint"]);
    return await withGatewayStore((store) => oauthProtocolResponse(async () => {
      await revokeGatewayToken(store, config, fields);
      return new Response(null, { status: 200, headers: oauthHeaders });
    }));
  } catch (error) {
    if (error instanceof GatewayOAuthError) return oauthJson({ error: error.code }, error.status);
    return oauthJson({ error: "temporarily_unavailable" }, 503);
  }
}
