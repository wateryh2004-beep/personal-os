import "server-only";
import OAuth2Server from "@node-oauth/oauth2-server";
import type { GatewayClient, GatewayCode, GatewayConfig, GatewayRequest, GatewayScope, GatewayStore } from "@/features/content-gateway/contracts";
import { gatewayAccessLifetimeSeconds } from "@/features/content-gateway/contracts";
import { GatewayOAuthError, hashSecret, isCodexRedirectUri, isOpaqueValue, opaqueValue, type OAuthErrorCode } from "@/features/content-gateway/oauth-http";

const protocolErrors = new Set<OAuthErrorCode>(["invalid_request", "invalid_client", "invalid_grant", "invalid_scope", "unauthorized_client", "unsupported_grant_type", "unsupported_response_type", "access_denied"]);
function translateEngineError(error: unknown): never {
  if (error instanceof OAuth2Server.OAuthError && "inner" in error && error.inner instanceof GatewayOAuthError) throw error.inner;
  if (error instanceof OAuth2Server.OAuthError && protocolErrors.has(error.name as OAuthErrorCode) && error.code < 500) throw new GatewayOAuthError(error.name as OAuthErrorCode);
  // Unexpected/storage errors escape the transaction so the caller rolls back.
  throw error;
}
function engineClient(client: GatewayClient): OAuth2Server.Client {
  return { id: client.id, redirectUris: client.redirectUris, grants: ["authorization_code"], accessTokenLifetime: gatewayAccessLifetimeSeconds };
}

/** One engine/model per request: no caller identity, exchange nonce, or pending
 * code can leak through module-level state into a concurrent request. */
export async function issueAuthorizationCode(client: GatewayClient, pending: GatewayRequest, ownerId: string, approvedScopes: GatewayScope[], persist: (codeHash: string) => Promise<void>) {
  const model: OAuth2Server.AuthorizationCodeModel = {
    getClient: async (id) => id === client.id ? engineClient(client) : false,
    getAccessToken: async () => false,
    getAuthorizationCode: async () => false,
    revokeAuthorizationCode: async () => false,
    saveToken: async () => false,
    generateAuthorizationCode: async () => opaqueValue(),
    validateRedirectUri: async (uri) => isCodexRedirectUri(uri),
    validateScope: async (_user, _client, scopes) => scopes?.every((scope) => approvedScopes.includes(scope as GatewayScope)) ? scopes : false,
    saveAuthorizationCode: async (code, savedClient, user) => {
      await persist(hashSecret(code.authorizationCode));
      return { ...code, client: savedClient, user };
    },
  };
  const server = new OAuth2Server({ model, authorizationCodeLifetime: 300, accessTokenLifetime: gatewayAccessLifetimeSeconds });
  const request = new OAuth2Server.Request({ method: "GET", headers: {}, query: {
    client_id: pending.clientId, response_type: "code", redirect_uri: pending.redirectUri,
    scope: approvedScopes.join(" "), state: pending.state, code_challenge: pending.codeChallenge, code_challenge_method: "S256",
  } });
  try {
    const code = await server.authorize(request, new OAuth2Server.Response(), { authenticateHandler: { handle: async () => ({ id: ownerId }) } });
    return code.authorizationCode;
  } catch (error) { return translateEngineError(error); }
}

export async function exchangeWithOAuthEngine(store: GatewayStore, config: GatewayConfig, client: GatewayClient, fields: Record<string, string>) {
  const codeHash = hashSecret(fields.code);
  const exchangeNonceHash = hashSecret(opaqueValue());
  let loadedCode: GatewayCode | null = null;
  const model: OAuth2Server.AuthorizationCodeModel = {
    getClient: async (id, secret) => id === client.id && !secret ? engineClient(client) : false,
    getAccessToken: async () => false,
    saveAuthorizationCode: async () => false,
    generateAccessToken: async () => opaqueValue(),
    getAuthorizationCode: async (rawCode) => {
      if (!isOpaqueValue(rawCode) || hashSecret(rawCode) !== codeHash) return false;
      const code = await store.getCode(codeHash);
      if (!code || code.consumedAt || code.clientId !== client.id || code.ownerId !== client.ownerId || code.resource !== config.resource || fields.resource !== code.resource
        || code.codeChallengeMethod !== "S256" || !isOpaqueValue(code.codeChallenge) || !code.scope.length || code.scope.some((scope) => !client.allowedScopes.includes(scope))
        || !isCodexRedirectUri(code.redirectUri) || !Number.isFinite(Date.parse(code.expiresAt))) return false;
      loadedCode = code;
      return { authorizationCode: rawCode, expiresAt: new Date(code.expiresAt), redirectUri: code.redirectUri, scope: code.scope,
        codeChallenge: code.codeChallenge, codeChallengeMethod: "S256", client: engineClient(client), user: { id: code.ownerId } };
    },
    revokeAuthorizationCode: async () => store.consumeCode(codeHash, exchangeNonceHash),
    saveToken: async (token) => {
      if (!loadedCode || !token.accessTokenExpiresAt) throw new Error("Gateway exchange state unavailable");
      const saved = await store.saveToken(codeHash, exchangeNonceHash, hashSecret(token.accessToken), token.accessTokenExpiresAt.toISOString());
      if (saved.ownerId !== loadedCode.ownerId || saved.clientId !== client.id || saved.resource !== config.resource || !saved.scope.length
        || saved.scope.some((scope) => !loadedCode!.scope.includes(scope)) || !Number.isFinite(Date.parse(saved.expiresAt)) || Date.parse(saved.expiresAt) <= Date.now()) throw new Error("Gateway token persistence mismatch");
      // Never return the refresh token generated internally by this OAuth2
      // engine, nor any provider session or user object, to the public client.
      return { accessToken: token.accessToken, accessTokenExpiresAt: new Date(saved.expiresAt), scope: saved.scope,
        client: engineClient(client), user: { id: saved.ownerId } };
    },
  };
  const server = new OAuth2Server({ model, accessTokenLifetime: gatewayAccessLifetimeSeconds, requireClientAuthentication: { authorization_code: false }, allowExtendedTokenAttributes: false });
  // type-is needs a body-presence header. Derive the length from our bounded,
  // already parsed input rather than trusting the incoming Content-Length.
  const request = new OAuth2Server.Request({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "content-length": String(Buffer.byteLength(new URLSearchParams(fields).toString())) }, query: {}, body: fields });
  const response = new OAuth2Server.Response();
  try {
    await server.token(request, response);
    const body = response.body as { access_token: string; token_type: string; expires_in: number; scope: string };
    return { access_token: body.access_token, token_type: body.token_type, expires_in: body.expires_in, scope: body.scope };
  } catch (error) { return translateEngineError(error); }
}
