/* eslint-disable @typescript-eslint/no-require-imports -- Isolated synthetic browser verification. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
assert.match(base, /^http:\/\/127\.0\.0\.1:/);
const output = "test-results/design-v2";
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, recordVideo: { dir: `${output}/video`, size: { width: Math.min(width, 1440), height: 900 } } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      // The opt-in fixtures receive no production credentials; no private APIs
      // or provider writes are needed to evaluate design and local interactions.
      await page.route("**/api/**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic offline boundary" }) }));
      await page.addInitScript(() => {
        window.__sceneTransitions = 0;
        const native = Document.prototype.startViewTransition;
        if (native) Document.prototype.startViewTransition = function (...args) { window.__sceneTransitions++; return native.apply(this, args); };
      });
      for (const scene of ["today-filled", "tasks", "calendar", "notes", "files", "career-filled", "projects"]) {
        await page.goto(`${base}/mobile-native-e2e?scene=${scene}`);
        await page.locator(".app-toolbar").waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${scene}: no horizontal overflow at ${width}`);
        await page.screenshot({ animations: "disabled", path: `${output}/${scene}-${width}.png`, fullPage: true });
      }
      const launcher = page.getByRole("button", { name: "新建项目", exact: true }).first();
      await launcher.click();
      await page.getByRole("dialog").waitFor();
      await page.screenshot({ animations: "disabled", path: `${output}/dialog-${width}.png` });
      await page.getByRole("button", { name: "取消", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.ok(await launcher.evaluate(node => node === document.activeElement), "closing restores the actual launcher");
      await launcher.click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.ok(await launcher.evaluate(node => node === document.activeElement), "Escape restores focus after reopening");
      await page.goto(`${base}/mobile-native-e2e?scene=leisure`);
      await page.locator('[data-fixture-ready="true"]').waitFor();
      const poster = page.locator('a[href*="&item="]').first();
      await poster.click();
      await page.locator('[data-edition]').waitFor();
      await page.screenshot({ animations: "disabled", path: `${output}/leisure-detail-${width}.png`, fullPage: true });
      const transitions = await page.evaluate(() => window.__sceneTransitions);
      assert.ok(transitions > 0, "App Router activates a native scene transition");
      await page.goBack();
      await page.locator('#leisure-collection-heading').waitFor();
      await page.screenshot({ animations: "disabled", path: `${output}/leisure-return-${width}.png` });
      const tokens = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return { accent: style.getPropertyValue("--accent").trim(), background: style.getPropertyValue("--surface-app").trim(), serif: style.getPropertyValue("--font-serif").trim() };
      });
      assert.equal(tokens.accent.toLowerCase(), "#37594b");
      assert.match(tokens.serif, /Songti SC/);
      assert.deepEqual(errors, []);
      evidence.push({ width, tokens, nativeTransitions: transitions, errors });
      await context.close();
    }
    const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await reduced.newPage();
    await page.goto(`${base}/mobile-native-e2e?scene=projects`);
    await page.getByRole("button", { name: "新建项目", exact: true }).first().click();
    assert.equal(await page.getByRole("dialog").evaluate(node => getComputedStyle(node).animationName), "none");
    await page.screenshot({ animations: "disabled", path: `${output}/reduced-motion.png` });
    await reduced.close();
    await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
    console.log("PASS: design v2 scenes, responsive geometry, dialogs, focus, native transitions and reduced motion (synthetic data).");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
