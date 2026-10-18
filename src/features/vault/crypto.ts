import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const vaultIdleMs = 5 * 60_000;
export const vaultLifetimeMs = 60 * 60_000;
export const vaultCookie = "personal-os-vault";

function scrypt(value: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(value, salt, 32, parameters,
    (error, key) => error ? reject(error) : resolve(key)));
}

export function validVaultPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 256;
}

export async function hashVaultPassword(password: string) {
  if (!validVaultPassword(password)) throw new Error("vault_invalid_password");
  const salt = randomBytes(24).toString("hex");
  return `scrypt-v1$${salt}$${(await scrypt(password, salt)).toString("hex")}`;
}

export async function verifyVaultPassword(password: string, encoded: string) {
  if (!validVaultPassword(password)) return false;
  const match = /^scrypt-v1\$([a-f0-9]{48})\$([a-f0-9]{64})$/.exec(encoded);
  if (!match) return false;
  return timingSafeEqual(await scrypt(password, match[1]), Buffer.from(match[2], "hex"));
}

export function newVaultToken() { return randomBytes(32).toString("hex"); }
export function tokenHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function validVaultToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function vaultSessionActive(session: { expires_at: string; last_seen_at: string }, now = Date.now()) {
  return Date.parse(session.expires_at) > now && Date.parse(session.last_seen_at) + vaultIdleMs > now;
}
