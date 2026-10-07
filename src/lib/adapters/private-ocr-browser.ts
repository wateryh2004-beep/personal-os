import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "unpdf/pdfjs";
import { OCR_ASSET_PATH, OCR_MAX_BYTES, OCR_MAX_CHARACTERS, OCR_MAX_PAGES, OCR_MAX_PIXELS, OCR_PAGE_TIMEOUT_MS, ocrImageSize, ocrKind, ocrText } from "@/features/files/ocr-policy";

export type OcrProgress = { page: number; total: number; progress: number; phase: "loading" | "recognizing" };
/** Disposable supervisor: termination kills language loading and recognition, too. */
export class LocalOcrWorker {
  private worker: Worker;
  private pending: { resolve: (text: string) => void; reject: (error: Error) => void } | null = null;
  private stopped = false;
  constructor(private signal: AbortSignal, private onProgress: (progress: number) => void) {
    signal.throwIfAborted();
    this.worker = new Worker(`${OCR_ASSET_PATH}/runner.js`);
    this.worker.onmessage = ({ data }) => {
      if (this.stopped) return;
      if (data.type === "progress") this.onProgress(Math.max(0, Math.min(1, Number(data.progress) || 0)));
      else if (data.type === "ready" || data.type === "result") { const pending = this.pending; this.pending = null; pending?.resolve(data.text ?? ""); }
      else if (data.type === "error") this.stop(new Error("ocr_engine_failed"));
    };
    this.worker.onerror = () => this.stop(new Error("ocr_engine_failed"));
    signal.addEventListener("abort", this.abort, { once: true });
  }
  private abort = () => this.stop(new Error("ocr_cancelled"));
  private send(data: object, transfer: Transferable[] = []) {
    if (this.stopped) return Promise.reject(new Error("ocr_cancelled"));
    return new Promise<string>((resolve, reject) => { this.pending = { resolve, reject }; this.worker.postMessage(data, transfer); });
  }
  initialize() { return this.send({ type: "init" }); }
  recognize(bytes: ArrayBuffer) { return this.send({ type: "recognize", bytes }, [bytes]); }
  stop(error = new Error("ocr_cancelled")) {
    if (this.stopped) return;
    this.stopped = true; this.signal.removeEventListener("abort", this.abort); this.worker.terminate();
    this.pending?.reject(error); this.pending = null;
  }
}
function checkedText(value: string) {
  const text = ocrText(value);
  if (text.length > OCR_MAX_CHARACTERS) throw new Error("ocr_too_much_text");
  return text;
}
export async function recognizePrivateDocument(input: {
  bytes: Uint8Array<ArrayBuffer>; filename: string; mimeType: string; signal: AbortSignal;
  onProgress: (progress: OcrProgress) => void; onPage: (page: number, total: number) => Promise<void>;
}) {
  const { signal } = input;
  if (input.bytes.length > OCR_MAX_BYTES) throw new Error("ocr_too_large");
  signal.throwIfAborted();
  const kind = ocrKind(input.filename, input.mimeType);
  if (!kind) throw new Error("ocr_invalid_image");
  let engine: LocalOcrWorker | undefined, loading: PDFDocumentLoadingTask | undefined, pdf: PDFDocumentProxy | undefined;
  let render: RenderTask | undefined, bitmap: ImageBitmap | undefined, canvas: HTMLCanvasElement | undefined;
  let page = 0, total = 1;
  const release = () => { engine?.stop(); render?.cancel(); void loading?.destroy().catch(() => {}); bitmap?.close(); };
  signal.addEventListener("abort", release, { once: true });
  const recognize = async (value: HTMLCanvasElement) => {
    if (!engine) {
      input.onProgress({ page, total, progress: 0, phase: "loading" });
      engine = new LocalOcrWorker(signal, progress => input.onProgress({ page, total, progress, phase: "recognizing" }));
      await engine.initialize();
    }
    signal.throwIfAborted();
    const blob = await new Promise<Blob>((resolve, reject) => value.toBlob(result => result ? resolve(result) : reject(new Error("ocr_invalid_image")), "image/png"));
    signal.throwIfAborted();
    return engine.recognize(await blob.arrayBuffer());
  };
  const texts: string[] = [];
  try {
    if (kind === "pdf") {
      const { getDocument } = await import("unpdf/pdfjs");
      signal.throwIfAborted();
      loading = getDocument({ data: input.bytes, useSystemFonts: true, enableXfa: false,
        maxImageSize: OCR_MAX_PIXELS, canvasMaxAreaInBytes: OCR_MAX_PIXELS * 4, useWorkerFetch: false,
        useWasm: false, isImageDecoderSupported: false, stopAtErrors: true, verbosity: 0 });
      pdf = await loading.promise;
      if (pdf.numPages > OCR_MAX_PAGES) throw new Error("ocr_too_many_pages");
      total = pdf.numPages;
    } else {
      ocrImageSize(input.bytes);
      bitmap = await createImageBitmap(new Blob([input.bytes]));
      signal.throwIfAborted();
    }
    for (page = 1; page <= total; page++) {
      signal.throwIfAborted();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const task = async () => {
        if (pdf) {
          const pdfPage = await pdf.getPage(page);
          try {
            const content = await pdfPage.getTextContent();
            const textLayer = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
            if (textLayer.replace(/\s/g, "").length >= 80) return textLayer;
            const base = pdfPage.getViewport({ scale: 1 });
            if (![base.width, base.height].every(v => Number.isFinite(v) && v > 0)) throw new Error("ocr_invalid_image");
            const scale = Math.min(2.5, Math.sqrt(OCR_MAX_PIXELS / (base.width * base.height)), 4096 / base.width, 4096 / base.height);
            const viewport = pdfPage.getViewport({ scale });
            canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
            render = pdfPage.render({ canvas, viewport, annotationMode: 0, background: "rgb(255,255,255)" });
            await render.promise; signal.throwIfAborted();
            const recognized = await recognize(canvas);
            return recognized.trim() ? recognized : textLayer;
          } finally { pdfPage.cleanup(); }
        }
        const scale = Math.min(1, Math.sqrt(OCR_MAX_PIXELS / (bitmap!.width * bitmap!.height)), 4096 / bitmap!.width, 4096 / bitmap!.height);
        canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.floor(bitmap!.width * scale)); canvas.height = Math.max(1, Math.floor(bitmap!.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("ocr_invalid_image");
        context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap!, 0, 0, canvas.width, canvas.height);
        return recognize(canvas);
      };
      try {
        input.onProgress({ page, total, progress: 0, phase: "recognizing" });
        const text = await Promise.race([task(), new Promise<never>((_, reject) => { timer = setTimeout(() => { release(); reject(new Error("ocr_timeout")); }, OCR_PAGE_TIMEOUT_MS); })]);
        signal.throwIfAborted(); texts.push(text); checkedText(texts.join("\n\n"));
        await input.onPage(page, total);
      } finally { if (timer) clearTimeout(timer); if (canvas) { canvas.width = 0; canvas.height = 0; } }
    }
    const text = checkedText(texts.join("\n\n"));
    if (!text) throw new Error("ocr_no_text");
    return { text, pages: total, emptyPages: texts.filter(value => !value.trim()).length };
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new Error("ocr_encrypted");
    throw error;
  } finally { signal.removeEventListener("abort", release); release(); }
}
