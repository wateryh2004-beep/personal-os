/* eslint-disable @typescript-eslint/no-require-imports -- Gated synthetic CI-only UI checks. */
const assert = require("node:assert/strict");
const { mkdir, readdir, stat, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.E2E_AFFORDANCE_SCREENSHOT_DIR || "test-results/affordance";

(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: "reduce", hasTouch: width < 768 });
      // The fixture must never read or write a user's data, including prefetches.
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(baseURL).origin) return route.abort();
        if (route.request().method() !== "GET" || url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
        if (route.request().headers().rsc || route.request().headers()["next-router-prefetch"]) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const capture = async name => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
        await page.screenshot({ path: `${output}/${name}-${width}.png` });
      };
      await page.goto(`${baseURL}/mobile-native-e2e?scene=today-hierarchy&mode=tomorrow`, { waitUntil: "networkidle" });
      const choose = page.getByRole("button", { name: "选择重点", exact: true });
      await choose.waitFor();
      assert.equal(await choose.innerText(), "选择重点");
      const chooseBox = await choose.boundingBox();
      assert.ok(chooseBox.height >= 44);
      const more = page.getByTestId("today-future-more").getByRole("button");
      assert.ok(!(await more.innerText()).includes("+"));
      assert.ok((await more.innerText()).includes("展开"));
      await more.focus(); await page.keyboard.press("Enter");
      assert.equal(await more.getAttribute("aria-expanded"), "true");
      assert.ok((await more.innerText()).includes("收起"));
      await page.keyboard.press("Space");
      assert.equal(await more.getAttribute("aria-expanded"), "false");
      await choose.focus(); await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "选择今日重点" });
      await dialog.waitFor(); await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.matches('[aria-label="选择重点"][aria-expanded="false"]'));
      assert.equal(await choose.evaluate(node => node === document.activeElement), true);
      await capture("today");
      if (width === 390) {
        await page.emulateMedia({ colorScheme: "dark" });
        await choose.hover();
        const colors = await choose.evaluate(node => { const style = getComputedStyle(node); return { foreground: style.color, background: style.backgroundColor }; });
        assert.notEqual(colors.background, "rgb(234, 236, 235)", "dark controls must not inherit the light hover surface");
        evidence.push({ test: "today-dark-hover", colors });
        await capture("today-dark");
        await page.emulateMedia({ colorScheme: "light" });
        await page.goto(`${baseURL}/mobile-native-e2e?scene=today-hierarchy&mode=long`, { waitUntil: "networkidle" });
        await page.addStyleTag({ content: "html { font-size:200%!important }" });
        await capture("today-long-200");
      }
      for (const scene of ["tasks", "notes"]) {
        await page.goto(`${baseURL}/mobile-native-e2e?scene=${scene}`, { waitUntil: "networkidle" });
        const menus = page.locator(".ui-more-action");
        await menus.first().waitFor();
        await page.mouse.move(0, 0);
        for (const menu of await menus.all()) {
          const appearance = await menu.evaluate(node => { const s = getComputedStyle(node); return { opacity: Number(s.opacity), display: s.display }; });
          assert.equal(appearance.opacity, 1, `${scene}: menu hidden at rest`);
          assert.notEqual(appearance.display, "none");
          if (width < 768) { const bounds = await menu.boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44); }
        }
        await capture(scene);
      }
      await page.goto(`${baseURL}/mobile-native-e2e?scene=interview-reading`, { waitUntil: "networkidle" });
      const filters = page.getByTestId("interview-filters");
      await filters.locator("summary").click();
      await filters.getByLabel("提问风格", { exact: true }).selectOption("stress");
      if (await filters.evaluate(node => node.open)) await filters.locator("summary").click();
      const active = page.getByLabel("已生效的题库筛选", { exact: true });
      await active.waitFor();
      assert.ok((await active.innerText()).includes("压力追问"));
      await active.getByRole("button", { name: "清除筛选", exact: true }).click();
      await active.waitFor({ state: "hidden" });
      const input = page.getByLabel("搜索题库", { exact: true });
      const border = await input.evaluate(node => getComputedStyle(node).borderTopColor);
      assert.equal(border, "rgb(129, 139, 133)", "control boundary survives Tailwind cascade");
      await capture("interview");
      assert.deepEqual(errors, []);
      await context.close();
    }
    const files = await readdir(output);
    let bytes = 0;
    for (const file of files) bytes += (await stat(`${output}/${file}`)).size;
    assert.ok(bytes < 32 * 1024 * 1024, `Focused artifacts exceed 32 MiB: ${bytes}`);
    await writeFile(`${output}/evidence.json`, JSON.stringify({ files: files.length, bytes, evidence }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
