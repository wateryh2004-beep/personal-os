/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS browser-test entrypoint. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const widths = [360, 390, 412, 430];
const visualMetrics = [];

async function captureElement(locator, name) {
  if (!process.env.E2E_SCREENSHOT_DIR) return;
  await locator.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/${name}.png` });
}

async function textMetrics(locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return { fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), letterSpacing: style.letterSpacing, color: style.color, x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

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

      // Drawer behavior belongs to the real AppShell; the standalone overlay
      // fixture only renders a tab bar with an intentionally inert More button.
      await page.goto(`${baseURL}/mobile-native-e2e?scene=heading`, { waitUntil: "networkidle" });
      await page.getByTestId("workspace-polish-harness").waitFor();
      const bottomNavigation = page.getByRole("navigation", { name: "底部导航" });
      const careerTab = bottomNavigation.getByRole("link", { name: "职业", exact: true });
      await careerTab.waitFor({ state: "visible" });
      assert.equal(await careerTab.getAttribute("href"), "/career", `${width}px Career tab should link directly to /career`);
      assert.deepEqual(await bottomNavigation.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href"))), ["/today", "/notes", "/career"], `${width}px frequent workspaces stay one tap away`);
      await bottomNavigation.getByRole("button", { name: "更多", exact: true }).click();
      const more = page.getByRole("dialog");
      for (const name of ["日历", "任务", "收集箱", "文件", "简报", "购物", "旅行", "设置"]) {
        await more.getByRole("link", { name, exact: true }).waitFor({ state: "visible" });
      }
      assert.equal(await more.getByRole("link", { name: "项目", exact: true }).count(), 0);
      assert.equal(await more.getByRole("link", { name: "回顾", exact: true }).count(), 0);
      await page.evaluate(() => history.back());
      await more.waitFor({ state: "hidden" });

      await page.goto(`${baseURL}/mobile-native-e2e`, { waitUntil: "networkidle" });
      await page.getByTestId("mobile-native-harness").waitFor();
      const focus = page.locator('[aria-labelledby="today-priorities-heading"]');
      await focus.getByRole("button", { name: "选择重点" }).click();
      const focusEditor = page.getByRole("dialog", { name: "选择今日重点", exact: true });
      for (const n of [1,2,3]) await focusEditor.getByRole("button", { name: new RegExp(`选择重点 E2E 未定期任务 ${n}`) }).click();
      assert.equal(await focusEditor.getByRole("button", { name: /选择重点 E2E 未定期任务 4/ }).isDisabled(), true, `${width}px limits priorities to three`);
      assert.equal(await focusEditor.getByRole("list", { name: "待保存的今日重点" }).locator("li").count(), 3);
      await capture(page, `priorities-selected-${width}`);
      await focusEditor.getByRole("button", { name: /移除重点 E2E 未定期任务 2/ }).click();
      assert.equal(await focusEditor.getByRole("button", { name: /选择重点 E2E 未定期任务 4/ }).isEnabled(), true);
      await focusEditor.getByRole("button", { name: "取消", exact: true }).click();
      await focusEditor.waitFor({ state: "hidden" });
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
      await interview.getByTestId("interview-filters").locator("summary").click();
      await interview.getByLabel("学习模块", { exact: true }).selectOption("SQL与数据分析");
      await interview.getByLabel("提问风格", { exact: true }).selectOption("stress");
      assert.equal(await questionList.getByRole("button", { name: "E2E 面试问题 0", exact: true }).count(), 0);
      await questionList.getByRole("button", { name: "E2E 面试问题 1", exact: true }).tap();
      await questionDetail.waitFor({ state: "visible" });
      await questionDetail.getByRole("button", { name: "标准答案", exact: true }).tap();
      await page.evaluate(() => history.back());
      await questionList.waitFor({ state: "visible" });
      assert.equal(await interview.getByLabel("搜索题库", { exact: true }).inputValue(), "English reference");
      assert.equal(await interview.getByLabel("学习模块", { exact: true }).inputValue(), "SQL与数据分析");
      await interview.getByLabel("搜索题库", { exact: true }).fill("no-matching-question");
      await questionList.getByRole("button", { name: "清除搜索与筛选", exact: true }).tap();
      assert.equal(await interview.getByLabel("搜索题库", { exact: true }).inputValue(), "");
      await capture(page, `interview-library-${width}`);
      await questionList.getByRole("button", { name: "E2E 面试问题 0", exact: true }).tap();
      await questionDetail.waitFor({ state: "visible" });
      assert.equal(await questionList.isVisible(), false);
      assert.ok(!(await questionDetail.innerText()).includes("E2E 思路 0"));
      await questionDetail.getByRole("navigation", { name: "题目学习章节", exact: true }).getByRole("button", { name: "思路拆解讲解", exact: true }).tap();
      assert.ok((await questionDetail.locator("#study-thinking").innerText()).includes("E2E 思路 0"));
      await questionDetail.locator("#study-thinking summary").click();
      assert.equal(await questionDetail.locator("textarea").count(), 0);
      assert.ok((await questionDetail.innerText()).includes("E2E 答案 0"));
      assert.equal(await questionDetail.getByRole("button", { name: "编辑思路与答案", exact: true }).count(), 0);
      await questionDetail.getByTestId("interview-study-view").locator("footer details").first().locator("summary").click();
      await questionDetail.getByTestId("study-provenance").waitFor({ state: "visible" });
      assert.ok((await questionDetail.innerText()).includes("不代表内容或个人经历已经核实"));
      await questionDetail.getByTestId("interview-study-view").locator("footer details").first().locator("summary").click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
      await capture(page, `interview-detail-${width}`);
      await captureElement(questionDetail, `interview-detail-crop-${width}`);
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
      await questionDetail.getByRole("button", { name: "标准答案", exact: true }).tap();
      assert.equal(await page.evaluate(() => history.length), detailHistoryLength);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
      await capture(page, `interview-reference-${width}`);
      await questionDetail.getByRole("button", { name: "← 返回题目列表" }).tap();
      await questionList.waitFor({ state: "visible" });
      await interview.getByLabel("面试岗位").selectOption("e2e-target");
      await questionList.getByRole("button", { name: "E2E 面试问题 2", exact: true }).tap();
      await questionDetail.waitFor({ state: "visible" });
      assert.equal(await questionDetail.locator("#study-thinking").getAttribute("open"), null);
      await questionDetail.getByRole("navigation", { name: "题目学习章节", exact: true }).getByRole("button", { name: "思路拆解讲解", exact: true }).tap();
      assert.ok((await questionDetail.locator("#study-thinking").innerText()).includes("E2E 思路 2"));
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
    await captureElement(interview, "interview-workspace-crop-1440");
    assert.deepEqual(errors, [], "desktop learning view should not have uncaught errors");
    await desktop.close();
    console.log("mobile-native-e2e: 1440px desktop passed");
    await require("./interview-reading-e2e.cjs").verifyInterviewReading(browser, baseURL, process.env.E2E_SCREENSHOT_DIR || "test-results/mobile");

    // Shared shell screenshots use real workspace components with synthetic
    // fixtures. Route stubs supply only fixture reads; no form is submitted.
    for (const width of [360, 390, 430, 640, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 768, hasTouch: width < 768 });
      await context.route("**/api/calendar/events?**", (route) => route.fulfill({ json: { events: [], truncated: false } }));
      await context.route("**/api/tasks/lists", (route) => route.fulfill({ json: { lists: [{ id: "e2e-list", displayName: "日常", isDefault: true }] } }));
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let todayOrigin;
      for (const scene of ["heading", "today", "today-filled", "today-loading", "tasks", "tasks-loading", "calendar", "calendar-loading", "notes"]) {
        await page.goto(`${baseURL}/mobile-native-e2e?scene=${scene}`, { waitUntil: "networkidle" });
        await page.getByTestId("workspace-polish-harness").waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${scene} ${width}px should not overflow`);
        if (scene === "tasks") await page.getByRole("button", { name: "全部", exact: true }).click();
        const selected = page.locator('nav [aria-current="page"]:visible');
        assert.equal(await selected.count(), 1, `${scene} ${width}px should identify one active navigation destination`);
        if (scene === "today") {
          const heading = await page.getByRole("heading", { name: "今天", exact: true }).boundingBox();
          const main = await page.locator("#main-content").boundingBox();
          assert.ok(heading && main);
          const inset = heading.x - main.x;
          const expectedInset = Math.max(0, main.width - (width < 1024 ? 760 : 820)) / 2 + (width < 375 ? 20 : width < 768 ? 24 : width < 1024 ? 32 : 48);
          assert.ok(Math.abs(inset - expectedInset) <= 1, `Today ${width}px has one responsive gutter: ${inset}, expected ${expectedInset}`);
          todayOrigin = await page.locator(".today-header").boundingBox();
        }
        if (scene === "today" || scene === "today-filled") {
          assert.equal(await page.getByRole("button", { name: "加入 Inbox", exact: true }).count(), 0, "capture has one global entry point");
          const context = await page.getByTestId("today-background").boundingBox();
          const priorities = await page.locator('[aria-labelledby="today-priorities-heading"]').boundingBox();
          assert.ok(context && priorities);
          assert.equal(await page.locator('[aria-labelledby="today-focus-heading"]').count(), 0, "legacy focus-stack does not compete with the ledger");
          assert.equal(await page.locator('[aria-labelledby="today-commitments-heading"]').count(), 0, "legacy reminders no longer repeat a module");
          assert.equal(await page.getByTestId("today-background").getAttribute("data-expanded"), "false");
          const contentBounds = await page.locator(".now-workspace").evaluate((node) => {
            const box = node.getBoundingClientRect(); const style = getComputedStyle(node);
            return { left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight) };
          });
          for (const box of [context, priorities]) assert.ok(box.x >= contentBounds.left - 1 && box.x + box.width <= contentBounds.right + 1);
          if (scene === "today-filled") await page.getByRole("heading", { name: "今日安排", exact: true }).waitFor();
          visualMetrics.push({ scene, width, context, priorities });
        }

        if (scene === "heading" || scene === "tasks" || scene === "notes") {
          const title = await textMetrics(page.locator("#main-content h1").first());
          assert.equal(title.fontSize, width < 768 ? 24 : 28, "workspace titles share a responsive scale");
          assert.ok(title.lineHeight / title.fontSize >= 1.2, "CJK headings have enough line height");
          visualMetrics.push({ scene, width, title });
        }
        if (scene === "tasks") {
          const activeTab = page.locator('nav[aria-label="任务视图"] [aria-pressed="true"]');
          const underline = await activeTab.evaluate((node) => {
            const style = getComputedStyle(node, "::after");
            return { height: parseFloat(style.height), bottom: parseFloat(style.bottom) };
          });
          assert.deepEqual(underline, { height: 2, bottom: 0 }, "active task underline stays inside its scrolling rail");
          const row = page.getByRole("button", { name: "打开任务：核对本周计划", exact: true });
          assert.equal((await textMetrics(row.locator("h2"))).fontSize, 14);
          assert.equal((await textMetrics(row.locator("h2 + p"))).fontSize, 13);
        }
        if (scene === "notes" && width < 768) {
          const menu = await page.getByRole("button", { name: "管理 学习记录", exact: true }).boundingBox();
          assert.ok(menu && menu.width >= 44 && menu.height >= 44, "Notes row menu is touch sized");
          const title = await page.getByRole("link", { name: "学习记录", exact: true }).last().boundingBox();
          assert.ok(title && title.x + title.width <= menu.x, "Notes text and menu hit areas stay separate");
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
        if (scene === "notes" && width < 768) {
          const folder = page.getByRole("button", { name: "打开笔记文件", exact: true });
          const title = page.getByRole("heading", { name: "全部笔记", exact: true });
          const folderBox = await folder.boundingBox();
          const titleBox = await title.boundingBox();
          assert.ok(folderBox && titleBox);
          assert.ok(folderBox.y + folderBox.height + 8 <= titleBox.y, "mobile folder control must not cover the Notes title");
          await folder.click();
          await page.getByRole("dialog", { name: "笔记文件", exact: true }).waitFor({ state: "visible" });
          const drawer = page.getByRole("dialog", { name: "笔记文件", exact: true });
          const closeDrawer = drawer.getByRole("button", { name: "关闭", exact: true });
          const closeBox = await closeDrawer.boundingBox();
          const createBox = await drawer.getByRole("button", { name: "新建笔记", exact: true }).boundingBox();
          assert.ok(closeBox && createBox);
          assert.ok(createBox.x + createBox.width + 8 <= closeBox.x, "Notes drawer create and close controls must have separate hit areas");
          assert.ok(createBox.width >= 44 && createBox.height >= 44, "Notes drawer create control is touch-sized");
          assert.equal(await page.locator('[data-slot="sheet-overlay"]').evaluate((node) => getComputedStyle(node).backdropFilter), "none", "sheet scrim should not blur the full page");
          await capture(page, `workspace-notes-folder-${width}`);
          await page.evaluate(() => history.back());
          await page.getByRole("dialog", { name: "笔记文件", exact: true }).waitFor({ state: "hidden" });
          const after = await title.boundingBox();
          assert.ok(after && Math.abs(after.y - titleBox.y) <= 1, "closing folder navigation preserves title geometry");
          await folder.click();
          await drawer.waitFor({ state: "visible" });
          await closeDrawer.click();
          await drawer.waitFor({ state: "hidden" });
        }
        if (scene === "tasks" && width < 768) {
          const row = page.getByRole("button", { name: "打开任务：核对本周计划", exact: true });
          const rowBox = await row.boundingBox();
          const titleBox = await row.getByRole("heading", { name: "核对本周计划", exact: true }).boundingBox();
          const menuBox = await row.getByRole("button", { name: "核对本周计划 更多操作", exact: true }).boundingBox();
          assert.ok(rowBox && titleBox && menuBox);
          assert.ok(menuBox.x >= titleBox.x + titleBox.width && menuBox.y < titleBox.y + titleBox.height && menuBox.y - rowBox.y < 20, "task menu remains in the title row's right-hand column");
        }
        await capture(page, `workspace-${scene}-${width}`);
        if (scene === "tasks") {
          await page.getByRole("button", { name: "打开任务：核对本周计划", exact: true }).click();
          const detail = page.getByRole("dialog", { name: "任务详情", exact: true });
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
      assert.equal(await page.locator('[data-slot="dialog-overlay"]').evaluate((node) => getComputedStyle(node).backdropFilter), "none", "dialog scrim should not blur the full page");
      await capture(page, `workspace-create-reduced-motion-${width}`);
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.deepEqual(errors, [], `shared workspaces ${width}px should have no uncaught errors`);
      await context.close();
      console.log(`workspace-polish-e2e: ${width}px passed`);
    }
    if (process.env.E2E_SCREENSHOT_DIR) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(`${process.env.E2E_SCREENSHOT_DIR}/typography-spacing-metrics.json`, JSON.stringify(visualMetrics, null, 2));
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
