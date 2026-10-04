import "server-only";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { z } from "zod";
import { getGatewayConfig } from "@/features/content-gateway/config";
import { gatewayScopeSchema, GatewayAccessError, GatewayUnavailableError, type GatewayStore } from "@/features/content-gateway/contracts";

const uuid = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true });
const scopes = z.array(gatewayScopeSchema).max(4);
const clientSchema = z.object({ id: z.string(), name: z.string(), ownerId: uuid, allowedScopes: scopes, resource: z.url(), enabled: z.boolean(), redirectUris: z.array(z.url()), grants: z.tuple([z.literal("authorization_code")]), accessTokenLifetime: z.number().int().positive().max(3600) });
const requestSchema = z.object({ id: uuid, clientId: z.string(), redirectUri: z.url(), scope: scopes, resource: z.url(), state: z.string(), codeChallenge: z.string(), codeChallengeMethod: z.literal("S256"), expiresAt: timestamp, consumedAt: timestamp.nullable() });
const codeSchema = z.object({ clientId: z.string(), ownerId: uuid, grantId: uuid, redirectUri: z.url(), codeChallenge: z.string(), codeChallengeMethod: z.literal("S256"), scope: scopes, resource: z.url(), expiresAt: timestamp, consumedAt: timestamp.nullable() });
const tokenSchema = z.object({ grantId: uuid, ownerId: uuid, clientId: z.string(), scope: scopes, resource: z.url(), expiresAt: timestamp });

/** No admin connection, inherited service indirection, or SSL downgrade. Split
 * the URL so pg cannot override our TLS checks through connection parameters. */
export function gatewayPoolConfig(environment: Readonly<Record<string, string | undefined>> = process.env): PoolConfig {
  try {
    const parsed = new URL(environment.CONTENT_GATEWAY_DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.hash) throw new Error();
    const username = decodeURIComponent(parsed.username);
    if (!/^content_gateway_runtime(?:\.[a-z0-9]+)?$/.test(username)) throw new Error();
    if (!parsed.hostname.endsWith(".supabase.co") && !parsed.hostname.endsWith(".pooler.supabase.com")) throw new Error();
    const parameters = [...parsed.searchParams.entries()];
    if (parameters.some(([key, value]) => key !== "sslmode" || value !== "verify-full") || parameters.length > 1) throw new Error();
    const port = parsed.port ? Number(parsed.port) : 5432;
    if (![5432, 6543].includes(port) || !parsed.password || !/^\/[a-zA-Z0-9_]+$/.test(parsed.pathname)) throw new Error();
    return { host: parsed.hostname, port, user: username, password: decodeURIComponent(parsed.password), database: parsed.pathname.slice(1),
      ssl: { rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
      application_name: "personal-os-content-gateway" };
  } catch { throw new GatewayUnavailableError(); }
}

const queries = {
  getClient: "select content_gateway.get_client($1) as value",
  createRequest: "select content_gateway.create_request($1::jsonb) as value",
  getRequest: "select content_gateway.get_request($1::uuid) as value",
  getCode: "select content_gateway.get_code($1) as value",
  consumeCode: "select content_gateway.consume_code($1,$2) as value",
  saveToken: "select content_gateway.save_token($1,$2,$3,$4::timestamptz) as value",
  getToken: "select content_gateway.get_token($1,$2) as value",
  revokeToken: "select content_gateway.revoke_token($1,$2) as value",
  readContent: "select content_gateway.read_content($1,$2,$3::jsonb) as value",
  writeContent: "select content_gateway.write_content($1,$2,$3::jsonb) as value",
} as const;

type Connection = Pick<PoolClient, "query">;
function databaseError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "P0201") return new GatewayAccessError("invalid_token");
  if (code === "P0202") return new GatewayAccessError("insufficient_scope");
  if (["22023", "22P02", "22007", "22008", "23514"].includes(code)) return new GatewayAccessError("invalid_request");
  if (code === "P0102") return new GatewayAccessError("idempotency_conflict");
  if (["P0101", "23505", "40001"].includes(code)) return new GatewayAccessError("conflict");
  if (code === "P0103") return new GatewayAccessError("not_found");
  return new GatewayUnavailableError();
}

/** Only named, parameterized routines. This role has no direct table privileges. */
export function createPostgresGatewayStore(connection: Connection): GatewayStore {
  const call = async (name: keyof typeof queries, args: unknown[]) => {
    try { return (await connection.query(queries[name], args)).rows[0]?.value ?? null; }
    catch (error) { throw databaseError(error); }
  };
  const parsed = async <T>(promise: Promise<unknown>, schema: z.ZodType<T>): Promise<T> => {
    const result = schema.safeParse(await promise);
    if (!result.success) throw new GatewayUnavailableError();
    return result.data;
  };
  return {
    getClient: (id) => parsed(call("getClient", [id]), clientSchema.nullable()),
    createRequest: (input) => parsed(call("createRequest", [JSON.stringify(input)]), requestSchema),
    getRequest: (id) => parsed(call("getRequest", [id]), requestSchema.nullable()),
    getCode: (hash) => parsed(call("getCode", [hash]), codeSchema.nullable()),
    consumeCode: (hash, nonce) => parsed(call("consumeCode", [hash, nonce]), z.boolean()),
    saveToken: (code, nonce, hash, expires) => parsed(call("saveToken", [code, nonce, hash, expires]), tokenSchema),
    getToken: (hash, audience) => parsed(call("getToken", [hash, audience]), tokenSchema.nullable()),
    revokeToken: async (hash, clientId) => { await call("revokeToken", [hash, clientId]); },
    readContent: (hash, audience, command) => call("readContent", [hash, audience, JSON.stringify(command)]),
    writeContent: (hash, audience, command) => call("writeContent", [hash, audience, JSON.stringify(command)]),
  };
}

let pool: Pool | undefined;
function configuredPool() {
  getGatewayConfig();
  if (!pool) {
    pool = new Pool(gatewayPoolConfig());
    // pg errors can contain connection details; do not log the error object.
    pool.on("error", () => { console.warn("content_gateway_pool_unavailable"); });
  }
  return pool;
}

export async function withGatewayStore<T>(work: (store: GatewayStore) => Promise<T>): Promise<T> {
  let connection: PoolClient;
  try { connection = await configuredPool().connect(); }
  catch { throw new GatewayUnavailableError(); }
  let discard = false;
  try {
    await connection.query("begin");
    await connection.query("set local statement_timeout = '10s'");
    await connection.query("set local lock_timeout = '5s'");
    const identity = await connection.query("select current_user as role");
    if (identity.rows[0]?.role !== "content_gateway_runtime") throw new GatewayUnavailableError();
    const result = await work(createPostgresGatewayStore(connection));
    await connection.query("commit");
    return result;
  } catch (error) {
    try { await connection.query("rollback"); } catch { discard = true; }
    if (error instanceof GatewayAccessError || error instanceof GatewayUnavailableError) throw error;
    throw new GatewayUnavailableError();
  } finally { connection.release(discard); }
}
