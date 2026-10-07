import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import {
  PDF_COVER_MAX_EDGE,
  PDF_COVER_MAX_OUTPUT_BYTES,
  PDF_COVER_MAX_PAGE_PIXELS,
  PDF_COVER_MAX_PAGES,
  PDF_COVER_MAX_SOURCE_BYTES,
  PDF_COVER_RENDER_TIMEOUT_MS,
  PDF_COVER_WEBP_QUALITY,
} from "@/features/files/pdf-cover-policy";

export type PdfCoverImage = { bytes: Uint8Array; width: number; height: number };

const failureCodes = new Set([
  "pdf_cover_invalid", "pdf_cover_encrypted", "pdf_cover_too_large",
  "pdf_cover_too_many_pages", "pdf_cover_invalid_output", "pdf_cover_unavailable",
]);

// A process is deliberately used instead of Promise.race or worker.terminate():
// SIGKILL also stops a synchronous native canvas/image decoder that has hung.
// Keep each server instance to one renderer. The durable job lease/retry owns
// retries rather than accumulating an unbounded in-memory work queue.
let rendering = false;

function validImage(value: unknown): value is PdfCoverImage {
  if (!value || typeof value !== "object") return false;
  const image = value as Partial<PdfCoverImage>;
  return image.bytes instanceof Uint8Array && image.bytes.byteLength > 12 &&
    image.bytes.byteLength <= PDF_COVER_MAX_OUTPUT_BYTES &&
    Number.isInteger(image.width) && Number.isInteger(image.height) &&
    image.width! > 0 && image.height! > 0 &&
    image.width! <= PDF_COVER_MAX_EDGE && image.height! <= PDF_COVER_MAX_EDGE &&
    Buffer.from(image.bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(image.bytes.subarray(8, 12)).toString("ascii") === "WEBP";
}

export async function renderPdfCover(bytes: Uint8Array, signal?: AbortSignal): Promise<PdfCoverImage> {
  if (signal?.aborted) throw new Error("pdf_cover_aborted");
  if (bytes.byteLength > PDF_COVER_MAX_SOURCE_BYTES) throw new Error("pdf_cover_too_large");
  if (bytes.byteLength < 8 || !Buffer.from(bytes.subarray(0, 1024)).includes(Buffer.from("%PDF-"))) {
    throw new Error("pdf_cover_invalid");
  }
  if (rendering) throw new Error("pdf_cover_renderer_busy");
  rendering = true;

  try {
    return await new Promise<PdfCoverImage>((resolve, reject) => {
      let child: ChildProcess;
      try {
        // Next's tracing explicitly packages this unbundled ESM worker and all
        // its runtime/native/font assets. No PDF code enters a browser bundle.
        // Use spawn with an IPC channel: Turbopack treats fork's filename as a
        // module entry and attempts to bundle it, which breaks native assets.
        child = spawn(process.execPath, ["--max-old-space-size=192", "--disable-proto=throw",
          path.join(process.cwd(), "scripts/pdf-cover-render-worker.mjs")], {
          serialization: "advanced",
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          // Rendering doesn't need the app's database, R2 or authentication
          // secrets. Never pass source names, URLs or identifiers either.
          env: { NODE_ENV: "production", LANG: "en_US.UTF-8", TZ: "UTC", ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}) },
        });
      } catch {
        reject(new Error("pdf_cover_unavailable"));
        return;
      }

      let result: PdfCoverImage | undefined;
      let failure: Error | undefined;
      let settled = false;
      const stop = (code: string) => {
        failure ??= new Error(code);
        child.kill("SIGKILL");
      };
      const abort = () => stop("pdf_cover_aborted");
      const timer = setTimeout(() => stop("pdf_cover_timeout"), PDF_COVER_RENDER_TIMEOUT_MS);
      signal?.addEventListener("abort", abort, { once: true });
      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (failure) reject(failure);
        else if (code === 0 && result) resolve(result);
        else reject(new Error("pdf_cover_unavailable"));
      };
      child.once("error", () => {
        stop("pdf_cover_unavailable");
        // A spawn failure has no process to reap. Also settle in runtimes
        // which omit the subsequent close event in this particular case.
        if (!child.pid) finish(null);
      });
      child.on("message", (message: unknown) => {
        if (result || failure) return;
        if (validImage(message)) {
          result = message;
        } else {
          const code = message && typeof message === "object" && "error" in message ? message.error : null;
          stop(typeof code === "string" && failureCodes.has(code) ? code : "pdf_cover_invalid_output");
        }
      });
      // Wait for actual process closure on both success and cancellation. This
      // ensures no CPU/native buffers survive a supposedly finished job.
      child.once("close", finish);
      if (signal?.aborted) {
        abort();
        return;
      }
      child.send({
        bytes,
        limits: {
          maxSourceBytes: PDF_COVER_MAX_SOURCE_BYTES,
          maxOutputBytes: PDF_COVER_MAX_OUTPUT_BYTES,
          maxPages: PDF_COVER_MAX_PAGES,
          maxEdge: PDF_COVER_MAX_EDGE,
          maxCanvasPixels: PDF_COVER_MAX_PAGE_PIXELS,
          quality: PDF_COVER_WEBP_QUALITY,
        },
      }, (error) => { if (error) stop("pdf_cover_unavailable"); });
    });
  } finally {
    rendering = false;
  }
}
