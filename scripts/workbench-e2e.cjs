/* Remote CI browser verification only. Local browser work must use CUA. */
(async () => {
  const { createRequire } = await import("node:module");
  const playwrightModule = await import(createRequire(__filename).resolve("playwright"));
  const { chromium } = playwrightModule.default ?? playwrightModule;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const base = process.env.WORKBENCH_E2E_BASE_URL;
  if (!base) throw new Error("WORKBENCH_E2E_BASE_URL must name an isolated E2E_MOBILE_HARNESS deployment");
  const output = path.resolve("test-results/workbench");
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  const contexts = [];
  let runFailure;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: path.join(output, "video") } });
    contexts.push(context);
    const fixtureModule = await import("./fixtures/pdf-cover-fixtures.cjs");
    const pdfBytes = (fixtureModule.default ?? fixtureModule).syntheticPdf();
    const pdfId = "70000000-0000-4000-8000-000000000001";
    const sourceVersion = "71000000-0000-4000-8000-000000000001";
    const isolatedTransport = async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.pathname === `/api/files/${pdfId}/preview` && ["GET", "HEAD"].includes(request.method())) {
        const headers = { "Content-Type": "application/pdf", "Content-Length": String(pdfBytes.length), "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Reading-Source-Version": sourceVersion, ETag: '\"synthetic-workbench-v1\"' };
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers().range ?? "");
        if (range && request.method() === "GET") {
          const start = Number(range[1]); const end = Math.min(pdfBytes.length - 1, range[2] ? Number(range[2]) : pdfBytes.length - 1);
          const body = pdfBytes.subarray(start, end + 1); headers["Content-Range"] = `bytes ${start}-${end}/${pdfBytes.length}`; headers["Content-Length"] = String(body.length);
          return route.fulfill({ status: 206, headers, body });
        }
        return route.fulfill({ status: 200, headers, body: request.method() === "HEAD" ? Buffer.alloc(0) : pdfBytes });
      }
      if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Isolated synthetic transport blocks live APIs and all writes" }) });
      return route.continue();
    };
    const page = await context.newPage();
    await page.route("**/*", isolatedTransport);
    const assertNoRootOverflow = async (label) => { if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`root overflow: ${label}`); };
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/mobile-native-e2e?scene=workbench`);
    await page.getByTestId("workbench-fixture").waitFor();
    const record = page.locator('[data-workbench-record^="shopping:"]').first();
    await record.focus(); await page.keyboard.press("Space");
    await page.getByRole("dialog").getByRole("heading", { name: "速览", exact: true }).waitFor();
    await page.keyboard.press("ArrowDown");
    await page.getByRole("dialog").getByRole("heading", { name: "合成采购候选 2", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(node => node === document.activeElement, await record.elementHandle());
    if (!await record.evaluate(node => node === document.activeElement)) throw new Error("quicklook did not return focus");
    await page.getByRole("checkbox", { name: "选择 合成采购候选 1", exact: true }).check();
    await page.getByRole("checkbox", { name: "选择 合成采购候选 2", exact: true }).check();
    await page.locator(".workbench-selection-bar").getByRole("button", { name: "比较", exact: true }).click();
    await page.getByRole("dialog").getByRole("heading", { name: "并排比较", exact: true }).waitFor();
    await page.getByRole("cell", { name: "20.25", exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "comparison.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await page.locator(".workbench-selection-bar").getByRole("button", { name: "取消选择", exact: true }).click();
    const referenceRecord = page.locator('[data-workbench-record^="note:"]').first();
    await referenceRecord.getByRole("button", { name: /更多操作/ }).click();
    await page.getByRole("menuitem", { name: "放到参考区" }).click();
    await page.getByRole("complementary", { name: "参考区" }).getByRole("heading", { name: /长文练习 2/ }).waitFor();
    await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
    await page.locator(".cm-editor").nth(1).waitFor();
    const primaryContent = page.locator(".workbench-main-pane .cm-content").first();
    await primaryContent.click(); await page.keyboard.press("ControlOrMeta+Home"); await page.keyboard.insertText("合成草稿保留验证\n");
    await page.getByText("保存失败", { exact: false }).first().waitFor();
    if (!await primaryContent.textContent().then(text => text.includes("合成草稿保留验证"))) throw new Error("failed save discarded the draft");
    const duplicateIds = await page.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map(node => node.id); return ids.filter((id,index) => ids.indexOf(id) !== index); });
    if (duplicateIds.length) throw new Error(`duplicate ids: ${duplicateIds.join(",")}`);
    const originalEditor = await page.locator(".workbench-main-pane .cm-editor").elementHandle();
    await page.getByRole("button", { name: "交换位置", exact: true }).click();
    if (!await originalEditor.evaluate(node => node.isConnected)) throw new Error("swap unmounted the primary editor");
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      for (const pane of width < 768 ? ["主区", "参考区"] : [null]) {
        if (pane) await page.getByRole("button", { name: pane, exact: true }).click();
        await assertNoRootOverflow(`${width}/${pane ?? "both"}`);
        await page.screenshot({ path: path.join(output, `workbench-${width}-${pane ?? "both"}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 560 });
    await page.getByRole("button", { name: "主区", exact: true }).click();
    await page.screenshot({ path: path.join(output, "short-screen.png"), fullPage: true });
    // Actual computed text sizes doubled. This is text scaling, separate from viewport tests.
    await page.evaluate(() => {
      const elements = [...document.querySelectorAll("body *")];
      const sizes = elements.map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
      for (const [node, size] of sizes) if (node instanceof HTMLElement && Number.isFinite(size)) node.style.setProperty("font-size", `${size * 2}px`, "important");
    });
    await assertNoRootOverflow("200% text/main");
    await page.getByRole("button", { name: "参考区", exact: true }).click(); await assertNoRootOverflow("200% text/reference");
    await page.getByRole("button", { name: "主区", exact: true }).click();
    await page.getByRole("button", { name: "速览 合成采购候选 1", exact: true }).click();
    const enlargedPreview = page.getByRole("dialog");
    await enlargedPreview.getByRole("button", { name: "关闭", exact: true }).click();
    await enlargedPreview.waitFor({ state: "hidden" });
    if (await page.getByRole("dialog").count()) throw new Error("200% preview close unreachable");
    await page.screenshot({ path: path.join(output, "text-200-percent.png"), fullPage: true });
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.getByRole("button", { name: "交换位置", exact: true }).click();
    await page.getByRole("button", { name: "关闭参考区", exact: true }).click();
    await referenceRecord.getByRole("button", { name: /更多操作/ }).click(); await page.getByRole("menuitem", { name: "放到参考区" }).click();
    await page.getByRole("complementary", { name: "参考区" }).waitFor(); await assertNoRootOverflow("reduced motion reopen");
    await page.screenshot({ path: path.join(output, "workbench-accessibility.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/mobile-native-e2e?scene=workbench-pdf`);
    const mainPdf = page.locator(".workbench-main-pane");
    await mainPdf.locator('canvas[data-pdf-rendered="true"]').waitFor();
    await mainPdf.getByRole("button", { name: "下一页", exact: true }).click();
    await mainPdf.locator('canvas[data-pdf-rendered="true"][data-pdf-page="2"]').waitFor();
    const capturePosition = page.getByRole("button", { name: "捕获数值位置", exact: true });
    await capturePosition.scrollIntoViewIfNeeded();
    const hitTarget = await capturePosition.evaluate((button) => { const bounds = button.getBoundingClientRect(); const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2); return hit === button || button.contains(hit); });
    if (!hitTarget) throw new Error("PDF escaped its allocated pane and covered the next control");
    await capturePosition.click();
    const capturedNumeric = page.getByTestId("workbench-captured-position").filter({ hasText: "pdfPage" });
    await capturedNumeric.waitFor();
    const numeric = JSON.parse(await capturedNumeric.textContent());
    if (numeric.pdfPage !== 2 || numeric.pdfSourceVersion !== sourceVersion || numeric.pdfDocumentId !== pdfId) throw new Error("main PDF scene source/page capture mismatch");
    const pdfReference = page.locator('[data-workbench-record^="document:"]').first();
    await pdfReference.getByRole("button", { name: /更多操作/ }).click(); await page.getByRole("menuitem", { name: "放到参考区" }).click();
    await page.locator('.workbench-reference-pane canvas[data-pdf-rendered="true"]').waitFor();
    await page.getByRole("button", { name: "主区", exact: true }).click();
    await mainPdf.locator('canvas[data-pdf-rendered="true"][data-pdf-page="2"]').waitFor();
    await page.getByRole("button", { name: "参考区", exact: true }).click();
    await page.locator('.workbench-reference-pane canvas[data-pdf-rendered="true"]').waitFor();
    if (await page.locator('.workbench-reference-pane [role="alert"]').count()) throw new Error("resumed PDF reports destroyed-proxy failure");
    await page.screenshot({ path: path.join(output, "pdf-main-reference-source.png"), fullPage: true });
    await page.goto(`${base}/mobile-native-e2e?scene=life-workbench&workspace=shopping&mode=field`);
    await page.getByTestId("life-workbench-fixture").waitFor();
    const oatsSummary = page.locator("summary").filter({ hasText: "合成采购 · 燕麦" });
    if (!(await oatsSummary.textContent()).includes("3 条记录，分别核对 · 展开")) throw new Error("same-name purchase records were merged or miscounted");
    await oatsSummary.click();
    const oatsGroup = oatsSummary.locator("..");
    if (await oatsGroup.locator("[data-shopping-record]").count() !== 3) throw new Error("expanded group lost an independent purchase record");
    await oatsGroup.getByRole("button", { name: /2 袋.*修改/ }).waitFor();
    await oatsGroup.getByRole("button", { name: /数量未记录.*修改/ }).waitFor();
    await oatsGroup.getByRole("button", { name: /2\.125 千克.*修改/ }).click();
    await page.getByRole("textbox", { name: "数量", exact: true }).fill("3.125");
    await page.getByRole("button", { name: "预览修改", exact: true }).click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await oatsGroup.getByRole("button", { name: /2\.125 千克.*修改/ }).waitFor();
    await oatsGroup.getByRole("button", { name: /2 袋.*修改/ }).waitFor();
    await oatsGroup.getByRole("button", { name: /数量未记录.*修改/ }).waitFor();
    await page.screenshot({ path: path.join(output, "shopping-cancel.png"), fullPage: true });
    await page.goto(`${base}/mobile-native-e2e?scene=life-workbench&workspace=travel&mode=field`);
    await page.getByTestId("life-workbench-fixture").waitFor();
    await page.getByRole("heading", { name: "合成旅行现场", exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "travel-field.png"), fullPage: true });
    await page.goto(`${base}/mobile-native-e2e?scene=life-workbench&workspace=leisure&mode=field`);
    await page.getByTestId("life-workbench-fixture").waitFor();
    await page.screenshot({ path: path.join(output, "leisure-progress.png"), fullPage: true });
    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    contexts.push(touch);
    const touchPage = await touch.newPage();
    await touchPage.route("**/*", isolatedTransport);
    await touchPage.goto(`${base}/mobile-native-e2e?scene=workbench`);
    await touchPage.getByTestId("workbench-fixture").waitFor();
    await touchPage.getByRole("button", { name: "速览 合成采购候选 1", exact: true }).tap();
    await touchPage.getByRole("dialog").getByRole("heading", { name: "速览", exact: true }).waitFor();
    await touchPage.screenshot({ path: path.join(output, "touch-quicklook.png"), fullPage: true });
    if (errors.length) throw new Error(errors.join("\n"));
  } catch (error) {
    runFailure = { error };
  } finally {
    // Context closure flushes recorded video even when a flow assertion fails.
    const results = await Promise.allSettled(contexts.map(context => context.close()));
    results.push(...await Promise.allSettled([browser.close()]));
    const cleanupFailure = results.find(result => result.status === "rejected");
    if (!runFailure && cleanupFailure) runFailure = { error: cleanupFailure.reason };
  }
  if (runFailure) throw runFailure.error;
})();
