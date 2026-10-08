/* eslint-disable @typescript-eslint/no-require-imports -- CI-only read-only fixture server. */
// Never imported by the application. Run only in the isolated synthetic CI job.
// Unlike Playwright route interception, this preserves Chromium's HTTP cache.
const http = require("node:http");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const sharp = require("sharp");
const { syntheticPdf, syntheticCover } = require("./fixtures/pdf-cover-fixtures.cjs");
if (process.env.E2E_MOBILE_HARNESS !== "1") throw new Error("Set E2E_MOBILE_HARNESS=1 only for the isolated synthetic fixture run");
const port = Number(process.env.E2E_COVERS_PROXY_PORT || 4187);
const upstreamPort = Number(process.env.E2E_APP_PORT || 3000);
const knownIds = new Set(Array.from({ length: 6 }, (_, index) => `e2e-cached-cover-${index}`));
const requests = [];
const attempts = new Map();
let active = 0, maximum = 0;

(async () => {
  const pdf = syntheticPdf();
  const chinesePdf = await readFile("tests/fixtures/pdf-covers/chinese-embedded.pdf");
  const landscapePdf = syntheticPdf(true);
  // Sequential, bounded renders at startup only. Cached responses below reuse
  // the resulting real first-page WebPs, never SVG stand-ins or browser PDF.js.
  const portrait = await syntheticCover(pdf);
  const chinese = await syntheticCover(chinesePdf);
  const landscape = await syntheticCover(landscapePdf);
  const artifactDirectory = "test-results/pdf-cached-covers";
  await mkdir(artifactDirectory, { recursive: true });
  const rendererFixtures = {};
  for (const [name, source, image] of [["portrait", pdf, portrait], ["chinese", chinesePdf, chinese], ["landscape", landscapePdf, landscape]]) {
    const metadata = await sharp(image).metadata();
    rendererFixtures[name] = { sourceBytes: source.length, imageBytes: image.length, width: metadata.width, height: metadata.height, format: metadata.format };
    await writeFile(`${artifactDirectory}/rendered-${name}.webp`, image);
    await writeFile(`${artifactDirectory}/source-${name}.pdf`, source);
  }
  await writeFile(`${artifactDirectory}/renderer-fixtures.json`, JSON.stringify(rendererFixtures, null, 2));
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const run = String(request.headers["x-fixture-run"] || "unknown");
    const entry = { run, path: url.pathname, method: request.method, range: request.headers.range || null,
      conditional: request.headers["if-none-match"] || null, status: null, bodyBytes: 0, at: Date.now() };
    const send = (status, body = "", headers = {}) => {
      entry.status = status; entry.bodyBytes = request.method === "HEAD" ? 0 : Buffer.byteLength(body);
      response.writeHead(status, { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", ...headers });
      response.end(request.method === "HEAD" ? undefined : body);
    };
    if (!["GET", "HEAD"].includes(request.method)) {
      requests.push(entry); return send(405, "Synthetic fixture forbids writes");
    }
    if (url.pathname === "/__fixture/stats") {
      const filtered = requests.filter(item => item.run === url.searchParams.get("run"));
      return send(200, JSON.stringify({ requests: filtered, active, maximum, rendererFixtures,
        authentication: "Synthetic fixture only; no production authentication, database or R2 is exercised" }), { "Content-Type": "application/json" });
    }
    const match = /^\/api\/files\/([^/]+)\/(pdf-cover|preview|download)$/.exec(url.pathname);
    if (match) {
      requests.push(entry);
      const [, id, operation] = match;
      if (!knownIds.has(id)) return send(404, "Unknown synthetic document");
      if (operation === "download") return send(409, "Original downloads are forbidden in this browser test");
      if (operation === "preview") {
        const pdf = id.endsWith("-1") ? chinesePdf : id.endsWith("-3") ? landscapePdf : syntheticPdf();
        const headers = { "Content-Type": "application/pdf", "Content-Length": String(pdf.length), "Content-Disposition": "inline", "Accept-Ranges": "bytes" };
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || "");
        if (range && request.method !== "HEAD") {
          const start = Number(range[1]), end = Math.min(Number(range[2] || pdf.length - 1), pdf.length - 1);
          if (start > end) return send(416);
          const body = pdf.subarray(start, end + 1);
          return send(206, body, { ...headers, "Content-Length": String(body.length), "Content-Range": `bytes ${start}-${end}/${pdf.length}` });
        }
        return send(200, pdf, headers);
      }
      if (request.method !== "GET") return send(405);
      active++; maximum = Math.max(maximum, active);
      try {
        const key = `${run}:${id}`, attempt = (attempts.get(key) || 0) + 1;
        attempts.set(key, attempt);
        await new Promise(resolve => setTimeout(resolve, id.endsWith("-0") && attempt === 1 ? 650 : 120));
        if (id.endsWith("-1") && attempt <= 2) return send(202, JSON.stringify({ status: "pending" }), { "Content-Type": "application/json", "Retry-After": "1" });
        if (id.endsWith("-2")) return send(422, JSON.stringify({ error: "Synthetic damaged PDF" }), { "Content-Type": "application/json" });
        if (id.endsWith("-4")) return send(415, JSON.stringify({ error: "Synthetic unsupported PDF" }), { "Content-Type": "application/json" });
        if (id.endsWith("-5")) return send(503, JSON.stringify({ error: "Synthetic renderer disabled" }), { "Content-Type": "application/json" });
        const body = id.endsWith("-3") ? landscape : id.endsWith("-1") ? chinese : portrait;
        const etag = `"synthetic-cover-${id}-v1"`;
        const headers = { "Content-Type": "image/webp", "Cache-Control": "private, max-age=0, must-revalidate", "ETag": etag, "Vary": "Cookie", "Content-Length": String(body.length) };
        if (request.headers["if-none-match"] === etag) return send(304, "", headers);
        return send(200, body, headers);
      } finally { active--; }
    }
    if (url.pathname.startsWith("/api/")) { requests.push(entry); return send(200, "{}", { "Content-Type": "application/json" }); }
    // Only the explicitly gated harness and its local assets can reach Next.
    if (!url.pathname.startsWith("/_next/") && !["/mobile-native-e2e", "/favicon.ico"].includes(url.pathname)) {
      requests.push(entry); return send(404, "Only the synthetic harness is available");
    }
    const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort, path: request.url, method: request.method,
      headers: { ...request.headers, host: `127.0.0.1:${upstreamPort}` } }, incoming => {
      response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);
    });
    upstream.on("error", () => { if (!response.headersSent) send(502, "Synthetic app not ready"); else response.destroy(); });
    request.pipe(upstream);
  });
  server.listen(port, "127.0.0.1", () => console.log(`Synthetic cached-cover proxy listening on 127.0.0.1:${port}`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)));
})().catch(error => { console.error(error); process.exitCode = 1; });
