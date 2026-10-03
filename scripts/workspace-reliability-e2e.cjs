/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS browser-test entrypoint. */
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { chromium } = require("playwright");
const { jsPDF } = require("jspdf");

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const screenshotDir = process.env.E2E_SCREENSHOT_DIR;
const fixturePdf = new jsPDF();
fixturePdf.text("Synthetic PDF fixture - no personal data", 20, 20);
const pdfBytes = Buffer.from(fixturePdf.output("arraybuffer"));

async function capture(page, name) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [360, 390, 430, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      let pdfRequests = 0;
      await context.route("**/api/files/10000000-0000-4000-8000-000000000002/download?inline=1", (route) => {
        pdfRequests++;
        return route.fulfill({ status: 200, contentType: "application/pdf", body: pdfBytes });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${baseURL}/mobile-native-e2e?scene=files`, { waitUntil: "networkidle" });
      const section = page.locator(".files-workspace > section");
      assert.equal(await page.locator('.files-workspace li[id^="file-"]').count(), 80, "all files includes nested folders");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px Files has no horizontal overflow`);
      const listBox = await section.boundingBox();
      assert.ok(listBox && listBox.height >= 350, `${width}px file folders leave room for the file list`);
      const lastMenu = page.getByRole("button", { name: "操作 示例资料 80 · Synthetic fixture", exact: true });
      await lastMenu.scrollIntoViewIfNeeded();
      assert.ok(await section.evaluate((node) => node.scrollTop) > 0, "long file lists scroll internally");
      await lastMenu.click();
      const popover = page.locator(".files-actions-popover");
      await popover.waitFor({ state: "visible" });
      const menuBox = await popover.boundingBox();
      assert.ok(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= width + 1 && menuBox.y >= 0 && menuBox.y + menuBox.height <= 901, `${width}px bottom-row menu remains in view`);
      if (width < 768) {
        const button = await lastMenu.boundingBox();
        assert.ok(button.width >= 44 && button.height >= 44, "mobile file controls are touch sized");
        assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "INPUT", "mobile menu does not open the keyboard");
      }
      await capture(page, `files-menu-${width}`);
      if (width < 768) await page.evaluate(() => history.back());
      else await page.keyboard.press("Escape");
      await popover.waitFor({ state: "hidden" });
      await capture(page, `files-${width}`);

      await page.goto(`${baseURL}/mobile-native-e2e?scene=note-pdf`, { waitUntil: "networkidle" });
      const documentShell = page.locator(".notes-document-shell");
      const shellBox = await documentShell.boundingBox();
      const editorBox = await page.locator(".notes-editor-surface").boundingBox();
      assert.ok(shellBox && editorBox && editorBox.y + editorBox.height <= shellBox.y + shellBox.height + 1, `${width}px embedded editor fits below the PDF toolbar`);
      assert.equal(await page.locator("iframe").count(), 0, "reader loads only when first opened");
      await page.getByRole("button", { name: "PDF", exact: true }).click();
      const reader = page.locator('iframe[title="PDF 阅读器：示例 PDF"]');
      await reader.waitFor({ state: "visible" });
      await page.waitForFunction(() => document.querySelector('iframe[title="PDF 阅读器：示例 PDF"]')?.parentElement?.getAttribute("aria-busy") === "false");
      const readerBox = await reader.boundingBox();
      assert.ok(readerBox.height > 300, `${width}px PDF has usable reading height`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${width}px PDF has no horizontal overflow`);
      const beforeSwitch = pdfRequests;
      await page.getByRole("button", { name: "正文", exact: true }).click();
      await reader.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "PDF", exact: true }).click();
      await reader.waitFor({ state: "visible" });
      assert.equal(pdfRequests, beforeSwitch, "switching views preserves the existing PDF reader");
      await page.getByRole("button", { name: "重新加载 PDF", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('iframe[title="PDF 阅读器：示例 PDF"]')?.parentElement?.getAttribute("aria-busy") === "false");
      assert.equal(pdfRequests, beforeSwitch + 1, "explicit reload requests a fresh reader");
      await capture(page, `document-pdf-${width}`);
      assert.deepEqual(errors, [], `${width}px has no uncaught client errors`);
      await context.close();
      console.log(`workspace-reliability-e2e: ${width}px passed`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
