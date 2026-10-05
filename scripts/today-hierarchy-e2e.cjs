/* eslint-disable @typescript-eslint/no-require-imports -- CI browser entrypoint. */
const assert = require("node:assert/strict");
const { mkdir, readdir, stat } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.E2E_TODAY_SCREENSHOT_DIR || "test-results/today";

(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [360, 390, 430, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", isMobile: width < 768, hasTouch: width < 768 });
      // All data are synthetic. Never submit a real server action or read production APIs.
      await context.route("**/api/**", route => route.fulfill({ json: {} }));
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const visit = async mode => {
        await page.goto(`${baseURL}/mobile-native-e2e?scene=today-hierarchy&mode=${mode}`, { waitUntil: "networkidle" });
        await page.getByTestId("today-hierarchy-fixture").waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px must not overflow`);
      };
      const capture = name => page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      await visit("filled");
      const focus = page.locator('[aria-labelledby="today-priorities-heading"]');
      const firstTask = "梳理项目复盘，把关键判断讲清楚";
      assert.equal(await page.getByRole("link", { name: firstTask, exact: true }).count(), 1, "selected due task has one primary surface");
      assert.equal(await page.getByRole("link", { name: "核对需要补充的材料", exact: true }).count(), 1, "overdue task remains accessible once");
      assert.equal(await page.getByText("3 条 Inbox 尚未整理", { exact: true }).count(), 0, "Inbox background is deduplicated");
      await page.getByRole("link", { name: /待整理.*3 条/ }).waitFor();
      assert.equal(await page.getByTestId("today-background").getAttribute("open"), null);
      const heading = await focus.getByRole("link", { name: firstTask, exact: true }).boundingBox();
      assert.ok(heading && heading.y < 420, "primary content is in the first viewport");
      const titleSize = await focus.getByRole("link", { name: firstTask, exact: true }).evaluate(node => parseFloat(getComputedStyle(node).fontSize));
      assert.ok(titleSize >= 18);
      const future = await page.locator('[aria-labelledby="today-future-heading"]').boundingBox();
      const background = await page.getByTestId("today-background").boundingBox();
      if (width < 1024) assert.ok(future.y < background.y);
      await capture("filled");
      await page.getByTestId("today-background").locator("summary").click();
      await page.getByRole("button", { name: "帮助整理", exact: true }).waitFor();
      await page.getByText("这个职业节点计划在 28 天后。", { exact: true }).waitFor();
      await page.getByTestId("today-background").locator("summary").click();
      await focus.getByRole("button", { name: "调整", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "选择今日重点", exact: true });
      await editor.waitFor();
      if (width < 768) assert.notEqual(await page.evaluate(() => document.activeElement?.id), "today-priority-search", "mobile sheet should not automatically summon keyboard");
      await editor.getByRole("button", { name: "选择重点 核对需要补充的材料", exact: true }).click();
      assert.equal(await editor.getByRole("button", { name: "选择重点 整理读书笔记", exact: true }).isDisabled(), true);
      assert.equal(await editor.getByRole("list", { name: "待保存的今日重点" }).locator("li").count(), 3);
      await capture("focus-editor");
      // Short visual viewport approximates keyboard space without claiming a physical keyboard test.
      if (width < 768) {
        await page.setViewportSize({ width, height: 500 });
        await editor.getByRole("searchbox").fill("读书");
        await editor.getByRole("button", { name: "保存重点", exact: true }).scrollIntoViewIfNeeded();
        const save = await editor.getByRole("button", { name: "保存重点", exact: true }).boundingBox();
        assert.ok(save && save.y >= 0 && save.y + save.height <= 500);
        await capture("short-viewport-editor");
        await page.setViewportSize({ width, height: 900 });
      }
      await editor.getByRole("button", { name: "取消", exact: true }).click();
      await editor.waitFor({ state: "hidden" });
      assert.equal(await focus.getByRole("list", { name: "已保存的今日重点" }).locator("li").count(), 2, "cancel preserves saved priorities");
      await focus.getByRole("button", { name: "调整", exact: true }).click();
      await editor.waitFor();
      if (width < 768) await page.evaluate(() => history.back()); else await page.keyboard.press("Escape");
      await editor.waitFor({ state: "hidden" });
      await visit("tomorrow");
      await page.getByText("今天的日程已结束", { exact: true }).waitFor();
      await page.getByText("已结束 2 项", { exact: true }).click();
      assert.equal(await page.locator('[aria-labelledby="today-schedule-heading"] ol li').count(), 2);
      await page.getByText("已结束 2 项", { exact: true }).click();
      assert.equal(await page.getByRole("heading", { name: "需要处理", exact: true }).count(), 0, "Inbox is not urgent");
      await capture("tomorrow-next-event");
      await visit("empty");
      await page.getByText("今天没有固定日程", { exact: true }).waitFor();
      await page.getByRole("button", { name: "选择重点", exact: true }).click();
      await editor.waitFor();
      await editor.getByRole("button", { name: "取消", exact: true }).click();
      await editor.waitFor({ state: "hidden" });
      await capture("empty");
      if (width === 390) {
        await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
        await capture("empty-dark");
        await visit("unavailable");
        await page.getByText("日程暂不可用，恢复后会自动更新。", { exact: true }).waitFor();
        await capture("partial-failure-dark");
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    let total = 0; for (const name of await readdir(output)) total += (await stat(`${output}/${name}`)).size;
    assert.ok(total < 32 * 1024 * 1024, `focused Today artifact exceeds 32MiB: ${total}`);
    console.log(`today-hierarchy-e2e: all scenarios passed; ${(total / 1024 / 1024).toFixed(2)}MiB screenshots`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
