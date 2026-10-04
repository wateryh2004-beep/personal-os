import "server-only";
import { exchangeWithOAuthEngine, issueAuthorizationCode } from "@/lib/adapters/content-gateway/oauth-engine";
import { type GatewayClient, type GatewayConfig, type GatewayRequest, type GatewayRequestInput, type GatewayScope, type GatewayStore } from "./contracts";
import { authorizationRedirect, consentCookie, GatewayOAuthError, hashSecret, isCodexRedirectUri, isOpaqueValue, isRequestId, oauthHeaders, opaqueValue, parseScopes, readConsentCookie, uniqueParameters } from "./oauth-http";

const authorizationFields = ["client_id", "response_type", "redirect_uri", "scope", "resource", "state", "code_challenge", "code_challenge_method"];
export function parseAuthorizationRequest(request: Request, config: GatewayConfig): Omit<GatewayRequestInput, "csrfHash"> {
  const url = new URL(request.url);
  if (url.search.length > 4096) throw new GatewayOAuthError("invalid_request");
  const fields = uniqueParameters(url.searchParams, authorizationFields);
  if (fields.client_id !== config.clientId) throw new GatewayOAuthError("invalid_client");
  if (fields.response_type !== "code") throw new GatewayOAuthError("unsupported_response_type");
  if (!isCodexRedirectUri(fields.redirect_uri ?? "") || fields.resource !== config.resource || !/^[\x21-\x7e]{1,512}$/.test(fields.state ?? "")
    || fields.code_challenge_method !== "S256" || !isOpaqueValue(fields.code_challenge ?? "")) throw new GatewayOAuthError("invalid_request");
  return { clientId: fields.client_id, redirectUri: fields.redirect_uri, scope: parseScopes(fields.scope ?? ""), resource: fields.resource,
    state: fields.state, codeChallenge: fields.code_challenge, codeChallengeMethod: "S256" };
}

export async function getRegisteredGatewayClient(store: GatewayStore, config: GatewayConfig): Promise<GatewayClient> {
  const client = await store.getClient(config.clientId);
  if (!client || !client.enabled || client.id !== config.clientId || client.resource !== config.resource || !client.ownerId || !client.allowedScopes.length
    || !client.grants.includes("authorization_code") || !client.redirectUris.includes("http://127.0.0.1/callback")) throw new GatewayOAuthError("invalid_client");
  return client;
}

export async function prepareAuthorization(store: GatewayStore, config: GatewayConfig, input: Omit<GatewayRequestInput, "csrfHash">, ownerId: string) {
  const client = await getRegisteredGatewayClient(store, config);
  if (client.ownerId !== ownerId) throw new GatewayOAuthError("access_denied", 403);
  if (input.clientId !== client.id || input.resource !== client.resource || input.scope.some((scope) => !client.allowedScopes.includes(scope))) throw new GatewayOAuthError("invalid_scope");
  const nonce = opaqueValue();
  const pending = await store.createRequest({ ...input, csrfHash: hashSecret(nonce) });
  if (!isRequestId(pending.id)) throw new Error("Gateway request persistence mismatch");
  const location = new URL("/settings/connections/codex/authorize", config.issuer);
  location.searchParams.set("request_id", pending.id);
  return new Response(null, { status: 303, headers: { ...oauthHeaders, Location: location.href, "Set-Cookie": consentCookie(pending.id, nonce) } });
}

export function validatePendingAuthorization(pending: GatewayRequest | null, client: GatewayClient, config: GatewayConfig): asserts pending is GatewayRequest {
  if (!pending || pending.consumedAt || !Number.isFinite(Date.parse(pending.expiresAt)) || Date.parse(pending.expiresAt) <= Date.now()
    || pending.clientId !== client.id || pending.resource !== config.resource || !isCodexRedirectUri(pending.redirectUri)
    || pending.codeChallengeMethod !== "S256" || !isOpaqueValue(pending.codeChallenge) || !/^[\x21-\x7e]{1,512}$/.test(pending.state)
    || !pending.scope.length || pending.scope.some((scope) => !client.allowedScopes.includes(scope))) throw new GatewayOAuthError("invalid_request");
}

export type ConsentPersistence = {
  approve: (requestId: string, csrfHash: string, codeHash: string, scopes: GatewayScope[]) => Promise<void>;
  deny: (requestId: string, csrfHash: string) => Promise<void>;
};

export async function decideAuthorization(store: GatewayStore, config: GatewayConfig, request: Request, fields: Record<string, string>, ownerId: string, persistence: ConsentPersistence) {
  if (!isRequestId(fields.request_id ?? "") || !["approve", "deny"].includes(fields.decision)) throw new GatewayOAuthError("invalid_request");
  const nonce = readConsentCookie(request, fields.request_id);
  const client = await getRegisteredGatewayClient(store, config);
  if (client.ownerId !== ownerId) throw new GatewayOAuthError("access_denied", 403);
  const pending = await store.getRequest(fields.request_id);
  validatePendingAuthorization(pending, client, config);
  let response: Response;
  if (fields.decision === "deny") {
    await persistence.deny(pending.id, hashSecret(nonce));
    response = authorizationRedirect(config, pending.redirectUri, pending.state, { error: "access_denied" });
  } else {
    const approvedScopes = parseScopes(fields.scope ?? "");
    if (approvedScopes.some((scope) => !pending.scope.includes(scope))) throw new GatewayOAuthError("invalid_scope");
    const code = await issueAuthorizationCode(client, pending, ownerId, approvedScopes,
      (codeHash) => persistence.approve(pending.id, hashSecret(nonce), codeHash, approvedScopes));
    response = authorizationRedirect(config, pending.redirectUri, pending.state, { code });
  }
  response.headers.append("Set-Cookie", consentCookie(pending.id, "", true));
  return response;
}

export async function exchangeAuthorizationCode(store: GatewayStore, config: GatewayConfig, fields: Record<string, string>) {
  if (fields.grant_type !== "authorization_code") throw new GatewayOAuthError("unsupported_grant_type");
  if (fields.client_id !== config.clientId) throw new GatewayOAuthError("invalid_client");
  if (fields.resource !== config.resource || !isCodexRedirectUri(fields.redirect_uri ?? "") || !isOpaqueValue(fields.code ?? "")
    || !/^[A-Za-z0-9._~-]{43,128}$/.test(fields.code_verifier ?? "")) throw new GatewayOAuthError("invalid_request");
  return exchangeWithOAuthEngine(store, config, await getRegisteredGatewayClient(store, config), fields);
}

export async function revokeGatewayToken(store: GatewayStore, config: GatewayConfig, fields: Record<string, string>) {
  if (fields.client_id !== config.clientId) throw new GatewayOAuthError("invalid_client");
  if (!isOpaqueValue(fields.token ?? "") || (fields.token_type_hint && fields.token_type_hint !== "access_token")) throw new GatewayOAuthError("invalid_request");
  await getRegisteredGatewayClient(store, config);
  // RFC 7009 intentionally does not reveal whether a matching token existed.
  await store.revokeToken(hashSecret(fields.token), config.clientId);
}
