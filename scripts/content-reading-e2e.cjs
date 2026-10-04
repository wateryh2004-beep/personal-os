/* eslint-disable @typescript-eslint/no-require-imports -- Node browser QA entrypoint */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { mkdir } = require("node:fs/promises");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [360, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${baseURL}/mobile-native-e2e?scene=content-reader`, { waitUntil: "networkidle" });
      await page.getByTestId("content-reading-fixture").waitFor();
      assert.equal(await page.locator("form,textarea").count(), 0, "reading route contains no authoring forms");
      assert.ok((await page.locator("article").innerText()).includes("100−20−15=65"));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await page.evaluate(() => Boolean(window.__contentInjected)), false);
      assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
      const source = page.getByRole("link", { name: "查看原始来源" });
      assert.equal(await source.isVisible(), false, "provenance is initially folded");
      await page.locator("summary").filter({ hasText: "来源与保存记录" }).click();
      assert.equal(await source.getAttribute("href"), "https://example.test/chosen-conversation");
      await page.locator("summary").filter({ hasText: "历史快照" }).click();
      await page.locator("summary").filter({ hasText: "V1" }).click();
      assert.equal(await page.getByText("先前保存的合成内容。").isVisible(), true);
      assert.equal(await page.getByRole("link", { name: "版本恢复与文档操作" }).getAttribute("href"), "/notes/10000000-0000-4000-8000-000000000001");
      await page.getByRole("region", { name: "笔记正文" }).evaluate((node) => node.scrollTo({ top: 0 }));
      if (process.env.E2E_SCREENSHOT_DIR) {
        await mkdir(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/content-reader-${width}.png`, fullPage: true });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("content-reading-e2e: mobile and desktop passed");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
