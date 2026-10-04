import { getGatewayConfig } from "@/features/content-gateway/config";
import { decideAuthorization } from "@/features/content-gateway/oauth";
import { GatewayOAuthError, oauthJson, oauthProtocolResponse, readOAuthForm } from "@/features/content-gateway/oauth-http";
import { withGatewayStore } from "@/lib/adapters/content-gateway/postgres-store";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { hasSameOrigin } from "@/lib/auth/same-origin";

export const runtime = "nodejs";
function consentRpcFailure(error: { code?: string } | null) {
  if (!error) return;
  if (["42501", "22023"].includes(error.code ?? "")) throw new GatewayOAuthError("access_denied", 403);
  // Infrastructure or programming failures are unavailable, not a denial.
  throw new Error("Gateway consent unavailable");
}
export async function POST(request: Request) {
  try {
    const config = getGatewayConfig();
    if (!hasSameOrigin(request, config.issuer)) return oauthJson({ error: "access_denied" }, 403);
    const fields = await readOAuthForm(request, ["request_id", "decision", "scope"], true);
    const owner = await requireOwnerApi();
    return await withGatewayStore((store) => oauthProtocolResponse(() => decideAuthorization(store, config, request, fields, owner.userId, {
      approve: async (requestId, csrfHash, codeHash, scopes) => {
        const { error } = await owner.supabase.rpc("approve_content_authorization", { p_request_id: requestId, p_csrf_hash: csrfHash, p_code_hash: codeHash, p_approved_scopes: scopes });
        consentRpcFailure(error);
      },
      deny: async (requestId, csrfHash) => {
        const { error } = await owner.supabase.rpc("deny_content_authorization", { p_request_id: requestId, p_csrf_hash: csrfHash });
        consentRpcFailure(error);
      },
    })));
  } catch (error) {
    if (error instanceof GatewayOAuthError) return oauthJson({ error: error.code }, error.status);
    return apiAuthenticationFailure(error) ?? oauthJson({ error: "temporarily_unavailable" }, 503);
  }
}
