const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const widths = [360, 390, 412, 430];

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
  const browser = await chromium.launch({ headless: true });
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
