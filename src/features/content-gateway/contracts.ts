import { z } from "zod";

export const gatewayScopes = ["notes:read", "notes:write", "interview:read", "interview:append"] as const;
export type GatewayScope = typeof gatewayScopes[number];
export const gatewayScopeSchema = z.enum(gatewayScopes);
export const gatewayClientId = "personalos-codex";
export const gatewayAccessLifetimeSeconds = 3600;
export type GatewayConfig = { issuer: string; resource: string; clientId: string };
export type GatewayClient = { id: string; name: string; ownerId: string; allowedScopes: GatewayScope[]; resource: string; enabled: boolean; redirectUris: string[]; grants: ["authorization_code"]; accessTokenLifetime: number };
export type GatewayRequest = { id: string; clientId: string; redirectUri: string; scope: GatewayScope[]; resource: string; state: string; codeChallenge: string; codeChallengeMethod: "S256"; expiresAt: string; consumedAt: string | null };
export type GatewayRequestInput = Omit<GatewayRequest, "id" | "expiresAt" | "consumedAt"> & { csrfHash: string };
export type GatewayCode = { clientId: string; ownerId: string; grantId: string; redirectUri: string; codeChallenge: string; codeChallengeMethod: "S256"; scope: GatewayScope[]; resource: string; expiresAt: string; consumedAt: string | null };
export type GatewayToken = { grantId: string; ownerId: string; clientId: string; scope: GatewayScope[]; resource: string; expiresAt: string };
export type GatewayGrant = { id: string; clientName: string; scope: GatewayScope[]; resource: string; createdAt: string; expiresAt: string; revokedAt: string | null };

export interface GatewayStore {
  getClient(clientId: string): Promise<GatewayClient | null>;
  createRequest(input: GatewayRequestInput): Promise<GatewayRequest>;
  getRequest(requestId: string): Promise<GatewayRequest | null>;
  getCode(codeHash: string): Promise<GatewayCode | null>;
  consumeCode(codeHash: string, exchangeNonceHash: string): Promise<boolean>;
  saveToken(codeHash: string, exchangeNonceHash: string, tokenHash: string, expiresAt: string): Promise<GatewayToken>;
  getToken(tokenHash: string, audience: string): Promise<GatewayToken | null>;
  revokeToken(tokenHash: string, clientId: string): Promise<void>;
  readContent(tokenHash: string, audience: string, command: unknown): Promise<unknown>;
  writeContent(tokenHash: string, audience: string, command: unknown): Promise<unknown>;
}

export class GatewayUnavailableError extends Error {
  constructor() { super("Content gateway is not configured or available."); this.name = "GatewayUnavailableError"; }
}
export class GatewayAccessError extends Error {
  constructor(public readonly code: "invalid_token" | "insufficient_scope" | "invalid_request" | "conflict" | "idempotency_conflict" | "not_found") { super(code); this.name = "GatewayAccessError"; }
}
