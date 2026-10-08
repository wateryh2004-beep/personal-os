/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic CI browser verification. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");

(async () => {
  const output = "test-results/map-attribution-security";
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const evidence = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      // Serve the unchanged published ESM files (including its module worker)
      // through interception. No server, real tiles, account, or external I/O.
      const origin = "http://127.0.0.1:4189";
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><title>Synthetic map attribution security</title><div id="map" style="width:100%;height:600px"></div>' });
        if (!/^\/dist\/maplibre-gl(?:-shared|-worker)?\.(?:mjs|css)$/.test(url.pathname)) return route.abort();
        return route.fulfill({ contentType: url.pathname.endsWith(".css") ? "text/css" : "text/javascript",
          body: await readFile(path.join(process.cwd(), "node_modules/maplibre-gl", url.pathname.slice(1))) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin);
      await page.addStyleTag({ url: `${origin}/dist/maplibre-gl.css` });
      await page.addScriptTag({ type: "module", content: 'import * as maplibregl from "/dist/maplibre-gl.mjs"; window.maplibregl = maplibregl;' });
      await page.waitForFunction(() => Boolean(window.maplibregl));
      await page.evaluate(async () => {
        window.__unsafeAttribution = false;
        const map = new window.maplibregl.Map({ container: "map", center: [0, 0], zoom: 1,
          style: { version: 8, sources: { fixture: { type: "geojson",
            attribution: '<details open onload="void 0" ontoggle="window.__unsafeAttribution = true">Synthetic source credit</details>',
            data: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } }] } } },
          layers: [{ id: "fixture", type: "circle", source: "fixture", paint: { "circle-radius": 8 } }] },
          attributionControl: { compact: false, customAttribution: '<a href="https://example.test/credit">Synthetic safe credit</a>' } });
        await new Promise((resolve, reject) => { map.once("load", resolve); map.once("error", event => reject(new Error(event.error.message))); });
        new window.maplibregl.Marker().setLngLat([0, 0])
          .setPopup(new window.maplibregl.Popup().setText('<img src=x onerror="unsafe"> Synthetic place'))
          .addTo(map).togglePopup();
        window.__securityTestMap = map;
      });
      const attribution = page.locator(".maplibregl-ctrl-attrib-inner");
      await attribution.getByText("Synthetic source credit").waitFor();
      assert.equal(await attribution.locator("[onload], [ontoggle]").count(), 0);
      assert.equal(await attribution.locator('a[href="https://example.test/credit"]').count(), 1);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.__unsafeAttribution), false);
      assert.equal(await page.locator(".maplibregl-popup-content img").count(), 0);
      assert.match(await page.locator(".maplibregl-popup-content").textContent(), /Synthetic place/);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/map-${width}.png` });
      evidence.push({ width, version: await page.evaluate(() => window.maplibregl.getVersion()), attributionSafe: true, popupTextSafe: true, pageErrors: errors });
      await page.evaluate(() => window.__securityTestMap.remove());
      await context.close();
    }
    await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
    console.log("PASS real Chromium source-attribution sanitization and text popups at mobile/desktop widths");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
