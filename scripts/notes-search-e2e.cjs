/* eslint-disable @typescript-eslint/no-require-imports -- Node browser-test entrypoint. */
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.E2E_SCREENSHOT_DIR || "test-results/mobile";
const rows = Array.from({ length: 30 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  title: `阅读记录 ${String(index + 1).padStart(2, "0")} · Synthetic fixture`,
  excerpt: "…这段阅读内容仅用于搜索与排版验证，不包含任何个人资料。",
  folder_id: "20000000-0000-4000-8000-000000000002", updated_at: "2026-10-04T00:00:00Z", pinned_at: null, content_origin: "manual",
}));
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    await mkdir(output, { recursive: true });
    for (const width of [360, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(new URL(route.request().url()).pathname === "/api/notes/search" ? { results: rows } : {}) }));
      await page.goto(`${baseURL}/mobile-native-e2e?scene=notes-search`);
      const input = page.locator("#notes-library-search");
      await input.fill("阅读");
      await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "阅读");
      await page.waitForFunction(() => document.querySelector(".notes-list-row p mark"));
      assert.equal(await page.locator(".notes-list-row").first().evaluate((node) => getComputedStyle(node).contentVisibility), "visible", "search rows use real heights before restoring scroll");
      const first = page.locator("a[data-note-result]").first();
      await input.press("ArrowDown");
      assert.equal(await first.evaluate((node) => node === document.activeElement), true);
      await first.press("Escape");
      assert.equal(await input.evaluate((node) => node === document.activeElement), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px search has no horizontal overflow`);
      if (width < 768) {
        const box = await input.boundingBox();
        assert.ok(box.height >= 44, "mobile search is touch sized");
        const create = page.locator("header").getByRole("button", { name: "新建笔记", exact: true });
        const createBox = await create.boundingBox();
        assert.ok(createBox.width >= 44 && createBox.height >= 44, "mobile create stays touch sized in the header");
        assert.equal(await page.locator(".notes-list-workspace form.fixed").count(), 0, "no floating create action covers results");
        const clearBox = await page.getByRole("button", { name: "清空搜索" }).boundingBox();
        assert.ok(clearBox.width >= 44 && clearBox.height >= 44, "mobile clear action is touch sized");
        assert.ok(await input.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)) >= 16, "search does not trigger mobile input zoom");
      }
      await input.blur();
      await page.screenshot({ path: `${output}/notes-search-${width}.png`, fullPage: true });
      const list = page.locator(".notes-list-workspace");
      const last = page.locator("a[data-note-result]").last();
      await last.scrollIntoViewIfNeeded();
      const scrollBefore = await list.evaluate((node) => node.scrollTop);
      assert.ok(scrollBefore > 0);
      const listUrl = page.url();
      await last.click();
      await page.locator(".notes-document-shell").waitFor();
      await page.getByRole("navigation", { name: "文档位置" }).waitFor();
      const savedScroll = await page.evaluate((href) => {
        const url = new URL(href);
        return JSON.parse(sessionStorage.getItem(`life-of-hang:workspace:scroll:notes:list:${url.pathname}${url.search}`) || "null")?.value?.scrollTop;
      }, listUrl);
      assert.ok(typeof savedScroll === "number" && Math.abs(savedScroll - scrollBefore) < 4, `snapshot before navigation: expected ${scrollBefore}, saved ${savedScroll}`);
      await page.screenshot({ path: `${output}/notes-location-${width}.png`, fullPage: true });
      await page.goBack();
      await input.waitFor();
      assert.equal(await input.inputValue(), "阅读");
      try {
        await page.waitForFunction((previous) => Math.abs(document.querySelector(".notes-list-workspace").scrollTop - previous) < 4, scrollBefore);
      } catch (error) {
        console.error("search scroll recovery", { width, expected: scrollBefore, saved: savedScroll, actual: await list.evaluate((node) => node.scrollTop), url: page.url() });
        await page.screenshot({ path: `${output}/notes-return-failure-${width}.png`, fullPage: true });
        throw error;
      }
      assert.equal(await page.locator("a[data-note-result]").count(), 30);
      await page.goForward();
      await page.locator(".notes-document-shell").waitFor();
      assert.deepEqual(errors, [], `${width}px has no uncaught client errors`);
      await context.close();
      console.log(`notes-search-e2e: ${width}px passed`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
