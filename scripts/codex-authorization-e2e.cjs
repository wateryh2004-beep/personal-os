/* eslint-disable @typescript-eslint/no-require-imports -- Node browser QA entrypoint */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { mkdir } = require("node:fs/promises");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    const headerContext = await browser.newContext();
    for (const path of ["/login", "/settings/connections/codex", "/settings/connections/codex/authorize", "/api/oauth/authorize"]) {
      const response = await headerContext.request.get(`${baseURL}${path}`, { maxRedirects: 0 });
      assert.equal(response.headers()["x-frame-options"], "DENY", `${path} denies framing`);
      assert.ok(response.headers()["content-security-policy"]?.includes("frame-ancestors 'none'"), `${path} has CSP anti-framing`);
    }
    await headerContext.close();
    for (const width of [360, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 768, hasTouch: width < 768 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let actualSubmissions = 0;
      await page.route("**/api/oauth/**", async (route) => { actualSubmissions++; await route.abort(); });
      for (const scene of ["codex-consent", "codex-grants", "codex-expired", "codex-unavailable"]) {
        await page.goto(`${baseURL}/mobile-native-e2e?scene=${scene}`, { waitUntil: "networkidle" });
        await page.getByTestId("codex-authorization-fixture").waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${scene} ${width}px overflows`);
        if (scene === "codex-consent") {
          const consent = page.getByTestId("codex-consent-view");
          assert.equal(await consent.locator('input[name="scope"]').count(), 4);
          const write = consent.locator('input[name="scope"][value="notes:write"]');
          await write.uncheck();
          assert.equal(await write.isChecked(), false);
          assert.equal(await consent.locator('input[name="scope"]:checked').count(), 3);
          const allow = consent.locator('button[name="decision"][value="approve"]');
          const box = await allow.boundingBox();
          assert.ok(box && box.height >= 44);
          assert.ok((await consent.innerText()).includes("1 小时"));
          await allow.click();
          assert.equal(actualSubmissions, 0, "synthetic fixture cannot create a real grant");
        } else if (scene === "codex-grants") {
          const grants = page.getByTestId("codex-authorizations-view");
          assert.equal(await grants.getByRole("button", { name: "撤销这次授权", exact: true }).count(), 1);
          assert.ok((await grants.innerText()).includes("已过期"));
          assert.ok((await grants.innerText()).includes("已撤销"));
        } else {
          assert.equal(await page.getByTestId("codex-consent-view").locator("form").count(), 0, "invalid state must not offer approval");
        }
        if (process.env.E2E_SCREENSHOT_DIR) {
          await mkdir(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/${scene}-${width}.png`, fullPage: true });
        }
      }
      assert.deepEqual(errors, []);
      assert.equal(actualSubmissions, 0);
      await context.close();
    }
    console.log("codex-authorization-e2e: synthetic consent and revoke UI mobile/desktop passed; no grants submitted");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
