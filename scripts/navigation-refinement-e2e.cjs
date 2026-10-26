/* eslint-disable @typescript-eslint/no-require-imports -- Standalone fixture-only browser verification. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.E2E_SCREENSHOT_DIR || "test-results/navigation";

async function controlledPopover(page, trigger) {
  const id = await trigger.getAttribute("aria-controls");
  assert.ok(id, "the actual trigger identifies its own popover");
  return page.locator(`[data-slot="popover-content"][id=${JSON.stringify(id)}]`);
}

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
        const filter = workspace.getByRole("button", { name: /^筛选/ });
        await filter.click();
        const filterPopover = await controlledPopover(page, filter);
        assert.equal(await page.locator('[data-slot="popover-content"][data-state="open"]').count(), 1);
        await filterPopover.getByRole("button", { name: "实习 / 工作", exact: true }).click();
        await page.keyboard.press("Escape");
        assert.match(await workspace.getByRole("button", { name: /^筛选/ }).innerText(), /1/);
        await filter.click();
        await filterPopover.getByRole("button", { name: "清除分类筛选" }).click();
        await page.keyboard.press("Escape");
        const more = workspace.getByRole("button", { name: "更多日历操作" });
        await more.click();
        const morePopover = await controlledPopover(page, more);
        await morePopover.getByRole("button", { name: "Calendar AI", exact: true }).waitFor();
        assert.equal(await page.locator('[data-slot="popover-content"][data-state="open"]').count(), 1, "only the requested popover is open");
        await page.keyboard.press("Escape");
        assert.equal(await page.locator('[data-slot="popover-content"][data-state="open"]').count(), 0, "Escape closes the active popover");
        // Closed Presence layers may overlap briefly. They must be inert while
        // exiting, then every old layer must retire; a global strict singleton
        // locator cannot describe two independent completed close operations.
        assert.ok(await page.locator('[data-slot="popover-content"][data-state="closed"]').evaluateAll(nodes => nodes.every(node => node.inert && node.getAttribute("aria-hidden") === "true")), "exiting popovers cannot retain keyboard access");
        await morePopover.waitFor({ state: "detached" });
        await filterPopover.waitFor({ state: "detached" });
        await page.waitForFunction(() => document.querySelectorAll('[data-slot="popover-content"]').length === 0);
        await page.waitForFunction(node => node === document.activeElement, await more.elementHandle());
        assert.ok(await more.evaluate(node => node === document.activeElement), "closing restores the actual trigger focus");
      }
      // Creating an event is now a persistent primary action, including phones.
      const create = workspace.getByRole("button", { name: "新建日程", exact: true });
      assert.equal(await create.isVisible(), true, "create is directly available without a menu");
      assert.ok((await create.boundingBox()).height >= 44, "create remains touch sized");
      await create.click();
      const draft = page.getByRole("heading", { name: "新建日程", exact: true });
      await draft.waitFor();
      await page.keyboard.press("Escape");
      await draft.waitFor({ state: "hidden" });
      await page.screenshot({ path: path.join(output, `navigation-calendar-${width}.png`), fullPage: true });
      assert.deepEqual(errors, [], `browser errors at ${width}`);
      await context.close();
    }
    console.log("Calendar navigation fixtures passed at 360, 390, 430, 1440px");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
