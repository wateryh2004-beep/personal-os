/* A disposable supervisor keeps initialization and recognition off the UI thread.
 * Terminating this Worker also terminates its descendant Tesseract worker.
 * Assets are versioned, copied from pinned npm packages, and same-origin only. */
/* global importScripts, Tesseract */
importScripts("./tesseract.min.js");
let recognizer;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const root = new URL("./", self.location.href).href;
      recognizer = await Tesseract.createWorker("chi_sim+eng", 1, {
        workerPath: `${root}worker.min.js`, corePath: `${root}core`, langPath: `${root}lang`,
        workerBlobURL: false, cacheMethod: "none", gzip: true,
        logger: progress => self.postMessage({ type: "progress", progress: progress.progress }),
        errorHandler: () => self.postMessage({ type: "error", error: "ocr_engine_failed" }),
      }, { tessedit_load_sublangs: "" }); // Only the two explicitly bundled horizontal-language models.
      self.postMessage({ type: "ready" });
    } else if (data.type === "recognize" && recognizer) {
      const result = await recognizer.recognize(new Uint8Array(data.bytes), {}, { text: true });
      self.postMessage({ type: "result", text: result.data.text });
    }
  } catch {
    self.postMessage({ type: "error", error: "ocr_engine_failed" });
  }
};
