/* eslint-disable @typescript-eslint/no-require-imports -- Isolated synthetic Chromium. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { mkdir, writeFile } = require("node:fs/promises");
const base = process.env.E2E_BASE_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/, "localhost-only test");

(async () => {
  const out = "test-results/markdown-version";
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  const note = "11111111-1111-4111-8111-111111111111";
  const version = "22222222-2222-4222-8222-222222222222";
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== base || !["GET", "HEAD"].includes(request.method())) return route.abort();
        if (url.pathname === "/api/notes/" + note + "/versions" && !url.searchParams.has("before"))
          return route.fulfill({ status: 200, json: {
            versions: [{ id: version, versionNumber: 3, reason: "manual", createdAt: "2026-11-01T10:00:00.000Z", revision: 3 }],
            nextBefore: 3,
          } });
        if (url.pathname === "/api/notes/" + note + "/versions" && url.searchParams.get("before") === "3")
          return route.fulfill({ status: 200, json: {
            versions: [{ id: "33333333-3333-4333-8333-333333333333", versionNumber: 1, reason: "initial", createdAt: "2026-10-01T10:00:00.000Z", revision: 1 }],
            nextBefore: null,
          } });
        if (url.pathname === "/api/notes/" + note + "/versions/" + version)
          return route.fulfill({ status: 200, json: { version: {
            id: version, versionNumber: 3, reason: "manual", createdAt: "2026-11-01T10:00:00.000Z",
            title: "历史标题", body: "# 第一章\n\n历史甲\n\n中间不变\n\n历史乙\n",
          } } });
        if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Synthetic read only" } });
        return route.continue();
      });
      try {
        await page.goto(base + "/mobile-native-e2e?scene=markdown-version");
        await page.getByTestId("markdown-version-fixture").waitFor();
        await page.getByRole("button", { name: /版本 3/ }).click();
        const changes = page.getByLabel("恢复这一处历史内容");
        await changes.first().waitFor();
        assert.equal(await changes.count(), 2, "two distinct line diffs");
        await changes.first().check();
        await page.getByRole("button", { name: "应用所选内容" }).click();
        await page.waitForFunction(() => {
          const body = document.querySelector('[data-testid="markdown-version-result"]')?.textContent ?? "";
          return body.includes("历史甲") && body.includes("现在乙") && !body.includes("历史乙");
        });
        await page.getByRole("button", { name: "打开历史版本" }).click();
        await page.getByRole("button", { name: "加载更早版本" }).click();
        await page.getByRole("button", { name: /版本 1/ }).waitFor();
        const widthDoc = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(widthDoc <= width + 1, "no viewport overflow on history review");
        assert.deepEqual(errors, []);
        await page.screenshot({ path: out + "/history-" + width + ".png" });
        report.push({ width, partialRestore: true, pagination: true });
      } finally { await context.close(); }
    }
    console.log("PASS: Markdown version review, selective restore and paginated history");
  } finally {
    await browser.close();
    await writeFile(out + "/evidence.json", JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
