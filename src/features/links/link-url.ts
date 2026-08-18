/**
 * 从粘贴文本中识别单个 HTTP(S) URL 及已知视频站点 ID。
 * 纯函数、无副作用、无 server-only，可在 client 与 server 共用。
 * 供「粘贴链接自动解析标题」功能使用。
 */

const URL_START = /^https?:\/\/\S+$/i;
// 句末标点（含全角）几乎不可能出现在 URL 末尾，粘贴时通常是自然语言的句号/括号。
const TRAILING_PUNCTUATION = /[.,，。；;！!？?、）》】"'”’]+$/;
const BVID_PATTERN = /BV[0-9A-Za-z]{10,}/;
const YOUTUBE_ID_PATTERN = /^[0-9A-Za-z_-]{11}$/;

/**
 * 若整段文本就是一个 HTTP(S) URL，返回清理掉句末标点后的 URL；否则返回 null。
 * 多 URL、带前后文字、非 http(s) 协议一律返回 null（交给默认粘贴行为）。
 */
export function extractPastedUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!URL_START.test(trimmed)) return null;
  let url = trimmed;
  for (let guard = 0; guard < 10; guard += 1) {
    const before = url;
    url = url.replace(TRAILING_PUNCTUATION, "");
    // 只有右括号多于左括号时，末尾的 ) 才是句末括号（否则可能是 URL 合法路径）。
    const opens = (url.match(/\(/g) ?? []).length;
    const closes = (url.match(/\)/g) ?? []).length;
    if (closes > opens && url.endsWith(")")) url = url.slice(0, -1);
    if (url === before) break;
  }
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

/** 从 B 站视频链接提取 BV 号；非 bilibili.com 域名返回 null。 */
export function bilibiliBvidFromUrl(value: string | URL): string | null {
  const url = typeof value === "string" ? new URL(value) : value;
  const host = url.hostname.toLowerCase();
  if (host !== "bilibili.com" && !host.endsWith(".bilibili.com")) return null;
  return BVID_PATTERN.exec(url.pathname)?.[0] ?? null;
}

/** 从 YouTube 链接提取视频 ID；支持 watch / youtu.be / shorts / embed / live。 */
export function youtubeVideoIdFromUrl(value: string | URL): string | null {
  const url = typeof value === "string" ? new URL(value) : value;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    return YOUTUBE_ID_PATTERN.test(id) ? id : null;
  }
  if (host === "youtube.com" || host.endsWith(".youtube-nocookie.com")) {
    const prefix = ["shorts", "embed", "live"].find((segment) =>
      url.pathname.startsWith(`/${segment}/`),
    );
    if (prefix) {
      const id = url.pathname.split("/")[2] ?? "";
      return YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }
    const id = url.searchParams.get("v") ?? "";
    return YOUTUBE_ID_PATTERN.test(id) ? id : null;
  }
  return null;
}
