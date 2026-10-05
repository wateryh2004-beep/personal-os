/* eslint-disable @typescript-eslint/no-require-imports -- Node browser-test entrypoint. */
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.E2E_SCREENSHOT_DIR || "test-results/mobile";
const fixture = `${baseURL}/mobile-native-e2e?scene=leisure`;
const id = "10000000-0000-4000-8000-000000000001";
async function capture(page, name) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `${output}/${name}-viewport.png` });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    await mkdir(output, { recursive: true });
    for (const width of [360, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 768, hasTouch: width < 768 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(fixture);
      await page.getByRole("heading", { name: "此刻可选", exact: true }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "还惦记着", exact: true }).count(), 1);
      assert.equal(await page.getByRole("heading", { name: "留下来的", exact: true }).count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px home has no horizontal overflow`);
      await capture(page, `leisure-home-${width}`);
      const contextToggle = page.locator("summary").filter({ hasText: "换个情境" });
      await contextToggle.focus();
      await page.keyboard.press("Enter");
      await page.getByLabel("有多少时间").selectOption("30");
      assert.equal(await page.getByRole("link", { name: "看看详情" }).count(), 1);
      await page.getByLabel("在哪里").selectOption("out");
      await page.getByText("暂时没有符合这个情境的选项。").waitFor();
      await page.getByRole("button", { name: "清除选择", exact: true }).click();
      assert.equal(await page.getByRole("link", { name: "看看详情" }).count(), 4);
      await page.getByRole("link", { name: "看看详情" }).first().click();
      await page.getByRole("heading", { name: "我的这一页", exact: true }).waitFor();
      const like = page.getByRole("button", { name: "喜欢，留着", exact: true });
      await like.click();
      await page.getByText("已保存", { exact: true }).waitFor();
      assert.equal(await like.getAttribute("aria-pressed"), "true");
      await like.click();
      await page.waitForFunction(() => [...document.querySelectorAll("button")].find((node) => node.textContent === "喜欢，留着")?.getAttribute("aria-pressed") === "false");
      await page.getByRole("button", { name: "感兴趣", exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll("button")].find((node) => node.textContent === "感兴趣")?.getAttribute("aria-pressed") === "true");
      await page.locator("summary").filter({ hasText: "留一句自己的感想" }).click();
      await page.getByLabel("这一刻的感受").fill("Synthetic personal reaction only");
      await page.getByRole("button", { name: "保存感想", exact: true }).click();
      await page.getByText("已保存", { exact: true }).waitFor();
      assert.equal(await page.locator('a[href="https://example.com/old"]').count(), 0);
      assert.equal(await page.locator('a[href="https://example.com/unverified"]').count(), 0);
      assert.equal(await page.locator('img[src*="private-tracker"]').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px detail has no horizontal overflow`);
      await capture(page, `leisure-detail-${width}`);
      await page.goBack();
      await page.getByRole("heading", { name: "此刻可选", exact: true }).waitFor();
      await page.goForward();
      await page.getByRole("heading", { name: "我的这一页", exact: true }).waitFor();
      await page.goto(`${fixture}&mode=empty`);
      assert.equal(await page.getByRole("heading", { name: "此刻可选", exact: true }).count(), 0);
      await page.getByText("还没有添加体验。").waitFor();
      await capture(page, `leisure-empty-${width}`);
      await page.goto(`${fixture}&mode=error`);
      await page.getByRole("button", { name: "重新打开闲暇", exact: true }).waitFor();
      await capture(page, `leisure-error-${width}`);
      await page.goto(`${fixture}&item=${id}&mode=conflict`);
      await page.locator("summary").filter({ hasText: "留一句自己的感想" }).click();
      const note = page.getByLabel("这一刻的感受");
      await note.fill("Keep this unsaved reflection");
      await page.getByRole("button", { name: "保存感想", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.equal(await note.inputValue(), "Keep this unsaved reflection");
      assert.equal(await page.getByRole("button", { name: "保存感想", exact: true }).isDisabled(), true);
      await capture(page, `leisure-conflict-${width}`);
      await page.goto(`${fixture}&item=${id}&mode=long`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px long content has no horizontal overflow`);
      await capture(page, `leisure-long-${width}`);
      if (width < 768) {
        const box = await page.getByRole("button", { name: "喜欢，留着", exact: true }).boundingBox();
        assert.ok(box.height >= 44, "feedback is touch sized");
      }
      await page.goto(fixture);
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => document.activeElement?.tagName !== "BODY"), "keyboard focus reaches an interactive element");
      assert.deepEqual(errors, [], `${width}px has no uncaught client errors`);
      await context.close();
      console.log(`leisure-e2e: ${width}px passed`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
