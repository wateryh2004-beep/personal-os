/* eslint-disable @typescript-eslint/no-require-imports -- Isolated synthetic CI artwork. */
const { fork } = require("node:child_process");
const path = require("node:path");

function syntheticPdf(landscape = false) {
  const rotate = landscape ? " /Rotate 90" : "";
  const streams = [1, 2].map(page => `0.12 0.35 0.40 rg 0 540 612 252 re f 0.92 0.96 0.95 rg 40 80 532 410 re f 1 1 1 rg BT /F1 28 Tf 44 725 Td (SYNTHETIC PDF) Tj 0 -45 Td /F1 20 Tf (First page cover - page ${page}) Tj ET 0.15 0.22 0.25 rg BT /F1 16 Tf 60 450 Td (Fixture document - no personal data) Tj ET\n`);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]${rotate} /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${streams[0].length} >>\nstream\n${streams[0]}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]${rotate} /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>`,
    `<< /Length ${streams[1].length} >>\nstream\n${streams[1]}endstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const start = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body);
}

// Exercise the exact one-shot renderer shipped by the application. These are
// fixture buffers only; there is no storage client, URL, or account credential.
function syntheticCover(source = false) {
  const bytes = typeof source === "boolean" ? syntheticPdf(source) : source;
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, "../pdf-cover-render-worker.mjs"), [], {
      execArgv: ["--max-old-space-size=192", "--disable-proto=throw"], serialization: "advanced",
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { NODE_ENV: "production", LANG: "en_US.UTF-8", TZ: "UTC" },
    });
    let result, failure;
    const timer = setTimeout(() => { failure = new Error("Synthetic cover renderer timed out"); child.kill("SIGKILL"); }, 15000);
    child.once("error", error => { failure = error; child.kill("SIGKILL"); });
    child.once("message", message => {
      if (message.error) failure = new Error(message.error);
      else if (!(message.bytes instanceof Uint8Array) || message.bytes.length < 12 || message.bytes.length > 128 * 1024) failure = new Error("Invalid synthetic renderer output");
      else result = Buffer.from(message.bytes);
    });
    child.once("close", code => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code === 0 && result) resolve(result);
      else reject(new Error("Synthetic cover worker did not finish"));
    });
    child.send({ bytes, limits: { maxSourceBytes: 12 * 1024 * 1024, maxOutputBytes: 128 * 1024, maxPages: 500, maxEdge: 512, maxCanvasPixels: 16_000_000, quality: 78 } }, error => {
      if (error) { failure = error; child.kill("SIGKILL"); }
    });
  });
}

module.exports = { syntheticPdf, syntheticCover };
