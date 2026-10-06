/* eslint-disable @typescript-eslint/no-require-imports -- Isolated synthetic settings metadata checks. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = "test-results/r2-storage-settings";
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true }); const evidence = [];
  try {
    for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      let checks = 0, otherWrites = 0, mode = "complete";
      await context.route("**/*", route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== new URL(baseURL).origin) return route.abort();
        if (url.pathname === "/api/files/storage-inspection" && req.method() === "POST") {
          checks++;
          const { scan } = JSON.parse(req.postData());
          return route.fulfill({ json: { checkedAt: new Date().toISOString(), health: { configured: true, endpointValid: true, bucket: "synthetic-private-bucket", credentialsReachR2: true, status: "ok" }, logical: { status: "complete", records: 80, activeBytes: 30 * 1024 * 1024, archivedBytes: 5 * 1024 * 1024, pendingBytes: 2 * 1024 * 1024 }, usage: !scan ? null : mode === "partial" ? { status: "partial", objectCount: 20000, objectBytes: 70 * 1024 * 1024, pagesScanned: 20, reason: "limit" } : mode === "denied" ? { status: "unavailable", objectCount: 0, objectBytes: 0, pagesScanned: 0, reason: "access_denied" } : { status: "complete", objectCount: 120, objectBytes: 60 * 1024 * 1024, pagesScanned: 1 } } });
        }
        if (req.method() !== "GET") { otherWrites++; return route.abort(); }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
        return route.continue();
      });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${baseURL}/mobile-native-e2e?scene=storage-settings`, { waitUntil: "networkidle" });
      assert.equal(checks, 0, "opening settings does not scan");
      await page.getByRole("button", { name: "检查连接", exact: true }).click();
      await page.getByText("桶连接与身份验证通过", { exact: true }).waitFor();
      assert.ok((await page.locator("body").innerText()).includes("尚未统计"));
      await page.getByRole("button", { name: "检查并统计用量", exact: true }).click();
      await page.getByText("合计：60 MiB", { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${output}/complete-${width}.png`, fullPage: true });
      mode = "partial";
      await page.getByRole("button", { name: "检查并统计用量", exact: true }).click();
      await page.getByText("已统计部分：70 MiB", { exact: true }).waitFor();
      assert.ok((await page.locator("body").innerText()).includes("不是总量"));
      mode = "denied";
      await page.getByRole("button", { name: "检查并统计用量", exact: true }).click();
      await page.getByText("列举权限被拒绝，实际用量未知", { exact: true }).waitFor();
      await page.screenshot({ path: `${output}/unavailable-${width}.png`, fullPage: true });
      assert.equal(otherWrites, 0); assert.deepEqual(errors, []);
      evidence.push({ width, metadataChecks: checks, unexpectedWrites: otherWrites, errors, syntheticOnly: true });
      await context.close();
    }
    await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
