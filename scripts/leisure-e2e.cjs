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
  await page.waitForFunction(() => [...document.querySelectorAll('[data-artwork-state="loading"]')].every((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom <= 0 || rect.top >= innerHeight;
  }), null, { timeout: 15000 });
  await page.screenshot({ path: `${output}/${name}-viewport.png`, animations: "disabled" });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    await mkdir(output, { recursive: true });
    const failures = [];
    for (const width of [360, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 768, hasTouch: width < 768 });
      const page = await context.newPage();
      const errors = [];
      const imageRequests = [];
      page.on("response", (response) => { if (response.url().includes("/_next/image?") && response.status() >= 400) imageRequests.push({ status: response.status(), url: response.url() }); });
      page.on("requestfailed", (request) => { if (request.url().includes("/_next/image?")) imageRequests.push({ error: request.failure()?.errorText, url: request.url() }); });
      try {
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
      assert.equal(await page.locator("#leisure-collection li").count(), 1);
      await page.getByLabel("在哪里").selectOption("out");
      await page.getByText("暂时没有符合这个情境的选项。").waitFor();
      await page.getByRole("button", { name: "清除选择", exact: true }).click();
      assert.equal(await page.locator("#leisure-collection li").count(), 5);
      await page.getByRole("link", { name: "走进这个世界", exact: true }).click();
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
      await page.getByRole("button", { name: "进行中", exact: true }).click();
      await page.getByText("选择已保存，感想尚未保存", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("这一刻的感受").inputValue(), "Synthetic personal reaction only");
      await capture(page, `leisure-dirty-reflection-${width}`);
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
      await page.getByRole("alert").filter({ hasText: "内容已在别处更新。这次修改没有覆盖它。" }).waitFor();
      assert.equal(await note.inputValue(), "Keep this unsaved reflection");
      assert.equal(await page.getByRole("button", { name: "保存感想", exact: true }).isDisabled(), true);
      await capture(page, `leisure-conflict-${width}`);
      page.once("dialog", async (dialog) => { assert.equal(dialog.type(), "beforeunload"); await dialog.accept(); });
      await page.goto(`${fixture}&item=${id}&mode=long`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px long content has no horizontal overflow`);
      await capture(page, `leisure-long-${width}`);
      if (width < 768) {
        const box = await page.getByRole("button", { name: "喜欢，留着", exact: true }).boundingBox();
        assert.ok(box.height >= 44, "feedback is touch sized");
      }
      await page.goto(`${fixture}&mode=gallery`);
      await page.getByRole("heading", { name: "此刻可选", exact: true }).waitFor();
      assert.equal(await page.locator("#leisure-collection li").count(), 28, "all public title fixtures are visible without a disclosure");
      // External CDNs can transiently reject the first optimizer request. Keep the
      // all-images-must-decode assertion, but allow one fresh mount, with evidence.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const images = page.locator("#leisure-collection [data-artwork-state]");
          for (let i = 0; i < await images.count(); i++) {
            await images.nth(i).scrollIntoViewIfNeeded();
            await page.waitForFunction((index) => {
              const state = document.querySelectorAll("#leisure-collection [data-artwork-state]")[index]?.getAttribute("data-artwork-state");
              return state === "ready" || state === "fallback";
            }, i, { timeout: 30000 });
            assert.equal(await images.nth(i).getAttribute("data-artwork-state"), "ready", `official artwork ${i} must decode`);
            assert.ok(await images.nth(i).locator("img").evaluate((img) => img.complete && img.naturalWidth > 0), `official artwork ${i} has actual decoded pixels`);
          }
          assert.equal(await page.locator('#leisure-collection [data-artwork-state="ready"]').count(), 28, "every official cover really decoded");
          break;
        } catch (error) {
          console.warn(`leisure-e2e: ${width}px real-image attempt ${attempt + 1}`, error.message, JSON.stringify(imageRequests));
          await capture(page, `leisure-image-attempt-${attempt + 1}-${width}`);
          if (attempt === 1) throw error;
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.getByRole("heading", { name: "此刻可选", exact: true }).waitFor();
        }
      }
      await capture(page, `leisure-artwork-gallery-${width}`);
      const before = await page.locator("article h3").first().textContent();
      await page.getByRole("button", { name: "换个灵感", exact: true }).focus();
      await page.keyboard.press("Enter");
      assert.notEqual(await page.locator("article h3").first().textContent(), before, "keyboard shuffle changes the featured work");
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes("换个灵感")), true, "shuffle keeps focus");
      await page.getByRole("button", { name: "游戏", exact: true }).click();
      assert.equal(await page.locator("#leisure-collection li").count(), 12, "category reveals all twelve games");
      await capture(page, `leisure-games-${width}`);
      // Detail return and browser history keep the selected collection context.
      await page.locator("#leisure-collection a").first().click();
      await page.getByRole("heading", { name: "我的这一页", exact: true }).waitFor();
      assert.ok(page.url().includes("from=kind%3Dgame"), "detail carries bounded collection context");
      await page.getByRole("link", { name: "← 回到闲暇", exact: true }).click();
      await page.getByRole("button", { name: "游戏", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "游戏", exact: true }).getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator("#leisure-collection li").count(), 12);
      await page.goBack();
      await page.getByRole("heading", { name: "我的这一页", exact: true }).waitFor();
      await page.goForward();
      await page.getByRole("button", { name: "游戏", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "游戏", exact: true }).getAttribute("aria-pressed"), "true");
      await page.getByRole("button", { name: "全部", exact: true }).click();
      await page.getByRole("link", { name: "走进这个世界", exact: true }).click();
      await page.getByRole("heading", { name: "我的这一页", exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('[data-artwork-state="ready"]'));
      await capture(page, `leisure-artwork-detail-${width}`);
      await page.getByRole("link", { name: "← 回到闲暇", exact: true }).click();
      await page.getByRole("heading", { name: "此刻可选", exact: true }).waitFor();
      assert.equal(await page.locator("#leisure-collection li").count(), 28);
      // Inspect intact portrait/landscape/square assets with the real shell, plus the new sleeve edition.
      for (const [index, edition] of [[0, "series"], [4, "film"], [8, "game-landscape"], [12, "game-square"], [26, "music"]]) {
        await page.goto(`${fixture}&mode=gallery&item=artwork-${index}`);
        await page.getByRole("heading", { name: "我的这一页", exact: true }).waitFor();
        await page.waitForFunction(() => document.querySelector('header [data-artwork-state="ready"]'), null, { timeout: 30000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px ${edition} detail has no horizontal overflow`);
        await page.getByRole("navigation", { name: "这一页", exact: true }).getByRole("link", { name: "从这里开始" }).click();
        await page.locator("#leisure-start").waitFor();
        await capture(page, `leisure-edition-${edition}-${width}`);
      }
      await page.goto(`${fixture}&mode=gallery&item=artwork-26`);
      const nextInspiration = page.getByRole("navigation", { name: "继续逛逛", exact: true }).getByRole("link").last();
      await nextInspiration.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "Random Access Memories — Daft Punk", exact: true }).waitFor();
      // A new route must start with its own feedback component and draft, not the last title's state.
      await page.locator("summary").filter({ hasText: "留一句自己的感想" }).click();
      await page.getByLabel("这一刻的感受").fill("Do not lose this synthetic note");
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.getByRole("navigation", { name: "继续逛逛", exact: true }).getByRole("link").last().click();
      assert.equal(await page.getByLabel("这一刻的感受").inputValue(), "Do not lose this synthetic note");
      // Save then navigate, so the explicit draft protection is also exercised in its allowed state.
      await page.getByRole("button", { name: "保存感想", exact: true }).click();
      await page.getByText("已保存", { exact: true }).waitFor();
      await page.getByRole("navigation", { name: "继续逛逛", exact: true }).getByRole("link").last().click();
      await page.getByRole("heading", { name: "无耻之徒（美版）", exact: true }).waitFor();
      await page.goto(`${fixture}&mode=gallery`);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.getByRole("button", { name: "换个灵感", exact: true }).click();
      assert.equal(await page.locator("article").first().evaluate((node) => getComputedStyle(node).animationName), "none", "reduced motion disables feature animation");
      await capture(page, `leisure-reduced-motion-${width}`);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      // Fail an actual optimized image request; the artwork must degrade without losing its title/link.
      await page.route("**/_next/image?**", (route) => route.abort());
      await page.goto(`${fixture}&mode=gallery`);
      await page.waitForFunction(() => document.querySelector('article [data-artwork-state="fallback"]'));
      assert.equal(await page.getByRole("link", { name: "走进这个世界", exact: true }).count(), 1);
      await capture(page, `leisure-artwork-failure-${width}`);
      await page.unroute("**/_next/image?**");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px gallery has no horizontal overflow`);
      await page.goto(fixture);
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => document.activeElement?.tagName !== "BODY"), "keyboard focus reaches an interactive element");
      assert.deepEqual(errors, [], `${width}px has no uncaught client errors`);
      console.log(`leisure-e2e: ${width}px passed`);
      } catch (error) {
        failures.push({ width, message: error.message });
        console.error(`leisure-e2e: ${width}px failed`, error);
        await capture(page, `leisure-failure-${width}`).catch(() => {});
      } finally { await context.close(); }
    }
    assert.deepEqual(failures, [], "all leisure viewports pass");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
