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
async function isolate(context, knownDuration = false) {
  let writes = 0;
  await context.route("**/*", route => {
    if (!["GET", "HEAD"].includes(route.request().method())) { writes += 1; return route.fulfill({ status: 409, json: { error: "All writes blocked in synthetic planning verification" } }); }
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/calendar/pending-tasks") return route.fulfill({ json: knownDuration ? { ...pendingTasks, tasks: pendingTasks.tasks.map(item => ({ ...item, estimated_minutes: 45 })) } : pendingTasks });
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
async function textBaseline(locator) {
  return locator.evaluate(root => [root, ...root.querySelectorAll("*")].filter(node => node instanceof HTMLElement).map(node => ({
    tag: node.tagName, className: node.className, before: parseFloat(getComputedStyle(node).fontSize),
    directText: [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join("").trim().slice(0, 200),
  })));
}
async function doubleComputedText(locator, baseline) {
  // A permanent stylesheet keeps real em inheritance and survives FullCalendar
  // remeasurement / a new dialog mount. Per-node fixed-px snapshots changed
  // table structure and were lost when the library reconciled those nodes.
  // This is one normal -> 200% transformation, never 200% -> 400% on re-entry.
  return locator.evaluate((root, normal) => {
    if (!window.__planningStableText200) {
      let declarations = 0;
      const resolveSizeVariables = (size, selector) => {
        let context = document.documentElement;
        try { context = document.querySelector(selector) ?? context; } catch { /* Pseudo-element / future-state rules use root typography variables. */ }
        const computed = getComputedStyle(context);
        const rootComputed = getComputedStyle(document.documentElement);
        let resolved = size;
        for (let depth = 0; depth < 8 && resolved.includes("var("); depth++) {
          const next = resolved.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (original, name, fallback) => computed.getPropertyValue(name).trim() || rootComputed.getPropertyValue(name).trim() || fallback?.trim() || original);
          if (next === resolved) break;
          resolved = next;
        }
        return resolved;
      };
      const rules = entries => [...entries].map(rule => {
        if (rule instanceof CSSStyleRule) {
          const size = rule.style.getPropertyValue("font-size");
          // FullCalendar stores .85em in --fc-small-font-size. Inspect the
          // resolved unit so a doubled parent cannot double it a second time.
          const resolvedSize = size ? resolveSizeVariables(size, rule.selectorText) : "";
          const relative = /(?<!r)em\b|%|^(inherit|initial|unset|revert|revert-layer)$/i.test(resolvedSize);
          const rootRule = rule.selectorText.split(",").some(selector => ["html", ":root", ":host"].includes(selector.trim()));
          const priority = rule.style.getPropertyPriority("font-size");
          const declaration = size && !relative && !rootRule ? `font-size:calc((${size}) * 2)${priority ? " !important" : ""};` : "";
          if (declaration) declarations++;
          const children = rule.cssRules ? rules(rule.cssRules) : "";
          return declaration || children ? `${rule.selectorText}{${declaration}${children}}` : "";
        }
        if (rule.cssRules) { const children = rules(rule.cssRules); return children ? `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${children}}` : ""; }
        return "";
      }).join("\n");
      const styles = [...document.styleSheets].map(sheet => rules(sheet.cssRules)).join("\n");
      if (declarations < 10) throw new Error("Planning typography did not inspect the application's actual stylesheets");
      const bodySize = parseFloat(getComputedStyle(document.body).fontSize);
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`body{font-size:${bodySize * 2}px;}\n${styles}`);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      window.__planningStableText200 = { sheet, declarations };
    }
    const nodes = [root, ...root.querySelectorAll("*")].filter(node => node instanceof HTMLElement);
    return {
      declarations: window.__planningStableText200.declarations,
      normalCount: normal.length, currentCount: nodes.length,
      rows: normal.map((before, index) => {
        const node = nodes[index];
        return { ...before, expected: before.before * 2, after: node ? parseFloat(getComputedStyle(node).fontSize) : null, connected: Boolean(node?.isConnected), currentTag: node?.tagName, currentClass: node?.className };
      }),
    };
  }, baseline);
}
async function assertDoubledText(result, label, minimum) {
  const failed = result.rows.filter(node => !node.connected || node.tag !== node.currentTag || node.className !== node.currentClass || !Number.isFinite(node.after) || Math.abs(node.after - node.expected) >= .1);
  diagnostics.push({ label, ...result, failed });
  await writeFile(`${output}/diagnostics.json`, JSON.stringify(diagnostics, null, 2));
  assert.ok(result.normalCount > minimum && result.currentCount === result.normalCount && failed.length === 0, `${label}: every mounted node's actual text must double ${JSON.stringify({ normalCount: result.normalCount, currentCount: result.currentCount, failed })}`);
}
async function assertReadableDialog(dialog, label) {
  const geometry = await dialog.evaluate(root => {
    const rect = box => ({ x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom });
    const textGeometry = selector => {
      const element = root.querySelector(selector);
      if (!element) throw new Error(`Missing dialog typography element: ${selector}`);
      const style = getComputedStyle(element);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const fragments = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        fragments.push(...[...range.getClientRects()].filter(box => box.width > 0 && box.height > 0).map(rect));
      }
      // Inline children can produce several fragments for one visual line.
      // Merge only fragments on that same y; preserve distinct wrapped lines.
      const lines = [];
      for (const fragment of fragments.sort((a, b) => a.y - b.y || a.x - b.x)) {
        const line = lines.find(value => Math.abs(value.y - fragment.y) < .5);
        if (line) {
          line.x = Math.min(line.x, fragment.x); line.right = Math.max(line.right, fragment.right);
          line.bottom = Math.max(line.bottom, fragment.bottom);
          line.width = line.right - line.x; line.height = line.bottom - line.y;
        } else lines.push({ ...fragment });
      }
      const ancestors = [];
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const computed = getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
        const clips = value => ["hidden", "clip", "auto", "scroll"].includes(value);
        const viewport = ancestor === document.body || ancestor === document.documentElement;
        const x = viewport ? 0 : bounds.x + ancestor.clientLeft;
        const y = viewport ? 0 : bounds.y + ancestor.clientTop;
        const clipBounds = { x, y, right: viewport ? innerWidth : x + ancestor.clientWidth, bottom: viewport ? innerHeight : y + ancestor.clientHeight };
        const scrollsX = ["auto", "scroll"].includes(computed.overflowX), scrollsY = ["auto", "scroll"].includes(computed.overflowY);
        const visible = lines.every(line => (!clips(computed.overflowX) || (line.x >= x && line.right <= clipBounds.right)) && (!clips(computed.overflowY) || (line.y >= y && line.bottom <= clipBounds.bottom)));
        const reachable = lines.every(line => (!clips(computed.overflowX) || (scrollsX ? line.x + ancestor.scrollLeft >= x && line.right + ancestor.scrollLeft <= x + ancestor.scrollWidth : line.x >= x && line.right <= clipBounds.right)) && (!clips(computed.overflowY) || (scrollsY ? line.y + ancestor.scrollTop >= y && line.bottom + ancestor.scrollTop <= y + ancestor.scrollHeight : line.y >= y && line.bottom <= clipBounds.bottom)));
        ancestors.push({
          tag: ancestor.tagName, slot: ancestor.getAttribute("data-slot"), overflowX: computed.overflowX, overflowY: computed.overflowY,
          clipsX: clips(computed.overflowX), clipsY: clips(computed.overflowY), bounds: rect(bounds),
          clipBounds, visible, reachable,
          scrollTop: ancestor.scrollTop, scrollLeft: ancestor.scrollLeft, clientWidth: ancestor.clientWidth, clientHeight: ancestor.clientHeight, scrollWidth: ancestor.scrollWidth, scrollHeight: ancestor.scrollHeight,
        });
      }
      return { text: element.textContent, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), bounds: rect(element.getBoundingClientRect()), fragments, lines, ancestors };
    };
    return { viewport: { width: innerWidth, height: innerHeight }, title: textGeometry('[data-slot="dialog-title"]'), description: textGeometry('[data-slot="dialog-description"]') };
  });
  diagnostics.push({ label, ...geometry });
  await writeFile(`${output}/diagnostics.json`, JSON.stringify(diagnostics, null, 2));
  for (const name of ["title", "description"]) {
    const text = geometry[name];
    assert.ok(Number.isFinite(text.fontSize) && text.fontSize > 0 && text.lineHeight >= text.fontSize * 1.2, `${label}: ${name} has a readable computed line height`);
    assert.ok(text.lines.length > 0 && text.lines.every((line, index) => line.height > 0 && (!index || text.lines[index - 1].bottom <= line.y)), `${label}: ${name}'s actual wrapped text lines do not intersect`);
    // A Range includes font ascender/descender metrics, not just painted ink.
    // Overflow-visible line-height boxes are not clipping boundaries; test the
    // actual viewport and clipping ancestors instead of their nominal height.
    assert.ok(text.lines.every(line => line.y >= 0 && line.bottom <= geometry.viewport.height && line.x >= 0 && line.right <= geometry.viewport.width), `${label}: ${name}'s text is reachable in the viewport`);
    assert.ok(text.ancestors.every(ancestor => ancestor.reachable), `${label}: ${name}'s text is reachable within actual clipping or scrolling ancestors`);
    assert.ok(text.ancestors.every(ancestor => ancestor.visible), `${label}: ${name}'s heading text is currently visible without scrolling its clipping ancestors`);
  }
  assert.ok(geometry.title.bounds.bottom <= geometry.description.bounds.y, `${label}: title and description blocks do not overlap`);
  assert.ok(geometry.title.lines.every(line => line.bottom <= geometry.description.lines[0].y), `${label}: title and description actual text lines do not intersect`);
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
      await assertReadableDialog(dialog, `calendar-dialog-normal-readable-${width}`);
      const normalDialogSizes = await dialog.evaluate(node => ({ title: parseFloat(getComputedStyle(node.querySelector('[data-slot="dialog-title"]')).fontSize), cancel: parseFloat(getComputedStyle([...node.querySelectorAll("button")].find(button => button.textContent === "取消")).fontSize) }));
      const normalDialogText = await textBaseline(dialog);
      assert.ok((await dialog.innerText()).includes(task.title));
      assert.equal(await page.getByTestId("planning-preview-count").textContent(), "1");
      await dialog.getByRole("button", { name: "取消", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      await noOverflow(page, `calendar-${width}`);
      await page.screenshot({ path: `${output}/calendar-${width}.png`, fullPage: true });
      const normalCalendarSizes = await page.evaluate(() => ({ label: parseFloat(getComputedStyle(document.querySelector(".fc-timegrid-slot-label-cushion")).fontSize), event: parseFloat(getComputedStyle(document.querySelector(".fc-event-main p")).fontSize), schedule: parseFloat(getComputedStyle([...document.querySelectorAll("button")].find(button => button.textContent === "安排")).fontSize) }));
      const normalCalendarText = await textBaseline(page.getByTestId("planning-visual-fixture"));
      const scaledNodes = await doubleComputedText(page.getByTestId("planning-visual-fixture"), normalCalendarText);
      await assertDoubledText(scaledNodes, `calendar-computed-200-all-nodes-${width}`, 100);
      const enlargedCalendarSizes = await page.evaluate(() => ({ label: parseFloat(getComputedStyle(document.querySelector(".fc-timegrid-slot-label-cushion")).fontSize), event: parseFloat(getComputedStyle(document.querySelector(".fc-event-main p")).fontSize), schedule: parseFloat(getComputedStyle([...document.querySelectorAll("button")].find(button => button.textContent === "安排")).fontSize) }));
      for (const key of Object.keys(normalCalendarSizes)) assert.equal(enlargedCalendarSizes[key], normalCalendarSizes[key] * 2, `calendar ${key} actually doubles at ${width}px`);
      await page.waitForFunction(() => {
        const label = document.querySelector(".fc-timegrid-slot-label-cushion");
        const cell = label?.closest("td");
        if (!label || !cell) return false;
        const text = label.getBoundingClientRect(), column = cell.getBoundingClientRect();
        return text.left >= column.left - 1 && text.right <= column.right + 1;
      });
      const enlargedGeometry = await page.evaluate(() => {
        const label = document.querySelector(".fc-timegrid-slot-label-cushion"), cell = label.closest("td");
        return { axisWidth: cell.getBoundingClientRect().width, labelWidth: label.getBoundingClientRect().width, events: [...document.querySelectorAll(".fc-event-main")].map(main => ({ height: main.getBoundingClientRect().height, paragraphs: [...main.querySelectorAll("p")].map(node => ({ top: node.getBoundingClientRect().top - main.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom - main.getBoundingClientRect().top, height: node.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(node).lineHeight) })) })) };
      });
      diagnostics.push({ label: `calendar-computed-200-readable-geometry-${width}`, ...enlargedGeometry });
      assert.ok(enlargedGeometry.axisWidth >= enlargedGeometry.labelWidth - 1, "the enlarged time label fits its remeasured axis");
      assert.ok(enlargedGeometry.events.length === 2 && enlargedGeometry.events.every(event => event.paragraphs.length === 2 && event.paragraphs.every(text => text.top >= -1 && text.bottom <= event.height + 1 && text.height >= text.lineHeight - 1)), "actual enlarged event titles and time ranges remain readable inside their remeasured events");
      await noOverflow(page, `calendar-computed-200-${width}`);
      const schedule = page.getByRole("button", { name: "安排", exact: true });
      await schedule.scrollIntoViewIfNeeded();
      const scheduleBox = await schedule.boundingBox();
      assert.ok(scheduleBox.width >= 44 && scheduleBox.height >= 44, "200% schedule retains a real touch target");
      await schedule.click(); await dialog.waitFor();
      const scaledDialog = await doubleComputedText(dialog, normalDialogText);
      await assertDoubledText(scaledDialog, `calendar-dynamic-dialog-computed-200-all-nodes-${width}`, 0);
      const enlargedDialogSizes = await dialog.evaluate(node => ({ title: parseFloat(getComputedStyle(node.querySelector('[data-slot="dialog-title"]')).fontSize), cancel: parseFloat(getComputedStyle([...node.querySelectorAll("button")].find(button => button.textContent === "取消")).fontSize) }));
      for (const key of Object.keys(normalDialogSizes)) assert.equal(enlargedDialogSizes[key], normalDialogSizes[key] * 2, `dynamic dialog ${key} actually doubles at ${width}px`);
      await assertReadableDialog(dialog, `calendar-dialog-computed-200-readable-${width}`);
      await noOverflow(page, `calendar-dialog-computed-200-${width}`);
      const cancel = dialog.getByRole("button", { name: "取消", exact: true });
      await cancel.scrollIntoViewIfNeeded();
      const cancelBox = await cancel.boundingBox();
      const cancelGeometry = await dialog.evaluate(node => {
        const button = [...node.querySelectorAll("button")].find(value => value.textContent === "取消");
        const rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }; };
        return { viewport: { width: innerWidth, height: innerHeight }, dialog: { ...rect(node), clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop, overflow: getComputedStyle(node).overflowY }, cancel: { ...rect(button), fontSize: getComputedStyle(button).fontSize, lineHeight: getComputedStyle(button).lineHeight }, range: { ...rect(node.querySelector('[data-testid="planning-preview-range"]')) } };
      });
      diagnostics.push({ label: `calendar-computed-200-cancel-geometry-${width}`, ...cancelGeometry });
      await writeFile(`${output}/diagnostics.json`, JSON.stringify(diagnostics, null, 2));
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
      const writes = await isolate(context, true); const page = await context.newPage(); activePage = page;
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
        assert.equal(await source.getAttribute("data-calendar-task-minutes"), "45", "drag uses a real known estimate; unknown tasks remain non-draggable");
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
