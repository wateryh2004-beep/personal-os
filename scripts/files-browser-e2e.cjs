/* eslint-disable @typescript-eslint/no-require-imports -- CI-only synthetic Files UI verification. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const sharp = require("sharp");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = "test-results/files-browser";
(async () => {
  await mkdir(output, { recursive: true });
  const preview = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#bce1e4"/><circle cx="480" cy="120" r="55" fill="#ffd185"/><path d="M0 430L180 130L380 430Z" fill="#4d8582"/><path d="M180 430L410 200L640 430Z" fill="#77aaa0"/><rect y="430" width="640" height="50" fill="#396e79"/></svg>')).webp().toBuffer();
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const width of [360, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      let originals = 0, writes = 0, thumbs = 0, active = 0, maximum = 0;
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(baseURL).origin) return route.abort();
        if (request.method() !== "GET") { writes++; return route.abort(); }
        if (/\/api\/files\/[^/]+\/download/.test(url.pathname)) { originals++; return route.abort(); }
        if (/\/api\/files\/[^/]+\/thumbnail/.test(url.pathname)) {
          thumbs++; active++; maximum = Math.max(maximum, active);
          await new Promise(resolve => setTimeout(resolve, 80));
          active--;
          return route.fulfill({ body: preview, contentType: "image/webp", headers: { "Cache-Control": "private, no-store" } });
        }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
        return route.continue();
      });
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const capture = async name => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow"); await page.screenshot({ path: `${output}/${name}-${width}.png` }); };
      await page.goto(`${baseURL}/mobile-native-e2e?scene=files`, { waitUntil: "networkidle" });
      assert.equal(thumbs, 0, "default list does not prefetch photos");
      const types = page.getByRole("group", { name: "文件类型", exact: true });
      await types.getByRole("button", { name: /^照片 / }).click();
      const grid = page.getByRole("list", { name: "文件网格", exact: true }); await grid.waitFor();
      assert.equal(await grid.locator("li").count(), 20);
      await page.waitForFunction(() => Array.from(document.querySelectorAll('img[src$="/thumbnail"]')).some(image => image.complete && image.naturalWidth > 0));
      await capture("photos");
      const thumbnail = grid.getByRole("button", { name: /^预览 / }).filter({ has: page.locator("img") }).first();
      const previewLabel = await thumbnail.getAttribute("aria-label");
      await thumbnail.click();
      const dialog = page.getByRole("dialog"); await dialog.waitFor();
      await capture("photo-preview");
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.waitForFunction(label => document.activeElement?.getAttribute("aria-label") === label, previewLabel);
      await page.getByLabel("文件排序", { exact: true }).selectOption("size-desc");
      assert.equal(await grid.locator("li").first().getAttribute("id"), "file-e2e-file-77");
      await page.goBack();
      assert.equal(await page.getByLabel("文件排序", { exact: true }).inputValue(), "uploaded-desc");
      const search = page.getByRole("searchbox", { name: "搜索文件名称", exact: true });
      await search.fill("does-not-exist"); await page.getByText("没有符合条件的文件", { exact: true }).waitFor();
      await page.getByRole("button", { name: "清除筛选", exact: true }).click();
      await search.fill("fixture-3.csv");
      assert.equal(await page.locator('.files-workspace li[id^="file-"]').count(), 1);
      await capture("filtered-file");
      assert.ok(maximum <= 3, `thumbnail concurrency ${maximum}`);
      assert.equal(originals, 0); assert.equal(writes, 0); assert.deepEqual(errors, []);
      evidence.push({ width, thumbnails: thumbs, maxConcurrentThumbnails: maximum, originalDownloads: originals, writes, errors });
      await context.close();
    }
    await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
