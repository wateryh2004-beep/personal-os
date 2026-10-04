import { createHash, randomBytes } from "node:crypto";
import { gatewayScopes, type GatewayConfig, type GatewayScope } from "./contracts";

export type OAuthErrorCode = "invalid_request" | "invalid_client" | "invalid_grant" | "invalid_scope" | "unauthorized_client" | "unsupported_grant_type" | "unsupported_response_type" | "access_denied";
export class GatewayOAuthError extends Error {
  constructor(public readonly code: OAuthErrorCode, public readonly status = 400) { super(code); }
}
export const oauthHeaders = { "Cache-Control": "no-store", Pragma: "no-cache", "Referrer-Policy": "no-referrer" };
export const oauthJson = (body: unknown, status = 200) => Response.json(body, { status, headers: oauthHeaders });
/** Return known protocol failures inside the transaction callback so the store
 * can commit intentional state consumption. Unknown failures still roll back. */
export async function oauthProtocolResponse(work: () => Promise<Response>): Promise<Response> {
  try { return await work(); }
  catch (error) {
    if (error instanceof GatewayOAuthError) return oauthJson({ error: error.code }, error.status);
    throw error;
  }
}
export const opaqueValue = () => randomBytes(32).toString("base64url");
export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const isOpaqueValue = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
export const isRequestId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Deliberately inspect raw authority: URL normalization accepts 127.1, hex IPs,
 * escaped paths and other aliases that must not widen this native client. */
export function isCodexRedirectUri(value: string) {
  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/callback$/.exec(value);
  return Boolean(match && Number(match[1]) <= 65535);
}

export function parseScopes(value: string): GatewayScope[] {
  if (!value || value.length > 200 || !/^[a-z:]+(?: [a-z:]+)*$/.test(value)) throw new GatewayOAuthError("invalid_scope");
  const scopes = value.split(" ");
  if (new Set(scopes).size !== scopes.length || scopes.some((scope) => !gatewayScopes.includes(scope as GatewayScope))) throw new GatewayOAuthError("invalid_scope");
  return scopes as GatewayScope[];
}

export function uniqueParameters(params: URLSearchParams, allowed: readonly string[], repeatedScope = false): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of params) {
    if (!allowed.includes(key) || (Object.hasOwn(result, key) && !(repeatedScope && key === "scope")) || value.length > 1024) throw new GatewayOAuthError("invalid_request");
    if (repeatedScope && key === "scope" && Object.hasOwn(result, key)) { result[key] += ` ${value}`; continue; }
    result[key] = value;
  }
  return result;
}

export async function readOAuthForm(request: Request, allowed: readonly string[], repeatedScope = false) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") throw new GatewayOAuthError("invalid_request", 415);
  const maximumBytes = 4096;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) throw new GatewayOAuthError("invalid_request", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new GatewayOAuthError("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > maximumBytes) { await reader.cancel(); throw new GatewayOAuthError("invalid_request", 413); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new GatewayOAuthError("invalid_request"); }
  if (/%(?![0-9a-f]{2})/i.test(text)) throw new GatewayOAuthError("invalid_request");
  return uniqueParameters(new URLSearchParams(text), allowed, repeatedScope);
}

export function consentCookieName(id: string) {
  if (!isRequestId(id)) throw new GatewayOAuthError("invalid_request");
  return `__Host-personalos-oauth-${id}`;
}
export function consentCookie(id: string, value: string, clear = false) {
  return `${consentCookieName(id)}=${clear ? "" : value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${clear ? 0 : 600}`;
}
export function readConsentCookie(request: Request, id: string) {
  const name = consentCookieName(id);
  const matches = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) throw new GatewayOAuthError("access_denied", 403);
  const value = matches[0].slice(name.length + 1);
  if (!isOpaqueValue(value)) throw new GatewayOAuthError("access_denied", 403);
  return value;
}
export function authorizationRedirect(config: GatewayConfig, redirectUri: string, state: string, result: { code: string } | { error: OAuthErrorCode }) {
  if (!isCodexRedirectUri(redirectUri)) throw new GatewayOAuthError("invalid_request");
  // This validated URI has no query or fragment. Preserve its exact authority:
  // URL serialization would drop an explicit :80, violating the callback
  // contract shared with SQL and the code exchange's exact URI comparison.
  const query = new URLSearchParams({ ...result, state, iss: config.issuer });
  return new Response(null, { status: 303, headers: { ...oauthHeaders, Location: `${redirectUri}?${query}` } });
}
