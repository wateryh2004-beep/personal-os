/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS browser-test entrypoint. */
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { chromium } = require("playwright");
const { syntheticPdf } = require("./fixtures/pdf-cover-fixtures.cjs");

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const screenshotDir = process.env.E2E_SCREENSHOT_DIR;
const pdfBytes = syntheticPdf();
const pdfId = "10000000-0000-4000-8000-000000000002";
const sourceVersion = "11000000-0000-4000-8000-000000000002";

async function capture(page, name) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ channel: "chromium", headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [360, 390, 430, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      let pdfRequests = 0, preflightRequests = 0;
      await context.route("**/*", (route) => {
        const request = route.request(); const url = new URL(request.url());
        if (url.pathname === `/api/files/${pdfId}/preview` && ["GET", "HEAD"].includes(request.method())) {
          const headers = { "Content-Type": "application/pdf", "Content-Length": String(pdfBytes.length), "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Reading-Source-Version": sourceVersion, ETag: '\"synthetic-reliability-v1\"' };
          if (request.method() === "HEAD") { preflightRequests++; return route.fulfill({ status: 200, headers }); }
          pdfRequests++;
          const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers().range ?? "");
          if (range) {
            const start = Number(range[1]); const end = Math.min(pdfBytes.length - 1, range[2] ? Number(range[2]) : pdfBytes.length - 1);
            const body = pdfBytes.subarray(start, end + 1);
            headers["Content-Range"] = `bytes ${start}-${end}/${pdfBytes.length}`; headers["Content-Length"] = String(body.length);
            return route.fulfill({ status: 206, headers, body });
          }
          return route.fulfill({ status: 200, headers, body: pdfBytes });
        }
        if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Isolated synthetic transport blocks live APIs and all writes" }) });
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${baseURL}/mobile-native-e2e?scene=files`, { waitUntil: "networkidle" });
      const section = page.locator(".files-workspace > section");
      assert.equal(await page.locator('.files-workspace li[id^="file-"]').count(), 80, "all files includes nested folders");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px Files has no horizontal overflow`);
      const listBox = await section.boundingBox();
      assert.ok(listBox && listBox.height >= 350, `${width}px file folders leave room for the file list`);
      const lastMenu = page.getByRole("button", { name: "操作 示例资料 80 · Synthetic fixture", exact: true });
      await lastMenu.scrollIntoViewIfNeeded();
      assert.ok(await section.evaluate((node) => node.scrollTop) > 0, "long file lists scroll internally");
      await lastMenu.click();
      const popover = page.locator(".files-actions-popover");
      await popover.waitFor({ state: "visible" });
      const menuBox = await popover.boundingBox();
      assert.ok(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= width + 1 && menuBox.y >= 0 && menuBox.y + menuBox.height <= 901, `${width}px bottom-row menu remains in view`);
      if (width < 768) {
        const button = await lastMenu.boundingBox();
        assert.ok(button.width >= 44 && button.height >= 44, "mobile file controls are touch sized");
        assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "INPUT", "mobile menu does not open the keyboard");
      }
      await capture(page, `files-menu-${width}`);
      if (width < 768) await page.evaluate(() => history.back());
      else await page.keyboard.press("Escape");
      await popover.waitFor({ state: "hidden" });
      await capture(page, `files-${width}`);

      await page.goto(`${baseURL}/mobile-native-e2e?scene=note-pdf`, { waitUntil: "networkidle" });
      const documentShell = page.locator(".notes-document-shell");
      const shellBox = await documentShell.boundingBox();
      const editorBox = await page.locator(".notes-editor-surface").boundingBox();
      assert.ok(shellBox && editorBox && editorBox.y + editorBox.height <= shellBox.y + shellBox.height + 1, `${width}px embedded editor fits below the PDF toolbar`);
      assert.equal(await documentShell.locator(".file-pdf-preview, canvas[data-pdf-page]").count(), 0, "reader loads only when first opened");
      assert.equal(pdfRequests + preflightRequests, 0, "unopened PDF makes no preview requests");
      await page.getByRole("button", { name: "PDF", exact: true }).click();
      const reader = documentShell.locator(`.file-pdf-preview[data-pdf-document-id="${pdfId}"][data-pdf-source-version="${sourceVersion}"]`);
      const renderedPage = (number) => reader.locator(`canvas[data-pdf-rendered="true"][data-pdf-page="${number}"]`);
      await renderedPage(1).waitFor({ state: "visible" });
      assert.equal(preflightRequests, 1, "first opening uses the protected preview HEAD boundary");
      assert.equal(pdfRequests, 1, "first opening fetches the synthetic PDF once");
      const readerBox = await reader.locator(".file-pdf-viewport").boundingBox();
      assert.ok(readerBox && readerBox.height > 300, `${width}px PDF has usable reading height`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px PDF has no horizontal overflow`);
      await reader.getByRole("button", { name: "下一页", exact: true }).click();
      await renderedPage(2).waitFor({ state: "visible" });
      const originalReader = await reader.elementHandle();
      const originalCanvas = await renderedPage(2).elementHandle();
      const beforeSwitch = pdfRequests, preflightBeforeSwitch = preflightRequests;
      await page.getByRole("button", { name: "正文", exact: true }).click();
      await reader.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "PDF", exact: true }).click();
      await renderedPage(2).waitFor({ state: "visible" });
      assert.equal(await originalReader.evaluate(node => node.isConnected), true, "switching views preserves the existing PDF reader");
      assert.equal(await originalCanvas.evaluate(node => node.isConnected), true, "switching views preserves the same rendered page-2 canvas");
      assert.equal(pdfRequests, beforeSwitch, "switching views preserves the existing PDF reader without refetch");
      assert.equal(preflightRequests, preflightBeforeSwitch, "switching views makes no redundant preflight");
      const beforeReload = await renderedPage(2).elementHandle();
      await page.getByRole("button", { name: "重新加载 PDF", exact: true }).click();
      await page.waitForFunction(node => !node.isConnected, beforeReload);
      await renderedPage(1).waitFor({ state: "visible" });
      assert.equal(await originalReader.evaluate(node => node.isConnected), false, "explicit reload replaces the old reader");
      assert.equal(pdfRequests, beforeSwitch + 1, "explicit reload fetches a fresh PDF once");
      assert.equal(preflightRequests, preflightBeforeSwitch + 1, "explicit reload revalidates the protected source");
      await capture(page, `document-pdf-${width}`);
      assert.deepEqual(errors, [], `${width}px has no uncaught client errors`);
      await context.close();
      console.log(`workspace-reliability-e2e: ${width}px passed`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
