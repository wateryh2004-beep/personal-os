/**
 * Private, one-shot Node process. Do not import this from application bundles.
 * PDF.js's supported Node renderer:
 * https://github.com/mozilla/pdf.js/tree/master/examples/node/pdf2png
 */
import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, AnnotationMode } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const asset = (name) => path.join(pdfRoot, name) + path.sep;
sharp.cache(false);
sharp.concurrency(1);

// PDF.js 6.4 can resolve a truncated operator list before propagating a strict
// parsing error. Its recoverable path emits diagnostics instead. Capture those
// inside this private one-shot process and fail closed on content/font/image
// loss, without logging document text or sending diagnostic details upstream.
let diagnosticFailure;
console.log = console.warn = (...args) => {
  const message = args.map(String).join(" ");
  if (!message.startsWith("Warning:") || message.includes("Indexing all PDF objects")) return;
  diagnosticFailure ??= /maximum allowed size|pdf_cover_too_large/.test(message) ? "pdf_cover_too_large"
    : /Unable to load.*(font|CMap|WASM)|ENOENT|Cannot find (module|package)/i.test(message) ? "pdf_cover_unavailable"
      : "pdf_cover_invalid";
};

/** Bound intermediate native canvases as well as the final 512px canvas. */
function canvasFactory(maxPixels) {
  return class BoundedCanvasFactory {
    entries = new Set();
    pixels = 0;
    check(width, height, replaced = 0) {
      const size = width * height;
      if (!Number.isFinite(size) || width < 1 || height < 1 || width > maxPixels || height > maxPixels ||
          size > maxPixels || this.pixels - replaced + size > maxPixels * 2) {
        throw new Error("pdf_cover_too_large");
      }
      return size;
    }
    create(width, height) {
      width = Math.ceil(width);
      height = Math.ceil(height);
      const pixels = this.check(width, height);
      const canvas = createCanvas(width, height);
      const entry = { canvas, context: canvas.getContext("2d") };
      this.entries.add(entry);
      this.pixels += pixels;
      return entry;
    }
    reset(entry, width, height) {
      width = Math.ceil(width);
      height = Math.ceil(height);
      const previous = entry.canvas.width * entry.canvas.height;
      const pixels = this.check(width, height, previous);
      entry.canvas.width = width;
      entry.canvas.height = height;
      this.pixels += pixels - previous;
    }
    destroy(entry) {
      if (!entry.canvas) return;
      this.pixels -= entry.canvas.width * entry.canvas.height;
      entry.canvas.width = entry.canvas.height = 0;
      entry.canvas = entry.context = null;
      this.entries.delete(entry);
    }
    destroyAll() {
      for (const entry of this.entries) this.destroy(entry);
    }
  };
}

async function render(bytes, limits) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error("pdf_cover_invalid");
  if (bytes.byteLength > limits.maxSourceBytes) throw new Error("pdf_cover_too_large");
  let document;
  let page;
  let loading;
  try {
    loading = getDocument({
      data: Uint8Array.from(bytes),
      cMapUrl: asset("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: asset("standard_fonts"),
      wasmUrl: asset("wasm"),
      iccUrl: asset("iccs"),
      CanvasFactory: canvasFactory(limits.maxCanvasPixels),
      useWorkerFetch: false,
      useSystemFonts: false,
      disableFontFace: true,
      enableXfa: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      stopAtErrors: false,
      maxImageSize: limits.maxCanvasPixels,
      canvasMaxAreaInBytes: limits.maxCanvasPixels * 4,
      verbosity: 1,
    });
    document = await loading.promise;
    if (document.numPages < 1) throw new Error("pdf_cover_invalid");
    if (document.numPages > limits.maxPages) throw new Error("pdf_cover_too_many_pages");
    // XFA needs a DOM-based layout engine. Preserve the original and use the
    // placeholder rather than silently caching an incomplete form cover.
    if ((await document.getMetadata()).info.IsXFAPresent) throw new Error("pdf_cover_invalid");
    page = await document.getPage(1);
    const original = page.getViewport({ scale: 1 });
    if (![original.width, original.height].every((n) => Number.isFinite(n) && n > 0)) {
      throw new Error("pdf_cover_invalid");
    }
    // getViewport includes /Rotate and UserUnit. Contain the complete page;
    // there is no crop, forced portrait aspect ratio or stretch.
    const viewport = page.getViewport({ scale: limits.maxEdge / Math.max(original.width, original.height) });
    const width = Math.min(limits.maxEdge, Math.max(1, Math.ceil(viewport.width)));
    const height = Math.min(limits.maxEdge, Math.max(1, Math.ceil(viewport.height)));
    const target = document.canvasFactory.create(width, height);
    await page.render({
      canvasContext: target.context,
      viewport,
      background: "rgb(255,255,255)",
      annotationMode: AnnotationMode.ENABLE,
    }).promise;
    if (diagnosticFailure) throw new Error(diagnosticFailure);
    const text = await page.getTextContent();
    for (const item of text.items) {
      // Without an embedded or packaged substitute font, never cache tofu or
      // missing glyphs as a successful cover. Scanned pages have no text items.
      if (item.str?.trim() && item.fontName && page.commonObjs.has(item.fontName) &&
          page.commonObjs.get(item.fontName).missingFile) throw new Error("pdf_cover_invalid");
    }
    if (diagnosticFailure) throw new Error(diagnosticFailure);
    const png = target.canvas.toBuffer("image/png");
    document.canvasFactory.destroy(target);
    // Re-encode rather than retaining embedded metadata or attachments. A
    // lower-quality retry keeps noisy scanned pages within the cache budget.
    for (const quality of [limits.quality, 60, 40, 20]) {
      const encoded = await sharp(png, { limitInputPixels: limits.maxEdge ** 2 })
        .flatten({ background: "#ffffff" })
        .webp({ quality, effort: 3, smartSubsample: true })
        .toBuffer();
      if (encoded.byteLength <= limits.maxOutputBytes) return { bytes: encoded, width, height };
    }
    throw new Error("pdf_cover_invalid_output");
  } finally {
    page?.cleanup();
    document?.canvasFactory.destroyAll();
    if (loading) await loading.destroy();
  }
}

function safeError(error) {
  if (error?.name === "PasswordException") return "pdf_cover_encrypted";
  if (["ENOENT", "EACCES", "ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"].includes(error?.code) ||
      /Cannot find (module|package)|native binding|Failed to load.*(font|wasm)|ENOENT/i.test(error?.message ?? "")) {
    return "pdf_cover_unavailable";
  }
  if (["pdf_cover_too_large", "pdf_cover_too_many_pages", "pdf_cover_invalid_output", "pdf_cover_unavailable"].includes(error?.message)) return error.message;
  if (error?.message?.includes("maximum allowed size")) return "pdf_cover_too_large";
  return "pdf_cover_invalid";
}

// No document paths, remote URLs, persistence, source text or app credentials.
// Each process receives one bounded buffer and exits after returning its image.
process.once("message", async ({ bytes, limits }) => {
  let message;
  try { message = await render(bytes, limits); }
  catch (error) { message = { error: safeError(error) }; }
  process.send(message, () => process.exit(0));
});
process.once("disconnect", () => process.exit(1));
