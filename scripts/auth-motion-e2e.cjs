/* eslint-disable @typescript-eslint/no-require-imports -- Isolated local auth fixture only. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3199";
assert.match(base, /^http:\/\/127\.0\.0\.1:/, "Only the local synthetic Auth server may receive credentials");
const output = "test-results/auth-motion";
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  let activePage;
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, recordVideo: { dir: `${output}/video`, size: { width: Math.min(width, 1000), height: 900 } } });
      const page = await context.newPage(); activePage = page; const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      // No user data queries: intercept only the protected destination after real local auth.
      await context.route(`${base}/today**`, route => route.fulfill({ body: "<!doctype html><h1>Synthetic Today</h1>", contentType: "text/html" }));
      const capture = async name => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow");
        await page.screenshot({ path: `${output}/${name}-${width}.png` });
      };
      await page.goto(`${base}/login`);
      await page.getByRole("heading", { name: "欢迎回来", exact: true }).waitFor();
      await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
      await page.getByLabel("密码", { exact: true }).fill("wrong-synthetic-password");
      await page.getByRole("button", { name: "显示密码", exact: true }).click();
      assert.equal(await page.getByLabel("密码", { exact: true }).getAttribute("type"), "text");
      await capture("login");
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await page.getByRole("alert").waitFor();
      await page.locator('[role="alert"]:focus').waitFor();
      assert.equal(await page.locator(".auth-success").count(), 0, "failed login must never play success");
      assert.equal(await page.getByLabel("邮箱", { exact: true }).inputValue(), "owner@example.com");
      await capture("login-error");
      await page.getByLabel("密码", { exact: true }).fill("synthetic-login-password");
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await page.locator(".auth-entering").waitFor();
      await capture("login-confirmed");
      await page.waitForURL(`${base}/today`);
      assert.ok((await context.cookies()).some(cookie => cookie.name.startsWith("sb-")), "real SDK persisted auth cookies before entry");
      await context.clearCookies();
      await page.goto(`${base}/forgot-password`);
      await page.getByLabel("第一个单词", { exact: true }).fill("alpha");
      await page.getByLabel("第二个单词", { exact: true }).fill("wrong");
      await capture("recovery-answer");
      await page.getByRole("button", { name: "继续设置密码", exact: true }).click();
      await page.locator('[name="password"]:focus').waitFor();
      await page.getByLabel("新密码", { exact: true }).fill("new-password-123");
      await page.getByLabel("确认新密码", { exact: true }).fill("new-password-123");
      await capture("recovery-password");
      await page.getByRole("button", { name: "验证答案并重置密码", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.equal(await page.locator(".auth-success").count(), 0);
      await page.getByRole("button", { name: "修改答案" }).click();
      assert.equal(await page.getByLabel("第一个单词", { exact: true }).inputValue(), "alpha", "failed action retains entered answers");
      await page.getByLabel("第二个单词", { exact: true }).fill("BeTa");
      assert.equal(await page.getByLabel("第二个单词", { exact: true }).inputValue(), "BeTa");
      await page.getByRole("button", { name: "继续设置密码", exact: true }).click();
      await page.getByLabel("新密码", { exact: true }).fill("new-password-123");
      await page.getByLabel("确认新密码", { exact: true }).fill("new-password-123");
      assert.equal(await page.locator('[name="secondWord"]').inputValue(), "BeTa", "step transition retains the corrected controlled answer");
      await page.getByRole("button", { name: "验证答案并重置密码", exact: true }).click();
      await page.getByRole("heading", { name: "密码已更新", exact: true }).waitFor();
      await capture("recovery-success");
      assert.equal(await page.locator('[name="firstWord"]').count(), 0, "successful recovery unmounts secret fields");
      assert.deepEqual(errors, []);
      evidence.push({ width, login: "verified SDK cookie → confirmed animation → Today", recovery: "two steps → error → retained answers → verified success", errors });
      await context.close();
    }
    const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await reduced.newPage();
    await page.goto(`${base}/login`);
    assert.equal(await page.locator(".auth-card").evaluate(node => getComputedStyle(node).animationName), "none");
    await page.screenshot({ path: `${output}/reduced-motion.png` });
    await reduced.close();
    await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
    console.log("PASS: auth motion browser flows, mobile/desktop, errors, success timing, SDK cookies, reduced motion; synthetic local services only.");
  } catch (error) {
    await activePage?.screenshot({ path: `${output}/failure.png` });
    await writeFile(`${output}/failure.json`, JSON.stringify({ message: error.message, focus: await activePage?.evaluate(() => ({ tag: document.activeElement?.tagName, name: document.activeElement?.getAttribute("name"), role: document.activeElement?.getAttribute("role") })) }, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
