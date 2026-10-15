/* eslint-disable @typescript-eslint/no-require-imports -- Credential-free CI fixture verification. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
assert.match(base, /^http:\/\/127\.0\.0\.1:/);
const output = "test-results/workspace-details";
const notes = ["学习记录", "每周复盘", "想法与灵感"].map((title, index) => ({ id: `e2e-polish-note-${index}`, title, excerpt: "用于验证列表间距、文字层级与导航的虚构内容。", updated_at: "2026-10-02T00:00:00Z", pinned_at: null, folder_id: null, content_origin: "manual" }));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const events = [
  { id: "fixture-calendar-1", provider_event_id: "synthetic-1", subject: "阅读与材料整理 · Synthetic fixture", body_text: "仅用于布局与交互检查。", starts_at: `${today}T02:00:00Z`, ends_at: `${today}T03:30:00Z`, is_all_day: false, location_name: "示例图书馆", categories: ["领域·学业/论文"], importance: "normal", show_as: "busy", last_synced_at: `${today}T00:00:00Z` },
  { id: "fixture-calendar-2", provider_event_id: "synthetic-2", subject: "面试准备 · Synthetic fixture", body_text: "没有真实用户或外部写入。", starts_at: `${today}T06:00:00Z`, ends_at: `${today}T06:30:00Z`, is_all_day: false, location_name: null, categories: ["领域·求职/职业"], importance: "normal", show_as: "busy", last_synced_at: `${today}T00:00:00Z` },
];

async function isolate(context, evidence) {
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (request.method() !== "GET") { evidence.blockedWrites++; return route.abort(); }
    if (request.headers()["next-router-prefetch"]) return route.abort();
    if (url.pathname === "/api/calendar/events") return route.fulfill({ json: { events: events.filter(event => Date.parse(event.starts_at) >= Date.parse(url.searchParams.get("start")) && Date.parse(event.starts_at) < Date.parse(url.searchParams.get("end"))), truncated: false } });
    if (url.pathname === "/api/notes/list") return route.fulfill({ json: { notes, hasMore: false } });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Synthetic offline boundary" } });
    return route.continue();
  });
}

async function goto(page, scene) {
  await page.goto(`${base}/mobile-native-e2e?scene=${scene}`);
  await page.locator(".app-toolbar").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  let activePage;
  try {
    for (const width of [360, 390, 768, 1440]) {
      const result = { width, blockedWrites: 0, errors: [], checks: [] };
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", timezoneId: "Asia/Shanghai", hasTouch: width < 768 });
      await isolate(context, result);
      const page = await context.newPage();
      activePage = page;
      page.on("pageerror", error => result.errors.push({ scene: new URL(page.url()).searchParams.get("scene"), message: error.message }));
      const capture = async name => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal page overflow at ${width}`);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true, animations: "disabled" });
        await writeFile(`${output}/progress-${width}.json`, JSON.stringify(result, null, 2));
        assert.deepEqual(result.errors, [], `${name}: no hydration or runtime errors`);
      };
      await goto(page, "career-filled");
      await page.locator(".career-target-card").waitFor();
      assert.equal(await page.getByRole("heading", { name: "正在准备", exact: true }).count(), 1);
      assert.ok(await page.locator(".career-target-card time").isVisible());
      await capture("career");
      result.checks.push("target-card-date-and-next-actions");

      await goto(page, "interview-reading");
      if (width < 1024) await page.getByRole("navigation", { name: "面试题目", exact: true }).getByRole("button").first().click();
      await page.locator("#study-answer-body").waitFor();
      const answer = await page.locator("#study-answer-body").innerText();
      await page.getByRole("button", { name: "自测与追问", exact: true }).click();
      assert.equal(await page.locator("#study-answer-body").isVisible(), false);
      assert.equal(await page.locator("#study-recall").evaluate(node => node === document.activeElement), true);
      await page.getByRole("button", { name: "显示答案", exact: true }).click();
      assert.equal(await page.locator("#study-answer-body").innerText(), answer);
      await page.getByRole("button", { name: "思路拆解讲解", exact: true }).click();
      await page.locator("#study-thinking[open]").waitFor();
      await capture("interview");
      result.checks.push("recall-conceals-restores-exact-answer-and-focus");

      await goto(page, "notes");
      await page.locator(".notes-list-row").first().waitFor();
      const list = page.getByRole("group", { name: "笔记列表显示方式" });
      await list.getByRole("button", { name: "列表", exact: true }).click();
      assert.equal(await page.locator(".notes-list-row p.line-clamp-2").count(), 0);
      await list.getByRole("button", { name: "摘要", exact: true }).click();
      assert.equal(await page.locator(".notes-list-row p.line-clamp-2").count(), 3);
      await capture("notes-list");
      result.checks.push("note-excerpt-toggle-keeps-existing-list");

      await goto(page, "note-editor");
      await page.locator(".cm-editor").waitFor();
      assert.ok(await page.getByLabel("笔记标题", { exact: true }).evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 28), "the title is not flattened by the mobile input rule");
      const alignment = await page.evaluate(() => {
        const title = document.querySelector(".notes-title-input"), content = document.querySelector(".cm-content");
        return { title: title.getBoundingClientRect().left + parseFloat(getComputedStyle(title).paddingLeft), text: content.getBoundingClientRect().left + parseFloat(getComputedStyle(content).paddingLeft) };
      });
      assert.ok(Math.abs(alignment.title - alignment.text) <= 2, `title and editor align: ${JSON.stringify(alignment)}`);
      await page.evaluate(() => { window.__fixtureEditor = document.querySelector(".cm-editor"); });
      const mode = page.getByRole("group", { name: "笔记阅读方式" });
      for (let index = 0; index < 2; index++) {
        await mode.getByRole("button", { name: "阅读", exact: true }).click();
        await mode.getByRole("button", { name: "阅读", exact: true, pressed: true }).waitFor();
        await page.getByRole("article", { name: "笔记正文", exact: true }).waitFor();
        assert.equal(await page.locator(".cm-editor").isVisible(), false);
        assert.equal(await page.locator(".note-reading-pane").evaluate(node => getComputedStyle(node).animationName), "none");
        await mode.getByRole("button", { name: "编辑", exact: true }).click();
        await page.locator(".cm-editor").waitFor({ state: "visible" });
        assert.ok(await page.evaluate(() => document.querySelector(".cm-editor") === window.__fixtureEditor));
      }
      await mode.getByRole("button", { name: "阅读", exact: true }).click();
      await mode.getByRole("button", { name: "阅读", exact: true, pressed: true }).waitFor();
      const readingAlignment = await page.evaluate(() => ({ title: document.querySelector(".notes-reading-title").getBoundingClientRect().left, text: document.querySelector(".note-reading-prose").getBoundingClientRect().left }));
      assert.ok(Math.abs(readingAlignment.title - readingAlignment.text) <= 2, `title and reading align: ${JSON.stringify(readingAlignment)}`);
      await capture("note-reading");
      if (width === 390) {
        // Enlarge actual reading glyphs and line boxes, rather than assuming
        // changing the root rem size doubles the many px-based body styles.
        const enlarged = await page.addStyleTag({ content: `
          .note-reading-prose { font-size:32px!important; }
          .note-reading-prose :is(p,li,blockquote,a,strong,em) { font-size:32px!important; line-height:2!important; }
          .note-reading-prose h1,.notes-reading-title { font-size:56px!important; line-height:1.4!important; }
          .note-reading-prose h2 { font-size:48px!important; line-height:1.5!important; }
          .note-reading-prose h3 { font-size:40px!important; line-height:1.5!important; }
        ` });
        const scale = await page.locator(".note-reading-prose p").first().evaluate(node => parseFloat(getComputedStyle(node).fontSize));
        assert.ok(scale >= 32, `reading text actually doubles to at least 32px, got ${scale}`);
        await capture("note-reading-text-200");
        await enlarged.evaluate(node => node.remove());
        result.checks.push("reading-text-and-line-boxes-200-percent");
      }
      await page.setViewportSize({ width, height: 600 });
      for (const label of ["编辑", "阅读"]) assert.ok(await mode.getByRole("button", { name: label, exact: true }).isVisible());
      assert.ok((await page.locator(".note-reading-pane").boundingBox()).height >= 120, "short screen keeps a useful reading region");
      await capture("note-short-screen");
      await page.setViewportSize({ width, height: 900 });
      result.checks.push("editor-dom-lifetime-reading-and-short-screen");

      await goto(page, "calendar");
      await page.locator(".fc-view-harness").waitFor();
      const create = page.getByRole("button", { name: "新建日程", exact: true });
      assert.ok(await create.isVisible(), "primary create is visible on phones");
      if (width < 640) await page.getByRole("button", { name: /^筛选/ }).click();
      await page.getByRole("button", { name: "学业 / 论文", exact: true }).click();
      if (width < 640) await page.keyboard.press("Escape");
      const active = page.locator('[aria-label="已生效的日历筛选"]');
      await active.waitFor();
      await active.getByRole("button", { name: "清除筛选", exact: true }).click();
      await active.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "月", exact: true }).click();
      await page.locator('button[title="跳到月份"]').click();
      await page.getByLabel("跳到月份", { exact: true }).fill("2026-01");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "上一段日期", exact: true }).click();
      await page.getByRole("heading", { name: "2025年12月", exact: true }).waitFor();
      await page.getByRole("button", { name: "下一段日期", exact: true }).click();
      await page.getByRole("heading", { name: "2026年1月", exact: true }).waitFor();
      await page.getByRole("button", { name: "回到今天", exact: true }).click();
      await page.getByRole("button", { name: "日", exact: true }).click();
      await page.locator(".fc-event").first().waitFor();
      await page.locator(".fc-event-main").getByText("阅读与材料整理 · Synthetic fixture", { exact: true }).waitFor();
      await capture("calendar");
      await create.click();
      await page.getByRole("heading", { name: "新建日程", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      result.checks.push("calendar-primary-create-category-reset-month-and-year-navigation");
      assert.equal(result.blockedWrites, 0, "local display controls never submit writes");
      assert.deepEqual(result.errors, []);
      evidence.push(result);
      await context.close();
    }
    // Motion evidence uses its own uninterrupted context: no screenshot resizing
    // or forced animation completion contaminates the recorded trajectories.
    for (const width of [390, 1440]) {
      const result = { width, blockedWrites: 0 };
      const context = await browser.newContext({ viewport: { width, height: 900 }, recordVideo: { dir: `${output}/video/${width}`, size: { width, height: 900 } }, timezoneId: "Asia/Shanghai" });
      await isolate(context, result);
      const page = await context.newPage();
      await goto(page, "note-editor");
      await page.locator(".cm-editor").waitFor();
      const mode = page.getByRole("group", { name: "笔记阅读方式" });
      await mode.getByRole("button", { name: "阅读", exact: true }).click();
      assert.equal(await page.locator(".note-reading-pane").evaluate(node => getComputedStyle(node).animationName), "reading-arrive");
      await page.waitForTimeout(450);
      await mode.getByRole("button", { name: "编辑", exact: true }).click();
      await mode.getByRole("button", { name: "阅读", exact: true }).click();
      await page.waitForTimeout(80);
      await mode.getByRole("button", { name: "编辑", exact: true }).click();
      await page.locator(".cm-editor").waitFor();
      await page.waitForTimeout(450);
      assert.equal(result.blockedWrites, 0);
      await context.close();
    }
    await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
    console.log("PASS: workspace detail flows at 360/390/768/1440, short screens, editor lifetime, recall focus, month navigation, reduced motion and separate recordings; synthetic data only.");
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
      const diagnostics = await activePage.evaluate(() => ({ scene: new URL(location.href).searchParams.get("scene"), events: [...document.querySelectorAll(".fc-event-main")].map(node => ({ html: node.innerHTML, text: node.textContent, color: getComputedStyle(node).color })), savedState: document.querySelector(".notes-editor-toolbar [aria-live]")?.textContent })).catch(() => null);
      await writeFile(`${output}/failure.json`, JSON.stringify(diagnostics, null, 2));
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
