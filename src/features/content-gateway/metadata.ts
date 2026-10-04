import { gatewayScopes, type GatewayConfig } from "./contracts";

export function protectedResourceMetadata(config: GatewayConfig) {
  return { resource: config.resource, authorization_servers: [config.issuer], scopes_supported: [...gatewayScopes], bearer_methods_supported: ["header"], resource_name: "PersonalOS 内容" };
}
export function authorizationServerMetadata(config: GatewayConfig) {
  return { issuer: config.issuer, authorization_endpoint: `${config.issuer}/api/oauth/authorize`, token_endpoint: `${config.issuer}/api/oauth/token`, revocation_endpoint: `${config.issuer}/api/oauth/revoke`,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code"], token_endpoint_auth_methods_supported: ["none"], revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"], authorization_response_iss_parameter_supported: true, scopes_supported: [...gatewayScopes] };
}
export function gatewayChallenge(config: GatewayConfig, error?: "invalid_token" | "insufficient_scope") {
  return `Bearer resource_metadata="${config.issuer}/.well-known/oauth-protected-resource/api/mcp"${error ? `, error="${error}"` : ""}`;
}
