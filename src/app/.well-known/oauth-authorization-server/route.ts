import { getGatewayConfig } from "@/features/content-gateway/config";
import { authorizationServerMetadata } from "@/features/content-gateway/metadata";
export async function GET() {
  try { return Response.json(authorizationServerMetadata(getGatewayConfig()), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
