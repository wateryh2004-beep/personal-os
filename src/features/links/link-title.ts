import "server-only";
import { assertPublicHttpUrl } from "@/features/briefing/safe-fetch";
import { bilibiliBvidFromUrl, youtubeVideoIdFromUrl } from "./link-url";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

export type LinkTitleSource = "bilibili_api" | "youtube_oembed" | "og" | "none";
export type LinkTitleResult = { url: string; title: string; source: LinkTitleSource };

/**
 * 抓取链接标题。先做 SSRF 防护（只允许公网 http/https），再按站点分发：
 * B 站 → 官方 API（无 cookie 可用，标题干净）；YouTube → oEmbed；其余 → og:title 解析。
 * 任一环节失败只返回空标题，由调用方回退为普通链接。
 */
export async function fetchLinkTitle(
  rawUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<LinkTitleResult> {
  const url = await assertPublicHttpUrl(rawUrl);
  return fetchTitleForUrl(url, fetcher);
}

/** 已通过 SSRF 校验的 URL 的标题抓取，独立成纯函数便于测试（无需真实 DNS）。 */
export async function fetchTitleForUrl(
  url: URL,
  fetcher: typeof fetch,
): Promise<LinkTitleResult> {
  const canonical = url.toString();
  const bvid = bilibiliBvidFromUrl(url);
  if (bvid) {
    const title = await fetchBilibiliTitle(bvid, fetcher);
    if (title) return { url: canonical, title, source: "bilibili_api" };
  }
  const videoId = youtubeVideoIdFromUrl(url);
  if (videoId) {
    const title = await fetchYoutubeTitle(canonical, fetcher);
    if (title) return { url: canonical, title, source: "youtube_oembed" };
  }
  const ogTitle = await fetchOpenGraphTitle(url, fetcher);
  if (ogTitle) {
    return {
      url: canonical,
      title: cleanSiteSuffix(ogTitle, url.hostname),
      source: "og",
    };
  }
  return { url: canonical, title: "", source: "none" };
}

async function fetchBilibiliTitle(
  bvid: string,
  fetcher: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(
      `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { code?: number; data?: { title?: string } };
    const title = payload.data?.title?.trim();
    return title || null;
  } catch {
    return null;
  }
}

async function fetchYoutubeTitle(
  canonicalUrl: string,
  fetcher: typeof fetch,
): Promise<string | null> {
  try {
    const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`;
    const response = await fetcher(endpoint, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const payload = (await response.json()) as { title?: string };
    const title = payload.title?.trim();
    return title || null;
  } catch {
    return null;
  }
}

async function fetchOpenGraphTitle(
  url: URL,
  fetcher: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_HTML_BYTES) return null;
    const text = (await response.text()).slice(0, MAX_HTML_BYTES);
    const raw =
      extractMetaContent(text, "og:title") ??
      extractMetaContent(text, "twitter:title") ??
      extractDocumentTitle(text);
    if (!raw) return null;
    const title = decodeEntities(raw).replace(/\s+/g, " ").trim();
    return title || null;
  } catch {
    return null;
  }
}

function extractMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  );
  if (!match) return null;
  const content = match[0].match(/content=["']([^"']*)["']/i);
  return content?.[1] ?? null;
}

function extractDocumentTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ?? null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 剥离 og:title 末尾的「- SiteName」「| SiteName」等站点后缀。 */
function cleanSiteSuffix(title: string, hostname: string): string {
  const site = hostname.replace(/^www\./, "");
  if (!site) return title;
  const pattern = new RegExp(
    `\\s*(?:-|—|\\||·)\\s*${site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "i",
  );
  const cleaned = title.replace(pattern, "").trim();
  return cleaned || title;
}
