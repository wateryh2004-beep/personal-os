import { createHash } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { getGatewayConfig } from "@/features/content-gateway/config";
import { gatewayChallenge } from "@/features/content-gateway/metadata";
import { withGatewayStore } from "@/lib/adapters/content-gateway/postgres-store";
import { createContentMcpServer } from "@/lib/adapters/content-gateway/mcp-server";
import { hasSameOrigin } from "@/lib/auth/same-origin";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
async function handle(request: Request) {
  try {
    const config = getGatewayConfig();
    if (request.headers.has("origin") && !hasSameOrigin(request, config.issuer)) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    const host = request.headers.get("host");
    if (host && host !== new URL(config.issuer).host) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    const header = request.headers.get("authorization");
    const credential = /^Bearer ([A-Za-z0-9_-]{43,128})$/i.exec(header ?? "")?.[1];
    if (!credential) return Response.json({ error: "unauthorized" }, { status: 401, headers: { ...noStore, "WWW-Authenticate": gatewayChallenge(config, header ? "invalid_token" : undefined) } });
    const hash = createHash("sha256").update(credential).digest("hex");
    const token = await withGatewayStore((store) => store.getToken(hash, config.resource));
    if (!token || token.clientId !== config.clientId || token.resource !== config.resource || Date.parse(token.expiresAt) <= Date.now()) return Response.json({ error: "invalid_token" }, { status: 401, headers: { ...noStore, "WWW-Authenticate": gatewayChallenge(config, "invalid_token") } });
    // No cookie fallback, token passthrough to Supabase, or mutable session state.
    const handler = createMcpHandler(() => createContentMcpServer(config, credential, token), { maxRequestBodySize: 1_000_000, maxSubscriptions: 0 });
    const response = await handler.fetch(request, { authInfo: { token: credential, clientId: token.clientId, scopes: token.scope, expiresAt: Math.floor(Date.parse(token.expiresAt) / 1000), resource: new URL(config.resource) } });
    response.headers.set("Cache-Control", noStore["Cache-Control"]);
    return response;
  } catch { return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: noStore }); }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
