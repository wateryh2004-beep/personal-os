/** Run after next build. No network, app credentials, database or real PDFs. */
import { fork } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const traces = [
  ".next/server/app/api/files/[documentId]/pdf-cover/route.js.nft.json",
  ".next/server/app/api/files/upload-url/route.js.nft.json",
  ".next/server/app/api/cron/files-extraction/route.js.nft.json",
];
const worker = "scripts/pdf-cover-render-worker.mjs";
const required = [
  worker,
  "node_modules/pdfjs-dist/legacy/build/pdf.mjs",
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "node_modules/pdfjs-dist/cmaps/UniGB-UCS2-H.bcmap",
  "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",
  "node_modules/pdfjs-dist/wasm/openjpeg.wasm",
  "node_modules/pdfjs-dist/wasm/LICENSE_OPENJPEG",
  "node_modules/pdfjs-dist/LICENSE",
  "node_modules/@napi-rs/canvas/index.js",
  "node_modules/sharp/dist/index.cjs",
  "node_modules/sharp/dist/index.mjs",
];
const runtimeFile = (file) => file === worker || /^(node_modules\/(pdfjs-dist|@napi-rs\/canvas[^/]*|sharp|@img\/[^/]+|detect-libc|semver))\//.test(file);
const bytes = new Uint8Array(await readFile(path.join(root, "tests/fixtures/pdf-covers/chinese-embedded.pdf")));
const artifactDir = path.join(root, "test-results/pdf-renderer");
await mkdir(artifactDir, { recursive: true });
const results = [];

for (const trace of traces) {
  const manifest = JSON.parse(await readFile(path.join(root, trace), "utf8"));
  const files = new Set(manifest.files.map((file) => path.relative(root, path.resolve(root, path.dirname(trace), file))));
  for (const file of required) {
    if (!files.has(file)) throw new Error(`${trace} is missing runtime asset ${file}`);
  }
  if (![...files].some((file) => /^node_modules\/@napi-rs\/canvas-.*\.node$/.test(file))) {
    throw new Error(`${trace} is missing the platform's native canvas binding`);
  }
  const copied = [...files].filter(runtimeFile);
  const directory = await mkdtemp(path.join(os.tmpdir(), "pdf-cover-package-"));
  let assetBytes = 0;
  try {
    for (const file of copied) {
      const source = path.join(root, file);
      const destination = path.join(directory, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
      assetBytes += (await stat(source)).size;
    }
    const started = performance.now();
    const output = await new Promise((resolve, reject) => {
      const child = fork(path.join(directory, worker), [], {
        cwd: directory,
        env: { NODE_ENV: "production", LANG: "en_US.UTF-8", TZ: "UTC" },
        execArgv: ["--max-old-space-size=192", "--disable-proto=throw"],
        serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      let result;
      const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
      child.on("message", (message) => { result = message; });
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && result?.bytes?.byteLength && !result.error) resolve(result);
        else reject(new Error(`Packaged renderer failed: ${result?.error ?? code}`));
      });
      child.send({ bytes, limits: { maxSourceBytes: 12 * 1024 * 1024, maxOutputBytes: 128 * 1024,
        maxPages: 500, maxEdge: 512, maxCanvasPixels: 16_000_000, quality: 78 } });
    });
    const durationMs = Math.round(performance.now() - started);
    if (output.width !== 362 || output.height !== 512 || output.bytes.byteLength > 128 * 1024) {
      throw new Error(`Packaged renderer returned invalid dimensions/size for ${trace}`);
    }
    results.push({ trace, runtimeFiles: copied.length, assetBytes, durationMs, outputBytes: output.bytes.byteLength });
    await writeFile(path.join(artifactDir, "packaged-chinese.webp"), output.bytes);
    console.log(`PASS ${trace}: ${copied.length} runtime files, ${assetBytes} bytes, render ${durationMs}ms`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
await writeFile(path.join(artifactDir, "package-metrics.json"), JSON.stringify({ node: process.version, results }, null, 2));
