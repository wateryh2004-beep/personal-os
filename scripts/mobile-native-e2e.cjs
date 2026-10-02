/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS browser-test entrypoint. */
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

      const interview = page.getByTestId("interview-harness");
      const questionList = interview.getByTestId("interview-question-list");
      const questionDetail = interview.getByTestId("interview-question-detail");
      assert.equal(await interview.getByLabel("面试岗位").inputValue(), "");
      assert.equal(await questionDetail.isVisible(), false);
      await interview.getByLabel("搜索题库", { exact: true }).fill("English reference");
      await interview.getByLabel("学习模块", { exact: true }).selectOption("SQL与数据分析");
      await interview.getByLabel("提问风格", { exact: true }).selectOption("stress");
      assert.equal(await questionList.getByRole("button", { name: "E2E 面试问题 0", exact: true }).count(), 0);
      await questionList.getByRole("button", { name: "E2E 面试问题 1", exact: true }).tap();
      await questionDetail.waitFor({ state: "visible" });
      await questionDetail.getByRole("button", { name: "参考表达", exact: true }).tap();
      await page.evaluate(() => history.back());
      await questionList.waitFor({ state: "visible" });
      assert.equal(await interview.getByLabel("搜索题库", { exact: true }).inputValue(), "English reference");
      assert.equal(await interview.getByLabel("学习模块", { exact: true }).inputValue(), "SQL与数据分析");
      await interview.getByLabel("搜索题库", { exact: true }).fill("no-matching-question");
      await questionList.getByRole("button", { name: "清除筛选", exact: true }).tap();
      assert.equal(await interview.getByLabel("搜索题库", { exact: true }).inputValue(), "");
      await capture(page, `interview-library-${width}`);
      await questionList.getByRole("button", { name: "E2E 面试问题 0", exact: true }).tap();
      await questionDetail.waitFor({ state: "visible" });
      assert.equal(await questionList.isVisible(), false);
      assert.ok((await questionDetail.innerText()).includes("E2E 思路 0"));
      assert.equal(await questionDetail.locator("textarea").count(), 0);
      assert.ok((await questionDetail.innerText()).includes("E2E 答案 0"));
      await questionDetail.getByRole("button", { name: "编辑思路与答案", exact: true }).tap();
      assert.ok((await questionDetail.getByLabel("思路", { exact: true }).inputValue()).includes("E2E 思路 0"));
      assert.equal(await questionDetail.getByLabel("答案", { exact: true }).inputValue(), "E2E 答案 0");
      await questionDetail.getByRole("button", { name: "阅读学习", exact: true }).tap();
      assert.equal(await questionDetail.locator("textarea").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
      await capture(page, `interview-detail-${width}`);
      await page.evaluate(() => history.back());
      await questionList.waitFor({ state: "visible" });
      await page.evaluate(() => history.forward());
      await questionDetail.waitFor({ state: "visible" });
      await questionDetail.getByRole("button", { name: "← 返回题目列表" }).tap();
      await questionList.waitFor({ state: "visible" });
      await questionList.getByRole("button", { name: "E2E 面试问题 1", exact: true }).tap();
      await questionDetail.waitFor({ state: "visible" });
      assert.ok((await questionDetail.innerText()).includes("参考答案 · 待确认"));
      assert.ok((await questionDetail.innerText()).includes("中英双语"));
      const reference = questionDetail.getByTestId("interview-study-view");
      assert.ok((await reference.innerText()).includes("E2E English reference answer"));
      assert.equal(await questionDetail.locator("textarea").count(), 0, "reading never opens an editor");
      const detailHistoryLength = await page.evaluate(() => history.length);
      await questionDetail.getByRole("button", { name: "参考表达", exact: true }).tap();
      assert.equal(await page.evaluate(() => history.length), detailHistoryLength);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
      await capture(page, `interview-reference-${width}`);
      await questionDetail.getByRole("button", { name: "← 返回题目列表" }).tap();
      await questionList.waitFor({ state: "visible" });
      await interview.getByLabel("面试岗位").selectOption("e2e-target");
      await questionList.getByRole("button", { name: "E2E 面试问题 2", exact: true }).tap();
      await questionDetail.waitFor({ state: "visible" });
      assert.ok((await questionDetail.innerText()).includes("E2E 思路 2"));
      await capture(page, `interview-target-${width}`);
      await page.goto(`${baseURL}/mobile-native-e2e`, { waitUntil: "networkidle" });

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

    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await desktop.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/mobile-native-e2e`, { waitUntil: "networkidle" });
    const interview = page.getByTestId("interview-harness");
    const questionList = interview.getByTestId("interview-question-list");
    const detail = interview.getByTestId("interview-question-detail");
    await interview.getByLabel("搜索题库", { exact: true }).fill("English reference");
    await questionList.getByRole("button", { name: "E2E 面试问题 1", exact: true }).click();
    assert.equal(await questionList.isVisible(), true);
    assert.equal(await detail.isVisible(), true);
    assert.ok((await detail.innerText()).includes("E2E English reference answer"));
    assert.equal(await detail.locator("textarea").count(), 0);
    assert.equal(await detail.getByRole("link", { name: "练习这道题 →", exact: true }).getAttribute("href"), "/career/interview/practice/e2e-prep-1");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
    await capture(page, "interview-desktop-1440");
    assert.deepEqual(errors, [], "desktop learning view should not have uncaught errors");
    await desktop.close();
    console.log("mobile-native-e2e: 1440px desktop passed");

    // Shared shell screenshots use real workspace components with synthetic
    // fixtures. Route stubs supply only fixture reads; no form is submitted.
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 768, hasTouch: width < 768 });
      await context.route("**/api/calendar/events?**", (route) => route.fulfill({ json: { events: [], truncated: false } }));
      await context.route("**/api/tasks/lists", (route) => route.fulfill({ json: { lists: [{ id: "e2e-list", displayName: "日常", isDefault: true }] } }));
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let todayOrigin;
      for (const scene of ["today", "today-loading", "tasks", "tasks-loading", "calendar", "calendar-loading", "notes"]) {
        await page.goto(`${baseURL}/mobile-native-e2e?scene=${scene}`, { waitUntil: "networkidle" });
        await page.getByTestId("workspace-polish-harness").waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${scene} ${width}px should not overflow`);
        if (scene === "tasks") await page.getByRole("button", { name: "全部", exact: true }).click();
        const selected = page.locator('nav [aria-current="page"]:visible');
        assert.equal(await selected.count(), 1, `${scene} ${width}px should identify one active navigation destination`);
        if (scene === "today") {
          const heading = await page.getByRole("heading", { name: "现在", exact: true }).boundingBox();
          const main = await page.locator("#main-content").boundingBox();
          assert.ok(heading && main);
          const inset = heading.x - main.x;
          const expectedInset = Math.max(0, main.width - 1080) / 2 + (width < 768 ? 16 : 32);
          assert.ok(Math.abs(inset - expectedInset) <= 1, `Today ${width}px has one responsive gutter: ${inset}, expected ${expectedInset}`);
          todayOrigin = await page.locator(".now-workspace > header").boundingBox();
        }
        if (scene === "today-loading") {
          const skeletonOrigin = await page.locator(".now-workspace > header").boundingBox();
          assert.ok(todayOrigin && skeletonOrigin);
          assert.ok(Math.abs(todayOrigin.x - skeletonOrigin.x) <= 1 && Math.abs(todayOrigin.y - skeletonOrigin.y) <= 1, `Today ${width}px loading and content share an origin`);
        }
        if (scene === "notes" && width >= 768) {
          const width = await page.getByRole("button", { name: "调整笔记导航宽度，双击恢复默认" }).evaluate((node) => node.parentElement.getBoundingClientRect().width);
          assert.equal(width, 272, "first Notes visit preserves the intended navigator width");
        }
        await capture(page, `workspace-${scene}-${width}`);
        if (scene === "tasks") {
          await page.getByRole("button", { name: "打开任务：核对本周计划", exact: true }).click();
          const detail = page.getByRole("complementary", { name: "任务详情", exact: true });
          await detail.waitFor({ state: "visible" });
          await capture(page, `workspace-task-detail-${width}`);
          if (width < 768) await page.evaluate(() => history.back());
          else await detail.getByRole("button", { name: "关闭任务详情", exact: true }).click();
          await detail.waitFor({ state: "hidden" });
          assert.equal(await page.locator('[data-navigation-progress]').count(), 0);
        }
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${baseURL}/mobile-native-e2e?scene=today`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "快速新建", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "visible" });
      await capture(page, `workspace-create-reduced-motion-${width}`);
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.deepEqual(errors, [], `shared workspaces ${width}px should have no uncaught errors`);
      await context.close();
      console.log(`workspace-polish-e2e: ${width}px passed`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
