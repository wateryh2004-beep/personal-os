/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic CI-only browser verification. */
const assert = require("node:assert/strict");
const { mkdir, readdir, stat, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = "test-results/core-flows";
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const width of [360, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", hasTouch: width < 768, timezoneId: "Asia/Shanghai" });
      let writes = 0;
      await context.route("**/*", route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== new URL(baseURL).origin) return route.abort();
        if (req.method() !== "GET") { writes++; return route.abort(); }
        if (url.pathname === "/api/notes/list") return route.fulfill({ json: { notes: url.searchParams.get("folderId") === "fixture-child" ? [{ id: "fixture-note", title: "子文件夹里的示例笔记", excerpt: null, folder_id: "fixture-child", updated_at: "2026-10-06T00:00:00Z", pinned_at: null, content_origin: "manual" }] : [], hasMore: false } });
        if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
        if (req.headers()["next-router-prefetch"]) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const capture = async name => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
        await page.screenshot({ path: `${output}/${name}-${width}.png` });
      };
      await page.goto(`${baseURL}/mobile-native-e2e?scene=notes-folders`, { waitUntil: "networkidle" });
      const folders = page.getByRole("region", { name: "子文件夹", exact: true });
      await folders.getByRole("link").first().waitFor();
      await page.getByText("当前层级没有直接存放的笔记", { exact: true }).waitFor();
      assert.ok((await page.locator(".notes-list-workspace header").innerText()).includes("2 个子文件夹 · 当前层级 0 篇笔记"));
      const card = folders.getByRole("link").first();
      const box = await card.boundingBox(); assert.ok(box.height >= 44);
      await capture("notes-parent");
      await card.click();
      await page.getByRole("link", { name: "子文件夹里的示例笔记", exact: true }).waitFor();
      await capture("notes-child");
      await page.goBack();
      await page.getByText("当前层级没有直接存放的笔记", { exact: true }).waitFor();
      await page.goForward();
      await page.getByRole("navigation", { name: "文件夹路径" }).getByRole("link", { name: "示例知识与学习资料", exact: true }).click();
      await page.getByText("当前层级没有直接存放的笔记", { exact: true }).waitFor();
      await page.goto(`${baseURL}/mobile-native-e2e?scene=projects`, { waitUntil: "networkidle" });
      const projectLauncher = page.getByRole("button", { name: "新建项目", exact: true }).first();
      for (let i = 0; i < 2; i++) {
        await projectLauncher.click();
        const dialog = page.getByRole("dialog", { name: "新建项目", exact: true });
        await dialog.waitFor();
        if (!i) await capture("project-create");
        if (i === 0) await dialog.getByRole("button", { name: "取消", exact: true }).click();
        else await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.textContent?.includes("新建项目"));
        assert.equal(await projectLauncher.evaluate(node => node === document.activeElement), true, "Project cancellation restores launcher focus");
      }
      await page.goto(`${baseURL}/mobile-native-e2e?scene=tasks`, { waitUntil: "networkidle" });
      const taskLauncher = page.getByRole("button", { name: "新建任务", exact: true }).first();
      await taskLauncher.click();
      const taskDialog = page.getByRole("dialog", { name: "新建任务", exact: true });
      await taskDialog.waitFor(); await capture("task-create");
      await taskDialog.getByRole("button", { name: "取消", exact: true }).click();
      await taskDialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "新建任务");
      assert.equal(await taskLauncher.evaluate(node => node === document.activeElement), true, "Task cancellation restores launcher focus");
      await page.goto(`${baseURL}/mobile-native-e2e?scene=calendar-edit`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "编辑日程", exact: true }).click();
      const allDay = page.getByRole("checkbox", { name: "全天", exact: true });
      await allDay.check();
      await page.getByRole("button", { name: "取消", exact: true }).click();
      await page.getByRole("button", { name: "编辑日程", exact: true }).click();
      assert.equal(await allDay.isChecked(), false, "cancel must discard all-day draft");
      await capture("calendar-reopened");
      assert.equal(writes, 0, "cancel/navigation checks must not issue writes");
      assert.deepEqual(errors, []);
      evidence.push({ width, checks: ["parent-child-back-forward", "honest-direct-count", "long-folder-wrap", "project-repeat-cancel-focus", "task-cancel-focus", "calendar-discard-all-day"], writes });
      await context.close();
    }
    const files = await readdir(output);
    const bytes = (await Promise.all(files.map(async name => (await stat(`${output}/${name}`)).size))).reduce((a, b) => a + b, 0);
    assert.ok(bytes < 32 * 1024 * 1024);
    await writeFile(`${output}/evidence.json`, JSON.stringify({ evidence, bytes }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
