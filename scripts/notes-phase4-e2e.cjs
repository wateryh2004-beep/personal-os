/* eslint-disable @typescript-eslint/no-require-imports -- isolated Chromium only. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const base = process.env.E2E_BASE_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/, "synthetic localhost only");
const out = "test-results/notes-phase4";
const noteId = "b77ce6c2-f913-4899-86aa-c93e8739d194";
const versionId = "06fe866d-bfd6-4eaf-86a2-b7c9077c0212";

(async () => {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const evidence = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      let writes = 0;
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== base || (req.method() !== "GET" && req.method() !== "HEAD")) {
          writes += req.method() !== "GET" && req.method() !== "HEAD" ? 1 : 0;
          return route.abort();
        }
        if (url.pathname === "/api/notes/" + noteId + "/versions/compare" &&
            url.searchParams.get("versionId") === versionId)
          return route.fulfill({ status: 200, json: {
            current: { title: "现行标题", body: "# 章节\n\n当前段落\n\n共有段落", revision: 6 },
            historical: { id: versionId, title: "旧版标题", body: "# 章节\n\n历史段落\n\n共有段落",
              versionNumber: 3, createdAt: "2026-10-20T04:00:00Z" },
          } });
        if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Synthetic only" } });
        return route.continue();
      });
      try {
        await page.goto(base + "/mobile-native-e2e?scene=notes-phase4");
        await page.getByTestId("notes-phase4-fixture").waitFor();
        await page.getByRole("dialog", { name: "比较并恢复笔记版本" }).waitFor();
        await page.getByRole("textbox", { name: "当前版本 Markdown" }).waitFor();
        assert.equal(await page.getByRole("textbox", { name: "合并后的 Markdown 正文" }).inputValue(), "# 章节\n\n当前段落\n\n共有段落");
        assert.equal(await page.getByRole("button", { name: "确认应用并保存" }).isDisabled(), true);
        await page.getByRole("button", { name: "采用历史全文" }).click();
        assert.equal(await page.getByRole("textbox", { name: "合并后的 Markdown 正文" }).inputValue(), "# 章节\n\n历史段落\n\n共有段落");
        assert.equal(await page.getByRole("button", { name: "确认应用并保存" }).isEnabled(), true);
        // Dirty draft must block the final apply without sending a Server Action.
        await page.getByRole("button", { name: "切换未保存状态" }).evaluate(button => button.click());
        await page.getByRole("button", { name: "确认应用并保存" }).click();
        await page.getByRole("alert").filter({ hasText: "未保存内容" }).waitFor();
        assert.equal(writes, 0, "no synthetic writes or version overwrites");
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await page.getByRole("button", { name: "再次比较版本" }).waitFor();
        assert.deepEqual(errors, [], "no browser JS exceptions");
        await page.screenshot({ path: out + "/version-" + width + ".png" });
        evidence.push({ width, compared: true, fullRestoreDraft: true, blockedDirtyRestore: true, writes });
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await writeFile(out + "/evidence.json", JSON.stringify(evidence, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
