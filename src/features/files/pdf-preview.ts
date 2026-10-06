import "server-only";

import { fileExtension, maxFileSize, safeFilename } from "@/features/files/schemas";

export const pdfSignatureBytes = 8;
export const pdfPreviewTimeoutMs = 120_000;
export const pdfPreviewHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
};

export type PdfByteRange = { start: number; end: number };
export class PdfPreviewError extends Error {
  constructor(public readonly code: "invalid" | "too_large" | "range" | "unavailable") {
    super(`pdf_preview_${code}`);
  }
}

/** Legacy generic uploads still require a PDF filename and verified signature. */
export function supportsPdfPreview(mime: string, filename: string) {
  const normalized = mime.toLowerCase();
  return normalized === "application/pdf" || (normalized === "application/octet-stream" && fileExtension(filename) === "pdf");
}

export function checkPdfPreviewSize(size: number) {
  if (!Number.isSafeInteger(size) || size < pdfSignatureBytes) throw new PdfPreviewError("invalid");
  if (size > maxFileSize) throw new PdfPreviewError("too_large");
}

/** Normalize one byte range only. Never forward an unparsed browser header. */
export function parsePdfRange(header: string | null, size: number): PdfByteRange | null {
  checkPdfPreviewSize(size);
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) throw new PdfPreviewError("range");
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) throw new PdfPreviewError("range");
  if (!match[1]) {
    if (last < 1) throw new PdfPreviewError("range");
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (match[2] && last < first)) throw new PdfPreviewError("range");
  return { start: first, end: match[2] ? Math.min(last, size - 1) : size - 1 };
}

export function pdfContentRange(range: PdfByteRange, total: number) {
  return `bytes ${range.start}-${range.end}/${total}`;
}

export function pdfInlineDisposition(filename: string) {
  const encoded = encodeURIComponent(safeFilename(filename).toWellFormed())
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="document.pdf"; filename*=UTF-8''${encoded}`;
}

/** Verify both range geometry and version before handing any body to a viewer. */
export async function checkPdfObject(object: {
  body: ReadableStream<Uint8Array>; size: number; etag: string | null; contentRange: string | null;
}, total: number, range: PdfByteRange | null, etag?: string) {
  const length = range ? range.end - range.start + 1 : total;
  if (object.size !== length || object.contentRange !== (range ? pdfContentRange(range, total) : null) ||
      !object.etag || !/^"[\x21\x23-\x7e]{1,256}"$/.test(object.etag) || (etag !== undefined && object.etag !== etag)) {
    await object.body.cancel().catch(() => {});
    throw new PdfPreviewError("invalid");
  }
  return object.etag;
}

/** Backpressure-aware streaming; truncation, overflow, abort and cancel close R2. */
export function streamPdfBytes(body: ReadableStream<Uint8Array>, expectedSize: number, signal: AbortSignal) {
  const reader = body.getReader();
  let received = 0;
  let terminal = false;
  let disposePromise: Promise<void> | undefined;
  let abort: () => void;
  const dispose = () => {
    signal.removeEventListener("abort", abort);
    return disposePromise ??= reader.cancel().catch(() => {}).then(() => { reader.releaseLock(); });
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        if (terminal) return;
        terminal = true;
        controller.error(new PdfPreviewError("unavailable"));
        void dispose();
      };
      signal.addEventListener("abort", abort, { once: true });
      if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > maxFileSize) {
        terminal = true;
        controller.error(new PdfPreviewError("invalid"));
        void dispose();
      } else if (signal.aborted) abort();
    },
    async pull(controller) {
      if (terminal) return;
      try {
        let chunk = await reader.read();
        while (!terminal && !chunk.done && !chunk.value.byteLength) chunk = await reader.read();
        if (terminal) return;
        const { value, done } = chunk;
        if (done) throw new PdfPreviewError("invalid");
        received += value.byteLength;
        if (received > expectedSize) throw new PdfPreviewError("invalid");
        if (received === expectedSize) {
          // Check EOF before exposing the final chunk. This also rejects a
          // lying Content-Length when the upstream stream sends extra bytes.
          while (true) {
            const tail = await reader.read();
            if (terminal) return;
            if (tail.done) break;
            if (tail.value.byteLength) throw new PdfPreviewError("invalid");
          }
          terminal = true;
          signal.removeEventListener("abort", abort);
          reader.releaseLock();
          controller.enqueue(value);
          controller.close();
        } else if (value.byteLength) controller.enqueue(value);
      } catch (error) {
        if (!terminal) {
          terminal = true;
          controller.error(error instanceof PdfPreviewError ? error : new PdfPreviewError("unavailable"));
          await dispose();
        }
      }
    },
    async cancel() {
      if (terminal) return;
      terminal = true;
      await dispose();
    },
  }, { highWaterMark: 0 });
}

/** Only the eight-byte signature is buffered, never the PDF document. */
export async function validatePdfSignature(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = streamPdfBytes(body, pdfSignatureBytes, signal).getReader();
  const prefix = new Uint8Array(pdfSignatureBytes);
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      prefix.set(value, offset);
      offset += value.byteLength;
    }
    if (!/^%PDF-(?:1\.[0-7]|2\.0)$/.test(new TextDecoder().decode(prefix))) throw new PdfPreviewError("invalid");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
