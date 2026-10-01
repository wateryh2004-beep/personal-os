const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const widths = [360, 390, 412, 430];

async function capture(page, name) {
  if (!process.env.E2E_SCREENSHOT_DIR) return;
  const { mkdir } = await import("node:fs/promises");
  await mkdir(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}

async function backCloses(page, trigger, visibleTarget) {
  await page.getByTestId(trigger).click();
  const target = page.getByTestId(visibleTarget);
  await target.waitFor({ state: "visible" });
  const focused = await target.evaluate((element) => document.activeElement === element);
  assert.equal(focused, false, `${visibleTarget} should not auto-focus on mobile`);
  await page.evaluate(() => history.back());
  await target.waitFor({ state: "hidden" });
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.goto(`${baseURL}/mobile-native-e2e`, { waitUntil: "networkidle" });
      await page.getByTestId("mobile-native-harness").waitFor();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `${width}px viewport has ${overflow}px horizontal overflow`);

      const careerTab = page.getByRole("link", { name: /职业/ });
      await careerTab.waitFor({ state: "visible" });
      assert.equal(await careerTab.getAttribute("href"), "/career", `${width}px Career tab should link directly to /career`);
      assert.equal(await page.getByRole("link", { name: /笔记/ }).count(), 0, `${width}px Notes should move under More instead of occupying a primary tab`);

      const focus = page.locator('[aria-labelledby="today-priorities-heading"]');
      await focus.getByRole("button", { name: "选择重点" }).click();
      for (const n of [1,2,3]) await focus.getByRole("button", { name: new RegExp(`E2E 未定期任务 ${n}`) }).click();
      assert.equal(await focus.getByRole("button", { name: /E2E 未定期任务 4/ }).isDisabled(), true, `${width}px limits priorities to three`);
      assert.equal(await focus.locator('a[href^="/tasks?task="]').count(), 3, `${width}px uses exact task links`);
      await capture(page, `priorities-selected-${width}`);
      await focus.getByRole("button", { name: /移除重点 E2E 未定期任务 2/ }).click();
      assert.equal(await focus.getByRole("button", { name: /E2E 未定期任务 4/ }).isEnabled(), true);
      await focus.getByRole("button", { name: "取消", exact: true }).click();
      assert.equal(await focus.locator('a[href^="/tasks?task="]').count(), 0, "cancel does not save selections");
      await page.locator('[name="duration_seconds"]').fill("90");
      const issue = page.locator('[name="issue_tags"]').first();
      await issue.check();
      await issue.uncheck();
      await capture(page, `daily-flow-${width}`);
      const flowOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(flowOverflow <= 1, `${width}px daily flow has ${flowOverflow}px horizontal overflow`);

      await backCloses(page, "open-dialog", "dialog-input");
      await backCloses(page, "open-sheet", "sheet-input");
      await backCloses(page, "open-panel", "panel-input");

      await page.getByTestId("open-dialog").click();
      const fontSize = await page.getByTestId("dialog-input").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      assert.ok(fontSize >= 16, `${width}px dialog input font-size should avoid browser zoom`);
      await page.evaluate(() => history.back());

      if (width === 390) {
        const active = await page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return false;
          const registration = await navigator.serviceWorker.ready;
          return Boolean(registration.active);
        });
        assert.equal(active, true, "service worker should activate in production mode");
        await page.reload({ waitUntil: "networkidle" });
        const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
        assert.equal(controlled, true, "page should be controlled by service worker");

        await context.setOffline(true);
        await page.goto(`${baseURL}/mobile-native-e2e-offline-target`, { waitUntil: "domcontentloaded" });
        await page.getByText("Personal OS 当前离线").waitFor();
        await context.setOffline(false);
      }

      await context.close();
      console.log(`mobile-native-e2e: ${width}px passed`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
