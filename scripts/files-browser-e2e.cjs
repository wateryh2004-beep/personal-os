/* eslint-disable @typescript-eslint/no-require-imports -- CI-only synthetic Files UI verification. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const sharp = require("sharp");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = "test-results/files-browser";
const { syntheticPdf, syntheticCover } = require("./fixtures/pdf-cover-fixtures.cjs");
const pdf = syntheticPdf();
(async () => {
  await mkdir(output, { recursive: true });
  const preview = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#bce1e4"/><circle cx="480" cy="120" r="55" fill="#ffd185"/><path d="M0 430L180 130L380 430Z" fill="#4d8582"/><path d="M180 430L410 200L640 430Z" fill="#77aaa0"/><rect y="430" width="640" height="50" fill="#396e79"/></svg>')).webp().toBuffer();
  const cover = await syntheticCover();
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const width of [360, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      let originals = 0, writes = 0, thumbs = 0, active = 0, maximum = 0, pdfHeads = 0, pdfGets = 0, pdfCovers = 0, pdfCoverBytes = 0;
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(baseURL).origin) return route.abort();
        if (/\/api\/files\/[^/]+\/pdf-cover$/.test(url.pathname)) {
          assert.equal(request.method(), "GET", "covers need one small image GET, no PDF HEAD");
          assert.equal(request.headers().range, undefined, "covers never request PDF byte ranges");
          pdfCovers++; pdfCoverBytes += cover.length;
          return route.fulfill({ body: cover, contentType: "image/webp", headers: { "Cache-Control": "private, max-age=0, must-revalidate", ETag: '"synthetic-cover-v1"' } });
        }
        if (/\/api\/files\/[^/]+\/preview$/.test(url.pathname)) {
          const headers = { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Content-Length": String(pdf.length), "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
          if (request.method() === "HEAD") { pdfHeads++; return route.fulfill({ status: 200, headers }); }
          pdfGets++;
          const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers().range || "");
          if (range) {
            const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), pdf.length - 1) : pdf.length - 1;
            const chunk = pdf.subarray(start, end + 1);
            return route.fulfill({ status: 206, body: chunk, headers: { ...headers, "Content-Length": String(chunk.length), "Content-Range": `bytes ${start}-${end}/${pdf.length}` } });
          }
          return route.fulfill({ status: 200, headers, body: pdf });
        }
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
      assert.equal(pdfHeads, 0, "default list does not preflight PDF covers");
      assert.equal(pdfGets, 0, "default list does not download PDFs");
      assert.equal(pdfCovers, 0, "default list does not fetch cover images");
      await page.getByRole("button", { name: "预览 示例资料 1 · Synthetic fixture", exact: true }).click();
      const pdfDialog = page.getByRole("dialog");
      const pdfCanvas = pdfDialog.locator('canvas[data-pdf-rendered="true"]');
      await pdfCanvas.waitFor({ timeout: 30000 });
      const paintedPixels = await pdfCanvas.evaluate((canvas) => {
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] > 0 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 220) painted++;
        }
        return painted;
      });
      assert.ok(paintedPixels > 100, "PDF canvas contains rendered fixture text, not a blank frame");
      await capture("pdf-preview");
      await pdfDialog.getByRole("button", { name: "下一页", exact: true }).click();
      await pdfDialog.locator('canvas[data-pdf-page="2"][data-pdf-rendered="true"]').waitFor();
      assert.equal(await pdfDialog.getByRole("button", { name: "下一页", exact: true }).isDisabled(), true);
      await pdfDialog.getByRole("button", { name: "放大 PDF", exact: true }).click();
      await pdfDialog.getByText("125%", { exact: true }).waitFor();
      await pdfDialog.locator('canvas[data-pdf-page="2"][data-pdf-rendered="true"]').waitFor();
      await capture("pdf-preview-page2-zoom");
      await pdfDialog.getByRole("button", { name: "上一页", exact: true }).click();
      await pdfDialog.locator('canvas[data-pdf-page="1"][data-pdf-rendered="true"]').waitFor();
      assert.ok(pdfHeads > 0 && pdfGets > 0, "canvas PDF preview uses explicit HEAD and GET");
      await pdfDialog.getByRole("button", { name: "关闭", exact: true }).click();
      await pdfDialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "预览 示例资料 2 · Synthetic fixture", exact: true }).click();
      const listPhotoDialog = page.getByRole("dialog"); await listPhotoDialog.waitFor();
      await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="dialog"] img')).some(image => image.complete && image.naturalWidth > 0));
      await capture("list-photo-preview");
      await listPhotoDialog.getByRole("button", { name: "关闭", exact: true }).click();
      await listPhotoDialog.waitFor({ state: "hidden" });
      // List stays lightweight. PDF covers are only admitted in the visible grid.
      await page.getByRole("group", { name: "文件显示方式" }).getByRole("button", { name: "网格", exact: true }).click();
      const pdfCover = page.locator('img[data-pdf-cover-rendered="true"]').first();
      await pdfCover.waitFor({ state: "visible", timeout: 30000 });
      const coverPixels = await pdfCover.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight, area: image.naturalWidth * image.naturalHeight }));
      assert.ok(coverPixels.width > 100 && coverPixels.area <= 512 * 512, "cached first-page image is nonempty and bounded");
      const coverLayout = await pdfCover.evaluate(image => {
        const page = image.getBoundingClientRect(), card = image.parentElement.getBoundingClientRect();
        return { ratio: image.naturalWidth / image.naturalHeight, objectFit: getComputedStyle(image).objectFit, fits: page.left >= card.left && page.right <= card.right && page.top >= card.top && page.bottom <= card.bottom };
      });
      assert.ok(coverLayout.fits, "complete first page fits inside its cover area");
      assert.equal(coverLayout.objectFit, "contain", "portrait page is fully contained rather than cropped");
      assert.ok(Math.abs(coverLayout.ratio - 612 / 792) < 0.02, "portrait page is not stretched");
      await capture("pdf-first-page-covers");
      const coverButton = page.getByRole("button", { name: "预览 示例资料 1 · Synthetic fixture", exact: true });
      await coverButton.click();
      await page.getByRole("dialog").locator('canvas[data-pdf-rendered="true"]').waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "预览 示例资料 1 · Synthetic fixture");
      assert.ok(await pdfCover.isVisible(), "closing the reader retains the first-page cover");
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
      evidence.push({ width, thumbnails: thumbs, maxConcurrentThumbnails: maximum, originalDownloads: originals, pdfHeads, pdfGets, pdfCovers, pdfCoverBytes, paintedPixels, coverPixels, coverLayout, writes, errors });
      await context.close();
    }
    await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
