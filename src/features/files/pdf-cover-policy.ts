/** Change this version whenever rendering, encoding, or its security policy changes. */
export const PDF_COVER_RENDERER_VERSION = "pdfjs-6.4.299-webp-v1";
export const PDF_COVER_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const PDF_COVER_MAX_OUTPUT_BYTES = 128 * 1024;
export const PDF_COVER_RENDER_TIMEOUT_MS = 15_000;
export const PDF_COVER_MAX_EDGE = 512;
export const PDF_COVER_MAX_PAGES = 500;
export const PDF_COVER_MAX_PAGE_PIXELS = 16_000_000;
export const PDF_COVER_WEBP_QUALITY = 78;
export const PDF_COVER_JOB_TIMEOUT_MS = 25_000;
export const PDF_COVER_DATABASE_TIMEOUT_MS = 5_000;
export const PDF_COVER_MAX_ATTEMPTS = 3;
export const PDF_COVER_RETRY_SECONDS = 3;

/** Server-only opt-in. Never enable before reviewing/applying the migration. */
export function pdfCoversEnabled() { return process.env.PDF_COVERS_ENABLED === "true"; }

export const pdfCoverPrivateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function pdfCoverKey(userId: string, documentId: string, sourceSha256: string, version = PDF_COVER_RENDERER_VERSION) {
  if (!uuid.test(userId) || !uuid.test(documentId) || !/^[0-9a-f]{64}$/.test(sourceSha256) || !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(version))
    throw new Error("pdf_cover_invalid_identity");
  return `${userId}/pdf-covers/${documentId}/${version}/${sourceSha256}.webp`;
}

export function pdfCoverEtag(sha256: string) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("pdf_cover_invalid_digest");
  return `"${sha256}"`;
}

/** Only retry infrastructure/timeout failures; corrupt PDFs stop immediately. */
export function pdfCoverFailure(error: unknown): { code: string; retryable: boolean } {
  const code = error instanceof Error ? error.message : "";
  const permanent = ["pdf_cover_invalid", "pdf_cover_encrypted", "pdf_cover_too_large", "pdf_cover_too_many_pages", "pdf_cover_invalid_output", "pdf_cover_checksum_mismatch", "pdf_cover_size_mismatch"];
  return permanent.includes(code) ? { code, retryable: false } : { code: "pdf_cover_unavailable", retryable: true };
}
