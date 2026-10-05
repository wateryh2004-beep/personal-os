/* eslint-disable @typescript-eslint/no-require-imports -- CI-only synthetic browser verification. */
const assert = require("node:assert/strict");
const { mkdir, readdir, stat, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.E2E_TODAY_SCREENSHOT_DIR || "test-results/today";
const diagnostics = [];
const firstTask = "梳理项目复盘，把关键判断讲清楚";

async function isolate(context) {
  const actions = { count: 0, failNext: false };
  // No form reaches the server: successful responses are the framework's void
  // Flight response, not a database write. The gated fixture reflects its event.
  await context.route("**/*", async route => {
    if (route.request().method() !== "POST") return route.continue();
    if (!route.request().headers()["next-action"]) return route.fulfill({ json: {} });
    actions.count++;
    await new Promise(resolve => setTimeout(resolve, 180));
    if (actions.failNext) { actions.failNext = false; return route.fulfill({ status: 500, contentType: "text/plain", body: "Synthetic action failure" }); }
    return route.fulfill({ contentType: "text/x-component", body: '0:{"a":"$undefined","f":""}\n' });
  });
  await context.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/tasks/workspace") return route.fulfill({ json: { connection: null, lists: [], tasks: [], unavailable: false, schemaMissing: false } });
    if (path === "/api/today/workspace") return route.fulfill({ status: 503, json: { error: "Synthetic fixture owns its data; no live Today backend is used" } });
    return route.fulfill({ json: {} });
  });
  return actions;
}
async function fontEvidence(page, width) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".today-focus-title a" });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  const computed = await page.locator(".today-focus-title").evaluate(node => { const style = getComputedStyle(node); const root = getComputedStyle(document.querySelector(".today-calm")); return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight, canvas: root.backgroundColor, cjkFontAvailable: document.fonts.check('16px "Noto Sans CJK SC"') }; });
  diagnostics.push({ width, computed, fonts });
  assert.ok(computed.family.includes("sans-serif"));
  if (process.env.CI) assert.ok(fonts.some(font => font.familyName.includes("Noto Sans CJK")), "CI must prove an actual CJK sans glyph font, not merely a declared fallback");
  await cdp.detach();
}
async function noOverflow(page, label) {
  const expectedWidth = page.viewportSize().width;
  const measured = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, layoutWidth: innerWidth }));
  assert.ok(measured.scrollWidth <= expectedWidth + 1 && measured.layoutWidth <= expectedWidth + 1, `${label}: horizontal overflow ${JSON.stringify(measured)} vs ${expectedWidth}`);
}
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  let activePage;
  try {
    for (const width of [360, 390, 430, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", isMobile: width < 768, hasTouch: width < 768 });
      await isolate(context);
      const page = await context.newPage(); activePage = page; const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const visit = async mode => { await page.goto(`${baseURL}/mobile-native-e2e?scene=today-hierarchy&mode=${mode}`, { waitUntil: "networkidle" }); await page.getByTestId("today-calm").waitFor(); await noOverflow(page, `${mode}-${width}`); };
      const capture = name => page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      await visit("filled"); await fontEvidence(page, width);
      await capture("filled");
      await writeFile(`${output}/font-and-motion-diagnostics.json`, JSON.stringify(diagnostics, null, 2));
      const focus = page.locator('[aria-labelledby="today-priorities-heading"]');
      assert.equal(await page.getByRole("link", { name: firstTask, exact: true }).count(), 1);
      assert.equal(await page.getByRole("link", { name: /^核对需要补充的材料/ }).count(), 1);
      const ledger = page.locator('[aria-labelledby="today-ledger-heading"]');
      assert.ok((await ledger.locator("li").first().innerText()).includes("逾期"), "overdue precedes the calendar");
      const lead = await page.locator(".today-focus-title").boundingBox();
      const obligation = await page.getByRole("link", { name: /^核对需要补充的材料/ }).boundingBox();
      assert.ok(lead.y < 310, "lead must appear near the top");
      if (width < 768) assert.ok(obligation.y < 720, "ordinary overdue obligation must not be buried");
      assert.equal(await page.getByTestId("today-calm").getAttribute("data-enter"), "false", "reduced motion has no entrance");
      assert.equal(await page.locator('[data-motion-group="lead"]').evaluate(node => getComputedStyle(node).animationName), "none");
      assert.equal(await page.getByTestId("today-background").getAttribute("data-expanded"), "false");
      await capture("filled");
      const background = page.getByTestId("today-background");
      const disclosure = background.getByRole("button", { name: "背景与简报", exact: true });
      await disclosure.click(); await page.getByRole("button", { name: "帮助整理", exact: true }).waitFor();
      await disclosure.click(); await disclosure.click(); await disclosure.click();
      assert.equal(await disclosure.getAttribute("aria-expanded"), "false", "repeated taps settle closed");
      await focus.getByRole("button", { name: "调整重点", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "选择今日重点", exact: true });
      await editor.waitFor();
      if (width < 768) assert.notEqual(await page.evaluate(() => document.activeElement?.id), "today-priority-search");
      await editor.getByRole("button", { name: "选择重点 核对需要补充的材料", exact: true }).click();
      assert.equal(await editor.getByRole("button", { name: "选择重点 整理读书笔记", exact: true }).isDisabled(), true);
      await capture("focus-editor");
      if (width < 768) {
        await page.setViewportSize({ width, height: 500 });
        await editor.getByRole("searchbox").fill("读书");
        const save = await editor.getByRole("button", { name: "保存重点", exact: true }).boundingBox();
        assert.ok(save && save.y >= 0 && save.y + save.height <= 500);
        await capture("short-viewport-editor"); await page.setViewportSize({ width, height: 900 });
      }
      await editor.getByRole("button", { name: "取消", exact: true }).click(); await editor.waitFor({ state: "hidden" });
      assert.equal(await focus.getByRole("list", { name: "已保存的今日重点" }).locator("li").count(), 2);
      await focus.getByRole("button", { name: "调整重点", exact: true }).click(); await editor.waitFor();
      if (width < 768) await page.evaluate(() => history.back()); else await page.keyboard.press("Escape");
      await editor.waitFor({ state: "hidden" });
      await visit("tomorrow");
      await page.getByText("今天的日程已结束", { exact: true }).waitFor();
      await page.getByRole("heading", { name: "明天的计划沟通", exact: true }).waitFor();
      assert.ok((await page.locator(".today-lead-meta").innerText()).includes("14:00"), "next event keeps its real start time");
      assert.equal(await page.getByRole("link", { name: "计划沟通", exact: true }).count(), 0, "future does not duplicate lead event");
      await page.getByTestId("today-past").getByRole("button", { name: "已结束 2 项", exact: true }).click();
      assert.equal(await page.getByTestId("today-past").locator("li").count(), 2);
      await page.getByTestId("today-past").getByRole("button", { name: "已结束 2 项", exact: true }).click();
      await capture("evening");
      if (width < 768) {
        await visit("long");
        assert.equal(await page.locator(".today-focus-item").count(), 3);
        assert.equal(await page.locator(".today-task-row").count(), 12, "all overdue records remain expanded despite former eight-item cap");
        await capture("long-focus-many-overdue");
        await visit("filled"); await page.evaluate(() => document.documentElement.style.fontSize = "200%"); await noOverflow(page, `200%-${width}`); await capture("font-200");
        await page.evaluate(() => document.documentElement.style.fontSize = "");
        await visit("obligations");
        assert.equal(await page.getByText("今天的日程已结束", { exact: true }).count(), 0, "unresolved tasks block reassuring evening state");
        assert.equal(await page.locator(".today-task-row").count(), 13);
      }
      if (width === 390) {
        await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" }); await visit("filled"); await capture("filled-dark");
        await visit("tomorrow"); await capture("evening-dark");
        await visit("unavailable"); await page.getByText("日程暂未更新，已知事项仍保留。", { exact: true }).waitFor(); await capture("partial-failure-dark");
      }
      assert.deepEqual(errors, []); await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, reducedMotion: "no-preference", recordVideo: { dir: output, size: { width: 390, height: 900 } } });
    const actions = await isolate(context); const page = await context.newPage(); activePage = page;
    await page.goto(`${baseURL}/mobile-native-e2e?scene=today-hierarchy`, { waitUntil: "networkidle" });
    assert.equal(await page.getByTestId("today-calm").getAttribute("data-enter"), "true");
    diagnostics.push({ motion: await page.locator("[data-motion-group]").evaluateAll(nodes => nodes.map(node => ({ group: node.getAttribute("data-motion-group"), animation: getComputedStyle(node).animationName, duration: getComputedStyle(node).animationDuration, delay: getComputedStyle(node).animationDelay }))) });
    const complete = page.getByRole("button", { name: `完成 ${firstTask}`, exact: true });
    await complete.click();
    await page.getByRole("button", { name: `已完成 ${firstTask}`, exact: true }).waitFor();
    await page.getByText(`已完成：${firstTask}`, { exact: true }).waitFor();
    assert.equal(actions.count, 1);
    await page.getByRole("button", { name: "撤回", exact: true }).click();
    await page.getByRole("button", { name: `完成 ${firstTask}`, exact: true }).waitFor();
    await page.getByRole("button", { name: "调整重点", exact: true }).click();
    await page.getByRole("dialog", { name: "选择今日重点", exact: true }).waitFor();
    await page.evaluate(() => history.back());
    await page.getByRole("dialog", { name: "选择今日重点", exact: true }).waitFor({ state: "hidden" });
    await page.getByTestId("today-background").getByRole("button", { name: "背景与简报", exact: true }).click();
    await page.getByRole("button", { name: "帮助整理", exact: true }).waitFor();
    await page.getByTestId("today-background").getByRole("button", { name: "背景与简报", exact: true }).click();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByTestId("today-calm").getAttribute("data-enter"), "false", "return/reload does not replay entrance");
    await context.close();
    await writeFile(`${output}/font-and-motion-diagnostics.json`, JSON.stringify(diagnostics, null, 2));
    let total = 0; for (const name of await readdir(output)) total += (await stat(`${output}/${name}`)).size;
    assert.ok(total < 32 * 1024 * 1024, `focused Today artifact exceeds 32MiB: ${total}`);
    console.log(`today-calm-e2e passed: ${(total / 1024 / 1024).toFixed(2)}MiB evidence`);
  } catch (error) {
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${output}/font-and-motion-diagnostics.json`, JSON.stringify(diagnostics, null, 2));
    throw error;
  } finally {
    // Finalize recording containers even when an assertion fails.
    for (const context of browser.contexts()) await context.close().catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
