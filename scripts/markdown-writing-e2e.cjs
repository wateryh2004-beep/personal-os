/* eslint-disable @typescript-eslint/no-require-imports -- Node synthetic browser fixture. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const base = process.env.E2E_BASE_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/, "isolated localhost only");
const output = "test-results/markdown-writing";

(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 850 },
        recordVideo: { dir: output, size: { width: Math.min(width, 1100), height: 850 } },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== base || !["GET", "HEAD"].includes(req.method())) return route.abort();
        if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Synthetic offline boundary" } });
        return route.continue();
      });
      try {
        await page.goto(base + "/mobile-native-e2e?scene=markdown-writing");
        await page.getByTestId("markdown-writing-fixture").waitFor();
        const source = page.getByTestId("markdown-writing-source");
        const editor = page.locator('.cm-content[contenteditable="true"]');
        await editor.waitFor();
        const image = page.locator(".cm-note-image-preview").first();
        await image.waitFor();
        const original = await source.textContent();

        await page.getByRole("button", { name: "目录", exact: true }).click();
        const outline = page.locator('[aria-label="笔记目录"]');
        await outline.getByRole("button", { name: "折叠章节：第一章" }).click();
        await page.locator(".cm-foldPlaceholder").first().waitFor();
        assert.equal(await source.textContent(), original, "folding does not modify Markdown");
        await outline.getByRole("button", { name: "展开章节：第一章" }).click();
        await page.waitForFunction(() => !document.querySelector(".cm-foldPlaceholder"));
        assert.equal(await source.textContent(), original, "unfolding does not modify Markdown");
        await outline.getByRole("button", { name: "关闭目录" }).click();

        await image.getByRole("button", { name: "调整图片" }).click();
        await image.getByRole("textbox", { name: "替代文字" }).fill("新的图片替代文字");
        await image.getByRole("textbox", { name: "图片说明" }).fill("更新后的图片说明");
        await image.getByRole("button", { name: "保存图片属性" }).click();
        await page.waitForFunction(() => document.querySelector('[data-testid="markdown-writing-source"]')?.textContent?.includes('![新的图片替代文字](/favicon.ico "更新后的图片说明")'));

        const line = page.locator(".cm-content .cm-line").filter({ hasText: "这是一段可以选中并格式化的正文。" }).first();
        await line.click();
        await editor.press("Home");
        await editor.press("Shift+End");
        const toolbar = page.getByRole("toolbar", { name: "选区快捷格式" });
        await toolbar.waitFor();
        await toolbar.getByRole("button", { name: "粗体" }).click();
        await page.waitForFunction(() => document.querySelector('[data-testid="markdown-writing-source"]')?.textContent?.includes("**这是一段可以选中并格式化的正文。**"));

        await editor.focus();
        await editor.press("Control+End");
        await editor.press("Enter");
        await page.keyboard.type("/h2");
        await page.locator(".cm-completionLabel").filter({ hasText: "标题 2" }).first().waitFor();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => {
          const source = document.querySelector('[data-testid="markdown-writing-source"]')?.textContent ?? "";
          return source.endsWith("## ") && !source.endsWith("/h2");
        });
        await page.keyboard.type("快捷插入的章节");
        await page.waitForFunction(() => document.querySelector('[data-testid="markdown-writing-source"]')?.textContent?.includes("## 快捷插入的章节"));

        if (width < 768) {
          await page.getByRole("button", { name: "更多格式工具" }).click();
          await page.getByRole("menuitem", { name: "任务列表" }).waitFor();
          await page.keyboard.press("Escape");
        }
        await editor.focus();
        await editor.press("Control+End");
        await editor.press("Enter");
        await page.keyboard.type("/AI");
        await page.locator(".cm-completionLabel").filter({ hasText: "AI 助手" }).first().waitFor();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector('[data-testid="markdown-writing-ai-count"]')?.textContent === "1");

        const bounds = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(bounds.document <= bounds.viewport + 1, "no root horizontal overflow");
        assert.deepEqual(errors, []);
        await page.screenshot({ path: output + "/writing-" + width + ".png" });
        report.push({ width, selection: true, slash: true, image: true, fold: true, bounds });
      } finally { await context.close(); }
    }
    console.log("PASS: Markdown Phase 3 writing interactions");
  } finally {
    await browser.close();
    await writeFile(output + "/evidence.json", JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
