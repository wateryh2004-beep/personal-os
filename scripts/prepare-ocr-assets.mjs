import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root = resolve("public/ocr/v1");
for (const [name, expected] of [["tesseract.js", "7.0.0"], ["tesseract.js-core", "7.0.0"], ["@tesseract.js-data/eng", "1.0.0"], ["@tesseract.js-data/chi_sim", "1.0.0"]]) {
  const actual = JSON.parse(await readFile(`node_modules/${name}/package.json`, "utf8")).version;
  if (actual !== expected) throw new Error(`Unreviewed OCR asset version: ${name}@${actual}`);
}
await mkdir(`${root}/core`, { recursive: true });
await mkdir(`${root}/lang`, { recursive: true });
const files = [
  ["scripts/private-ocr-runner.js", "runner.js"],
  ["docs/licenses/private-ocr-NOTICE.txt", "NOTICE.txt"],
  ["docs/licenses/naptha-tessdata-Apache-2.0.txt", "LICENSE-tessdata.txt"],
  ["docs/licenses/tessdata-Apache-2.0.txt", "LICENSE-tessdata-best.txt"],
  ["node_modules/tesseract.js/dist/tesseract.min.js.LICENSE.txt", "tesseract.min.js.LICENSE.txt"],
  ["node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt", "worker.min.js.LICENSE.txt"],
  ...["eng", "chi_sim"].map(lang => [`node_modules/@tesseract.js-data/${lang}/package.json`, `lang/${lang}.package.json`]),
  ["node_modules/tesseract.js/dist/tesseract.min.js", "tesseract.min.js"],
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js/LICENSE.md", "LICENSE-tesseract.txt"],
  ["node_modules/tesseract.js-core/LICENSE", "LICENSE-core.txt"],
  ...["eng", "chi_sim"].map(lang => [`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `lang/${lang}.traineddata.gz`]),
];
for (const file of await readdir("node_modules/tesseract.js-core")) {
  if (/^tesseract-core(?:-(?:relaxedsimd|simd))?-lstm\.wasm(?:\.js)?$/.test(file)) files.push([`node_modules/tesseract.js-core/${file}`, `core/${file}`]);
}
const manifest = [];
for (const [source, target] of files) {
  await copyFile(source, `${root}/${target}`);
  const bytes = await readFile(`${root}/${target}`);
  manifest.push({ path: target, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
if (files.filter(([, target]) => target.startsWith("core/")).length !== 6) throw new Error("Missing OCR WASM variants");
await writeFile(`${root}/manifest.json`, JSON.stringify({ engine: "tesseract.js@7.0.0", languages: ["eng@1.0.0", "chi_sim@1.0.0"], files: manifest }, null, 2));
console.log(`Prepared ${files.length} same-origin OCR assets (${manifest.reduce((sum, file) => sum + file.bytes, 0)} bytes)`);
