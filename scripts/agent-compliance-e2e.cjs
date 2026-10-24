/* eslint-disable @typescript-eslint/no-require-imports -- Isolated synthetic browser verification. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3124";
const output = process.env.E2E_COMPLIANCE_OUTPUT || "test-results/agent-compliance";
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
  const evidence = [];
  try {
    for (const width of [390,1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, reducedMotion: "reduce", recordVideo: { dir: output, size: { width, height: 900 } } });
      let posts = 0;
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(base).origin) return route.abort();
        if (request.method() === "POST") {
          assert.ok(request.headers()["next-action"], "only a synthetic server-action request is expected");
          assert.ok(request.postData().includes("10000000-0000-4000-8000-000000000001"), "source action must carry the entity UUID");
          posts++;
          if (posts === 1) return route.fulfill({ status: 503, contentType: "text/plain", body: "Synthetic offline" });
          return route.fulfill({ status: 200, contentType: "text/x-component", body: '0:{"a":"$@1","f":[],"b":"synthetic"}\n1:"$undefined"\n' });
        }
        if (request.method() !== "GET" || url.pathname.startsWith("/api/") || request.headers()["next-router-prefetch"]) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      await page.goto(`${base}/mobile-native-e2e?scene=agent-compliance`, { waitUntil: "networkidle" });
      const instant = page.getByRole("region", { name: "即时来源" });
      await instant.locator("summary").click();
      const button = instant.getByRole("button", { name: "不再使用", exact: true });
      await button.focus();
      const box = await button.boundingBox(); assert.ok(box.height >= 44);
      await page.keyboard.press("Enter");
      await instant.getByRole("status").filter({ hasText: "尚未禁止，请重试" }).waitFor();
      assert.equal(await button.isEnabled(), true);
      await page.screenshot({ path: `${output}/retry-${width}.png` });
      await button.click();
      await instant.getByRole("status").filter({ hasText: "已禁止以后使用" }).waitFor();
      assert.equal(await instant.getByRole("button", { name: "已禁止", exact: true }).isDisabled(), true);
      const history = page.getByRole("region", { name: "历史来源" });
      await history.locator("summary").click();
      await history.getByRole("button", { name: "不再使用", exact: true }).click();
      await history.getByRole("status").filter({ hasText: "已禁止以后使用" }).waitFor();
      assert.equal(posts,3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ path: `${output}/blocked-${width}.png` });
      evidence.push({ width, postsIntercepted: posts, keyboard: true, retry: true, streamingAndPersistedSources: true, productionWrites: 0 });
      await context.close();
    }
    await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
