import { gatewayClientId, GatewayUnavailableError, type GatewayConfig } from "./contracts";

/** Enable only after the exact database/credential/owner-consent rollout is approved.
 * Discovery and issuer identity never come from Host or forwarded headers. */
export function getGatewayConfig(environment: Readonly<Record<string, string | undefined>> = process.env): GatewayConfig {
  if (environment.CONTENT_GATEWAY_ENABLED !== "true" || !environment.APP_URL?.trim()) throw new GatewayUnavailableError();
  try {
    const origin = new URL(environment.APP_URL);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new GatewayUnavailableError();
    return { issuer: origin.origin, resource: `${origin.origin}/api/mcp`, clientId: gatewayClientId };
  } catch { throw new GatewayUnavailableError(); }
}
