/* eslint-disable @typescript-eslint/no-require-imports -- CI-only synthetic browser verification. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
assert.ok(process.env.CI, "Headless planning verification runs only in remote CI; local UI uses the computer-use browser");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname), "Synthetic planning verification must target a loopback harness");
const output = process.env.E2E_PLANNING_SCREENSHOT_DIR || "test-results/planning-visual";
const title = "把学习记录变成清楚的知识脉络";
const pendingTasks = require("../src/components/testing/planning-pending-tasks.json");
const task = pendingTasks.tasks[0];
const diagnostics = [];
const traces = new Map();
let traceSequence = 0;
async function startTrace(context, label) {
  const path = `${output}/trace-${String(++traceSequence).padStart(2, "0")}-${label}.zip`;
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  traces.set(context, path);
}
async function closeContext(context) {
  const trace = traces.get(context);
  if (trace) {
    await context.tracing.stop({ path: trace });
    traces.delete(context);
  }
  await context.close();
}
async function isolate(context) {
  let writes = 0;
  await context.route("**/*", route => {
    if (!["GET", "HEAD"].includes(route.request().method())) { writes += 1; return route.fulfill({ status: 409, json: { error: "All writes blocked in synthetic planning verification" } }); }
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/calendar/pending-tasks") return route.fulfill({ json: pendingTasks });
    if (pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Synthetic fixture does not access a live backend" } });
    return route.continue();
  });
  return () => writes;
}
async function noOverflow(page, label) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, root: document.documentElement.scrollWidth }));
  assert.ok(geometry.root <= geometry.width + 1, `${label}: ${JSON.stringify(geometry)}`);
  diagnostics.push({ label, ...geometry });
}
async function doubleComputedText(locator) {
  // Snapshot every normal computed size before assigning anything, so child
  // inheritance cannot accidentally compound the enlargement. This includes
  // fixed-pixel calendar text, unlike a root rem-only scale.
  return locator.evaluate(root => {
    const nodes = [root, ...root.querySelectorAll("*")].filter(node => node instanceof HTMLElement);
    const before = nodes.map(node => { const style = getComputedStyle(node); return { node, fontSize: parseFloat(style.fontSize), lineHeight: style.lineHeight }; });
    for (const { node, fontSize, lineHeight } of before) {
      node.style.fontSize = `${fontSize * 2}px`;
      if (lineHeight.endsWith("px")) node.style.lineHeight = `${parseFloat(lineHeight) * 2}px`;
    }
    return before.map(({ node, fontSize }) => ({ tag: node.tagName, before: fontSize, after: parseFloat(getComputedStyle(node).fontSize) }));
  });
}
async function monitorTransition(page, action) {
  await page.evaluate(() => { window.__planningWidths = []; let active = true; const record = () => { if (!active) return; window.__planningWidths.push([innerWidth, document.documentElement.scrollWidth]); requestAnimationFrame(record); }; requestAnimationFrame(record); window.__stopPlanningWidths = () => { active = false; }; });
  await action();
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"), undefined, { polling: "raf" });
  const widths = await page.evaluate(() => { window.__stopPlanningWidths(); return window.__planningWidths; });
  assert.ok(widths.every(([width, root]) => root <= width + 1), "project expand/reverse never causes transient root overflow");
}
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  let activePage;
  try {
    for (const width of [360, 390, 430, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", hasTouch: width < 768, isMobile: width < 768 });
      await startTrace(context, `matrix-${width}`);
      const writes = await isolate(context); const page = await context.newPage(); activePage = page; const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${baseURL}/mobile-native-e2e?scene=planning-visual`, { waitUntil: "networkidle" });
      const record = page.locator("article").filter({ has: page.getByRole("button", { name: title, exact: true }) });
      await record.waitFor(); await noOverflow(page, `projects-${width}`);
      const titleButton = record.getByRole("button", { name: title, exact: true });
      await titleButton.click(); assert.equal(await titleButton.getAttribute("aria-expanded"), "true");
      assert.ok(await record.locator('[aria-hidden="false"]').innerText().then(text => text.includes("完成标准")));
      const detailsId = await titleButton.getAttribute("aria-controls");
      await titleButton.click(); await titleButton.click(); assert.equal(await titleButton.getAttribute("aria-controls"), detailsId);
      const filters = page.getByRole("group", { name: "按项目状态筛选" });
      await filters.getByRole("button", { name: /^已暂停/ }).click();
      assert.equal(await page.locator("article[data-project-status=on_hold]").count(), 1);
      assert.equal(await page.locator("article[data-project-status=active]").count(), 0);
      await filters.getByRole("button", { name: /^全部/ }).click();
      await page.getByRole("button", { name: "模拟已确认的项目状态更新", exact: true }).click();
      assert.equal(await record.getAttribute("data-project-status"), "completed");
      assert.equal(await record.locator('[data-complete=true]').count(), 1);
      await page.screenshot({ path: `${output}/projects-${width}.png`, fullPage: true });
      const projectSizes = await page.evaluate(() => ({ title: parseFloat(getComputedStyle(document.querySelector("article h2 button")).fontSize), body: parseFloat(getComputedStyle(document.querySelector("article>p")).fontSize), filter: parseFloat(getComputedStyle(document.querySelector('[aria-label="按项目状态筛选"] button')).fontSize) }));
      await page.goto(`${baseURL}/mobile-native-e2e?scene=planning-visual&textScale=200`, { waitUntil: "networkidle" });
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), "32px");
      const enlargedProjectSizes = await page.evaluate(() => ({ title: parseFloat(getComputedStyle(document.querySelector("article h2 button")).fontSize), body: parseFloat(getComputedStyle(document.querySelector("article>p")).fontSize), filter: parseFloat(getComputedStyle(document.querySelector('[aria-label="按项目状态筛选"] button')).fontSize) }));
      for (const key of Object.keys(projectSizes)) assert.equal(enlargedProjectSizes[key], projectSizes[key] * 2, `project ${key} actually doubles at ${width}px`);
      diagnostics.push({ label: `project-fonts-${width}`, before: projectSizes, after: enlargedProjectSizes });
      await noOverflow(page, `projects-200-${width}`);
      await page.screenshot({ path: `${output}/projects-200-${width}.png`, fullPage: true });
      await page.goto(`${baseURL}/mobile-native-e2e?scene=planning-visual&mode=calendar`, { waitUntil: "networkidle" });
      await page.locator(".fc-timeGridDay-view").waitFor();
      await page.getByRole("button", { name: "安排", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "拖放预览", exact: true });
      await dialog.waitFor();
      const normalDialogSizes = await dialog.evaluate(node => ({ title: parseFloat(getComputedStyle(node.querySelector('[data-slot="dialog-title"]')).fontSize), cancel: parseFloat(getComputedStyle([...node.querySelectorAll("button")].find(button => button.textContent === "取消")).fontSize) }));
      assert.ok((await dialog.innerText()).includes(task.title));
      assert.equal(await page.getByTestId("planning-preview-count").textContent(), "1");
      await dialog.getByRole("button", { name: "取消", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      await noOverflow(page, `calendar-${width}`);
      await page.screenshot({ path: `${output}/calendar-${width}.png`, fullPage: true });
      const normalCalendarSizes = await page.evaluate(() => ({ label: parseFloat(getComputedStyle(document.querySelector(".fc-timegrid-slot-label-cushion")).fontSize), event: parseFloat(getComputedStyle(document.querySelector(".fc-event-main p")).fontSize), schedule: parseFloat(getComputedStyle([...document.querySelectorAll("button")].find(button => button.textContent === "安排")).fontSize) }));
      const scaledNodes = await doubleComputedText(page.getByTestId("planning-visual-fixture"));
      assert.ok(scaledNodes.length > 100 && scaledNodes.every(node => Math.abs(node.after - node.before * 2) < .1), "all mounted calendar text, including fixed px, actually doubles");
      const enlargedCalendarSizes = await page.evaluate(() => ({ label: parseFloat(getComputedStyle(document.querySelector(".fc-timegrid-slot-label-cushion")).fontSize), event: parseFloat(getComputedStyle(document.querySelector(".fc-event-main p")).fontSize), schedule: parseFloat(getComputedStyle([...document.querySelectorAll("button")].find(button => button.textContent === "安排")).fontSize) }));
      for (const key of Object.keys(normalCalendarSizes)) assert.equal(enlargedCalendarSizes[key], normalCalendarSizes[key] * 2, `calendar ${key} actually doubles at ${width}px`);
      await noOverflow(page, `calendar-computed-200-${width}`);
      const schedule = page.getByRole("button", { name: "安排", exact: true });
      await schedule.scrollIntoViewIfNeeded();
      const scheduleBox = await schedule.boundingBox();
      assert.ok(scheduleBox.width >= 44 && scheduleBox.height >= 44, "200% schedule retains a real touch target");
      await schedule.click(); await dialog.waitFor();
      const scaledDialog = await doubleComputedText(dialog);
      assert.ok(scaledDialog.every(node => Math.abs(node.after - node.before * 2) < .1), "newly mounted dialog text doubles independently, once");
      const enlargedDialogSizes = await dialog.evaluate(node => ({ title: parseFloat(getComputedStyle(node.querySelector('[data-slot="dialog-title"]')).fontSize), cancel: parseFloat(getComputedStyle([...node.querySelectorAll("button")].find(button => button.textContent === "取消")).fontSize) }));
      for (const key of Object.keys(normalDialogSizes)) assert.equal(enlargedDialogSizes[key], normalDialogSizes[key] * 2, `dynamic dialog ${key} actually doubles at ${width}px`);
      await noOverflow(page, `calendar-dialog-computed-200-${width}`);
      const cancel = dialog.getByRole("button", { name: "取消", exact: true });
      await cancel.scrollIntoViewIfNeeded();
      const cancelBox = await cancel.boundingBox();
      assert.ok(cancelBox.width >= 44 && cancelBox.height >= 44 && cancelBox.y >= 0 && cancelBox.y + cancelBox.height <= 1000, "200% preview cancel is touchable and reachable");
      await page.screenshot({ path: `${output}/calendar-dialog-200-${width}.png`, fullPage: true });
      await cancel.click(); await dialog.waitFor({ state: "hidden" });
      await noOverflow(page, `calendar-after-cancel-200-${width}`);
      const retainedEventSizes = await page.locator(".fc-event-main p").evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
      assert.ok(retainedEventSizes.length > 0 && retainedEventSizes.every(size => size === normalCalendarSizes.event * 2), "opening and canceling the preview preserves the enlarged live event text");
      await page.screenshot({ path: `${output}/calendar-200-${width}.png`, fullPage: true });
      diagnostics.push({ label: `calendar-fonts-${width}`, before: normalCalendarSizes, after: enlargedCalendarSizes, dialogBefore: normalDialogSizes, dialogAfter: enlargedDialogSizes });
      assert.equal(writes(), 0, "all UI-only planning interactions avoid business writes");
      assert.deepEqual(errors, []); await closeContext(context);
    }
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "no-preference", hasTouch: width < 768, isMobile: width < 768, recordVideo: { dir: output, size: { width, height: 1000 } } });
      await startTrace(context, `motion-${width}`);
      const writes = await isolate(context); const page = await context.newPage(); activePage = page;
      await page.goto(`${baseURL}/mobile-native-e2e?scene=planning-visual`, { waitUntil: "networkidle" });
      const button = page.getByRole("button", { name: title, exact: true });
      await monitorTransition(page, async () => { await button.click(); await button.click(); await button.click(); });
      assert.equal(await button.getAttribute("aria-expanded"), "true");
      await page.getByRole("button", { name: "模拟已确认的项目状态更新", exact: true }).click();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await button.click();
      assert.equal(await button.getAttribute("aria-expanded"), "false");
      if (width === 1440) {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.goto(`${baseURL}/mobile-native-e2e?scene=planning-visual&mode=calendar`, { waitUntil: "networkidle" });
        const source = page.locator(`[data-calendar-task-id="${task.id}"]`);
        const slot = page.locator('.fc-timegrid-slot-lane[data-time="11:00:00"]');
        await slot.scrollIntoViewIfNeeded();
        const start = await source.boundingBox(); const end = await slot.boundingBox();
        assert.ok(start && end);
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
        await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 18 });
        const mirror = page.locator(".fc-event-mirror"); await mirror.waitFor();
        assert.ok((await mirror.innerText()).includes("45 分钟"), "actual external mirror reports its duration");
        assert.ok((await mirror.innerText()).includes("重叠 1 项"), "actual overlapping destination shows a loaded-calendar conflict");
        await page.screenshot({ path: `${output}/calendar-drag-overlap-1440.png`, fullPage: true });
        await page.mouse.up();
        await page.getByRole("dialog", { name: "拖放预览", exact: true }).waitFor();
        assert.equal(await page.getByTestId("planning-preview-count").textContent(), "1", "drop opens one preview without a ghost click");
        assert.ok((await page.getByTestId("planning-preview-range").innerText()).includes("2026-10-26T03:"));
        await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(await page.locator(".fc-event-mirror").count(), 0);
        assert.equal(await page.locator(".fc-event:not(.fc-event-mirror)").count(), 2, "canceling keeps the two canonical events and installs no task event");
        const again = await source.boundingBox();
        await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2); await page.mouse.down();
        await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 }); await mirror.waitFor();
        await page.mouse.move(20, 20, { steps: 12 }); await page.mouse.up();
        await page.waitForFunction(() => !document.querySelector(".fc-event-mirror"));
        assert.equal(await page.getByTestId("planning-preview-count").textContent(), "1", "releasing outside the calendar cancels without a second preview");
        assert.equal(await page.getByRole("dialog").count(), 0);
      }
      assert.equal(writes(), 0); await closeContext(context);
    }
    await writeFile(`${output}/diagnostics.json`, JSON.stringify(diagnostics, null, 2));
    console.log("planning-visual-e2e passed: five widths, 200%, real external drag mirror/conflict, one preview, reduced motion, no writes");
  } catch (error) {
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await writeFile(`${output}/diagnostics.json`, JSON.stringify(diagnostics, null, 2)).catch(() => {});
    for (const context of browser.contexts()) await closeContext(context).catch(async () => { await context.close().catch(() => {}); });
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
