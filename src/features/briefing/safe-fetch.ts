import "server-only";
import { lookup } from "dns/promises";
import { isIP } from "net";

const MAX_BYTES = 2 * 1024 * 1024;
function blockedIp(address: string) {
  if (address === "::1" || address === "::" || address.toLowerCase().startsWith("fc") || address.toLowerCase().startsWith("fd") || address.toLowerCase().startsWith("fe8") || address.toLowerCase().startsWith("fe9") || address.toLowerCase().startsWith("fea") || address.toLowerCase().startsWith("feb")) return true;
  const mapped = address.replace(/^::ffff:/, ""); const parts = mapped.split(".").map(Number); if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || parts[0] >= 224;
}
export async function assertPublicHttpUrl(value: string) {
  const url = new URL(value); if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("invalid_url");
  const hostname = url.hostname.toLowerCase(); if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "metadata.google.internal") throw new Error("blocked_host");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true }); if (!addresses.length || addresses.some((entry) => blockedIp(entry.address))) throw new Error("blocked_host");
  return url;
}
async function boundedText(response: Response) { const declared = Number(response.headers.get("content-length") ?? 0); if (declared > MAX_BYTES) throw new Error("response_too_large"); if (!response.body) return ""; const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0; while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_BYTES) { await reader.cancel(); throw new Error("response_too_large"); } chunks.push(value); } const merged = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; } return new TextDecoder().decode(merged); }
export async function safeFetchFeed(value: string, conditional: { etag?: string | null; lastModified?: string | null } = {}) {
  let url = await assertPublicHttpUrl(value);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const headers = new Headers({ Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain;q=0.8", "User-Agent": "PersonalOSBriefing/1.0 (private RSS reader)" }); if (conditional.etag) headers.set("If-None-Match", conditional.etag); if (conditional.lastModified) headers.set("If-Modified-Since", conditional.lastModified);
    const response = await fetch(url, { method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(12_000), cache: "no-store" });
    if ([301,302,303,307,308].includes(response.status)) { const location = response.headers.get("location"); if (!location || redirect === 3) throw new Error("redirect_error"); url = await assertPublicHttpUrl(new URL(location, url).toString()); continue; }
    if (response.status === 304) return { status: 304 as const, url: url.toString(), etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), body: "" };
    if (!response.ok) throw new Error(`http_${response.status}`); const body = await boundedText(response); if (!body.trim().startsWith("<")) throw new Error("not_xml");
    return { status: 200 as const, url: url.toString(), etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), body };
  }
  throw new Error("redirect_error");
}
