/* eslint-disable @typescript-eslint/no-require-imports -- Node-only isolated Chromium runner. */
/* Browser regression against gated synthetic fixture only. No account data/writes. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { mkdir, writeFile } = require("node:fs/promises");

const base = process.env.E2E_BASE_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/, "Synthetic localhost only");
const out = "test-results/markdown-tables";

(async () => {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", route => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.origin !== base || !["GET", "HEAD"].includes(req.method())) return route.abort();
        if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Synthetic read unavailable" } });
        return route.continue();
      });
      try {
        await page.goto(base + "/mobile-native-e2e?scene=markdown-table");
        await page.getByTestId("markdown-table-fixture").waitFor();
        const tables = page.locator(".cm-note-table-widget");
        await page.waitForFunction(() => document.querySelectorAll(".cm-note-table-widget").length === 2);
        assert.equal(await tables.count(), 2, "both valid and malformed Markdown tables render inline");
        assert.equal(await tables.first().locator("thead th").count(), 3);
        assert.equal(await tables.nth(1).locator("thead th").count(), 3, "ragged header expands for extra data column");
        assert.equal(await tables.nth(1).locator(".cm-note-table-hint").count(), 1, "malformed table has non-destructive recovery hint");
        const source = page.getByTestId("markdown-source");
        assert.ok((await source.textContent()).includes("| 项目 | 指标 |\n| 一 |"), "opening a note does not auto-rewrite invalid Markdown");

        const grade = tables.first().locator("input[data-row='0'][data-column='1']");
        await grade.fill("96");
        await page.waitForFunction(() => document.querySelector('[data-testid="markdown-source"]')?.textContent?.includes("| 甲 | 96 |"));
        assert.equal(await grade.inputValue(), "96");
        assert.ok((await source.textContent()).includes("| :--- | ---: | :---: |"), "valid table retains existing alignment");

        const malformedCell = tables.nth(1).locator("input[data-row='0'][data-column='1']");
        await malformedCell.fill("7|8");
        await page.waitForFunction(() => document.querySelector('[data-testid="markdown-source"]')?.textContent?.includes("7\\|8"));
        assert.ok((await source.textContent()).includes("| --- | --- | --- |"), "first edit repairs malformed table for portable GFM");
        assert.equal(await tables.nth(1).locator(".cm-note-table-hint").count(), 0);

        await tables.first().getByRole("button", { name: "添加行" }).click();
        await page.waitForFunction(() => document.querySelectorAll(".cm-note-table-widget")[0]?.querySelectorAll("tbody tr").length === 3);
        assert.equal(await tables.first().locator("tbody tr").count(), 3);
        await tables.first().getByRole("button", { name: "删除末行" }).click();
        assert.equal(await tables.first().locator("tbody tr").count(), 2, "row deletion is immediate");
        await tables.first().locator('select[aria-label="第 2 列对齐"]').selectOption("center");
        await page.waitForFunction(() => document.querySelector('[data-testid="markdown-source"]')?.textContent?.includes("| :--- | :---: | :---: |"));
        await tables.first().getByRole("button", { name: "添加列" }).click();
        assert.equal(await tables.first().locator("thead th").count(), 4);
        await tables.first().getByRole("button", { name: "删除末列" }).click();
        assert.equal(await tables.first().locator("thead th").count(), 3);
        const gridPasted = await page.evaluate(() => {
          const input = document.querySelector('.cm-note-table-widget input[data-row="0"][data-column="0"]');
          if (!input) return false;
          const data = new DataTransfer();
          data.setData("text/plain", "新\t88\n丙\t90");
          const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data });
          input.dispatchEvent(event);
          return event.defaultPrevented;
        });
        assert.equal(gridPasted, true, "multi-cell TSV paste is handled by the visual table");
        await page.waitForFunction(() => document.querySelector('[data-testid="markdown-source"]')?.textContent?.includes("| 新 | 88 |"));
        await tables.first().getByRole("button", { name: "编辑 Markdown 源码" }).click();
        await page.waitForFunction(() => document.querySelector(".cm-note-table-widget[aria-label='Markdown 表格即时预览']"));
        assert.equal(await page.locator(".cm-note-table-widget[aria-label='Markdown 表格即时预览']").count(), 1);
        await page.getByRole("button", { name: "完成源码编辑" }).click();
        await page.waitForFunction(() => document.querySelectorAll(".cm-note-table-widget[aria-label='可编辑 Markdown 表格']").length === 2);
        assert.ok(await page.locator(".cm-note-table-widget").first().isVisible());
        const geo = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          gridScrollWidth: document.querySelector(".cm-note-table-scroll")?.scrollWidth,
        }));
        assert.ok(geo.documentWidth <= geo.viewportWidth + 1, "table remains inside editor width");
        assert.deepEqual(errors, [], "no JS exceptions");
        await page.screenshot({ path: out + "/table-" + width + ".png" });
        results.push({ width, grids: 2, edited: true, repaired: true, rowAdded: true, sourceToggle: true, geometry: geo });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await writeFile(out + "/evidence.json", JSON.stringify(results, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
