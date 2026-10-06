/* eslint-disable @typescript-eslint/no-require-imports -- Isolated synthetic Settings verification. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = "http://127.0.0.1:4183";
const output = "test-results/settings-workspace";
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const width of [360, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1050 }, reducedMotion: "reduce" });
      await context.route("**/*", route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(baseURL, { waitUntil: "networkidle" });
      assert.equal(await page.evaluate(() => window.fixtureCalls || 0), 0);
      assert.ok(await page.getByRole("heading", { name: "存储空间", exact: true }).isVisible());
      await page.getByRole("button", { name: "检查并统计用量", exact: true }).click();
      await page.getByText("合计：804.51 MiB", { exact: false }).waitFor();
      const budget = page.getByLabel("当前桶个人容量预算（GiB）");
      await budget.fill("2");
      await page.getByRole("meter").waitFor();
      assert.ok((await page.getByRole("meter").getAttribute("aria-valuetext")).includes("预算内余量"));
      assert.ok(await page.getByText("暂无法确认", { exact: true }).isVisible());
      await page.screenshot({ path: `${output}/storage-${width}.png`, fullPage: true });
      await page.getByRole("link", { name: /连接与同步/ }).click();
      assert.ok(await page.getByText("尚未验证自动同步", { exact: true }).isVisible());
      await page.getByText("日历", { exact: true }).click();
      assert.ok(await page.getByText("请检查同步记录。", { exact: true }).isVisible());
      await page.screenshot({ path: `${output}/connections-${width}.png`, fullPage: true });
      await page.getByRole("link", { name: /AI 与隐私/ }).click();
      await page.getByRole("button", { name: "调整设置", exact: true }).click();
      await page.getByRole("combobox").first().selectOption("deepseek-v4-pro");
      await page.getByRole("link", { name: /通用/ }).click();
      assert.ok(await page.getByRole("heading", { name: "快捷键", exact: true }).isVisible());
      await page.goBack();
      assert.equal(await page.getByRole("combobox").first().inputValue(), "deepseek-v4-pro");
      await page.getByRole("button", { name: "取消", exact: true }).click();
      await page.getByRole("link", { name: /存储空间/ }).click();
      assert.equal(await budget.inputValue(), "2");
      assert.equal(await page.evaluate(() => window.fixtureCalls), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow");
      for (const fixture of ["partial", "unavailable", "empty", "error"]) {
        await page.goto(`${baseURL}/?fixture=${fixture}`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "检查并统计用量", exact: true }).click();
        await page.getByLabel("当前桶个人容量预算（GiB）").fill("2");
        if (fixture === "partial" || fixture === "unavailable") assert.equal(await page.getByRole("meter").count(), 0);
        if (fixture === "partial") assert.ok((await page.locator("body").innerText()).includes("未完成，不是总量"));
        if (fixture === "empty") assert.equal(await page.getByRole("meter").getAttribute("aria-valuenow"), "0");
        if (fixture === "error") {
          await page.getByRole("button", { name: "检查并统计用量", exact: true }).click();
          assert.ok((await page.getByRole("alert").innerText()).includes("会话已失效"));
          assert.ok((await page.locator("body").innerText()).includes("上次连接检查"));
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      assert.deepEqual(errors, []);
      evidence.push({ width, syntheticOnly: true, noAutoScan: true, preservesDrafts: true, navigationHistory: true, partialUnknown: true, authFailureVisible: true, noOverflow: true, errors });
      await context.close();
    }
    await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
