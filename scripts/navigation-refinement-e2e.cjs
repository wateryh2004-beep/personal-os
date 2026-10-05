/* eslint-disable @typescript-eslint/no-require-imports -- Standalone fixture-only browser verification. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.E2E_SCREENSHOT_DIR || "test-results/navigation";

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [360, 390, 430, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768 });
      await context.route("**/api/calendar/events?**", (route) => route.fulfill({ json: { events: [], truncated: false } }));
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${baseURL}/mobile-native-e2e?scene=calendar`, { waitUntil: "networkidle" });
      const workspace = page.locator(".calendar-workspace");
      await workspace.getByRole("button", { name: "回到今天", exact: true }).waitFor();
      assert.equal(await page.locator("[data-nextjs-dialog]").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `overflow at ${width}`);
      if (width < 768) {
        const view = workspace.getByRole("group", { name: "日历视图" });
        await view.getByRole("button", { name: "月", exact: true }).click();
        await page.locator(".fc-dayGridMonth-view").waitFor();
        await workspace.getByRole("button", { name: "下一段日期" }).click();
        await workspace.getByRole("button", { name: "回到今天", exact: true }).click();
        await view.getByRole("button", { name: "日", exact: true }).click();
        await page.locator(".fc-timeGridDay-view").waitFor();
        await workspace.getByRole("button", { name: /^筛选/ }).click();
        const popover = page.locator('[data-slot="popover-content"]');
        await popover.getByRole("button", { name: "实习 / 工作", exact: true }).click();
        await page.keyboard.press("Escape");
        assert.match(await workspace.getByRole("button", { name: /^筛选/ }).innerText(), /1/);
        await workspace.getByRole("button", { name: /^筛选/ }).click();
        await popover.getByRole("button", { name: "清除分类筛选" }).click();
        await page.keyboard.press("Escape");
        await workspace.getByRole("button", { name: "更多日历操作" }).click();
        await popover.getByRole("button", { name: "新建日程", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        await popover.waitFor({ state: "hidden" });
      }
      await page.screenshot({ path: path.join(output, `navigation-calendar-${width}.png`), fullPage: true });
      assert.deepEqual(errors, [], `browser errors at ${width}`);
      await context.close();
    }
    console.log("Calendar navigation fixtures passed at 360, 390, 430, 1440px");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
