import { createHash } from "crypto";

const trackingKeys = new Set(["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid"]);
export function canonicalizeArticleUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value); if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = ""; url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("utm_") || trackingKeys.has(key.toLowerCase())) url.searchParams.delete(key);
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch { return null; }
}
export function normalizeFeedUrl(value: string) { const normalized = canonicalizeArticleUrl(value); if (!normalized) throw new Error("invalid_feed_url"); return normalized; }
export function normalizeTitle(value: string) { return value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim(); }
export function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function identityKey(input: { externalId?: string | null; canonicalUrl?: string | null; title: string; publishedAt?: string | null }) { return digest(input.externalId?.trim() || input.canonicalUrl || `${normalizeTitle(input.title)}|${input.publishedAt ?? "undated"}`); }
