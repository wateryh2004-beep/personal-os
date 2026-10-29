/** Canonical keys are hints only; never use them to merge without a preview. */
export function experienceDuplicateKey(sourceUrl: string | null) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    // Xiaohongshu share query tokens change frequently; the note ID is stable.
    if (host === "xiaohongshu.com") {
      const match = url.pathname.match(/^\/(?:discovery\/item|explore)\/([0-9a-f]{24})(?:\/|$)/i);
      if (match) return `xhs:${match[1].toLowerCase()}`;
    }
    return `${url.origin}${url.pathname}${url.search}`;
  } catch { return null; }
}
