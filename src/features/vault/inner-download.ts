import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { tokenHash, validVaultToken, vaultCookie } from "./crypto";
import { assertInnerVault, InnerLocked, type InnerOwner } from "./inner-session";
import { vaultOwner } from "./server";

export const innerDownloadCookie = "personal-os-inner-download";
export const innerDownloadLifetime = 300;

function sign(owner: { userId: string; login: string; hash: string }, ticket: string, payload: string) {
  if (!env.supabaseSecretKey) throw new Error("Missing server configuration");
  return createHmac("sha256", env.supabaseSecretKey)
    .update(`personal-os:inner-download:v1:${owner.userId}:${owner.login}:${owner.hash}:${ticket}:${payload}`).digest();
}

export function issueInnerDownload(owner: InnerOwner, fileId: string) {
  const ticket = randomUUID();
  const payload = `${fileId}.${owner.innerHash}.${Math.floor(Date.now() / 1000) + innerDownloadLifetime}`;
  return { path: `/api/vault/inner/download/${ticket}`, grant: `${payload}.${sign(owner, ticket, payload).toString("hex")}` };
}

export async function requireInnerDownload(ticket: string) {
  const owner = await vaultOwner();
  const jar = await cookies();
  const outer = jar.get(vaultCookie)?.value;
  const grant = jar.get(innerDownloadCookie)?.value;
  const parts = grant?.match(/^([a-f0-9-]{36}\.([a-f0-9]{64})\.(\d{1,12}))\.([a-f0-9]{64})$/);
  if (!validVaultToken(outer) || !parts || Number(parts[3]) <= Math.floor(Date.now() / 1000)) throw new InnerLocked();

  // Issued only after the tab proof and both layers were verified. This cookie
  // can authorize a single file at a single URL; it contains no session token.
  const identity = { ...owner, hash: tokenHash(outer) };
  if (!timingSafeEqual(sign(identity, ticket, parts[1]), Buffer.from(parts[4], "hex"))) throw new InnerLocked();
  return { owner: { ...identity, innerHash: parts[2] }, fileId: parts[1].slice(0, 36) };
}

export function innerDownloadRange(header: string | null, size: number) {
  if (header === null) return null;
  const match = header.match(/^bytes=(\d{0,16})-(\d{0,16})$/i);
  if (!match || (!match[1] && !match[2])) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return false;
  if (!match[1]) return b > 0 ? { start: Math.max(0, size - b), end: size - 1 } : false;
  const end = match[2] ? Math.min(b, size - 1) : size - 1;
  return a <= end ? { start: a, end } : false;
}

export function watchInnerDownload(body: ReadableStream<Uint8Array>, owner: InnerOwner, length: number, signal: AbortSignal) {
  let nextCheck = performance.now() + 2000;
  let sent = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      if (sent + chunk.byteLength > length) throw new Error("Invalid archive length");
      if (performance.now() >= nextCheck) {
        // Check only as bytes are consumed. The RPC neither extends the
        // sessions nor caches permission, and failure cancels the R2 stream.
        try { await assertInnerVault(owner); }
        catch { throw new Error("Download access ended"); }
        nextCheck = performance.now() + 2000;
      }
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush() {
      if (sent !== length) throw new Error("Incomplete archive");
    },
  }), { signal });
}
