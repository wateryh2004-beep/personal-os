/* eslint-disable @typescript-eslint/no-require-imports -- Node browser-test entrypoint. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.E2E_SCREENSHOT_DIR || "test-results/mobile";
const rttMs = 100;
const samples = [];
const tasks = {
  connection: { id: "fixture-connection", status: "active", oauth_connected_at: null, last_error_code: null },
  lists: [{ id: "fixture-list", displayName: "测试清单", isDefault: true }],
  tasks: [{ id: "fixture-task", providerTaskId: "fixture-task", todoListId: "fixture-list", title: "Synthetic latency task", bodyText: "Fixture only", status: "notStarted", importance: "normal", dueAt: null, completedAt: null, lastModifiedAt: null }],
  unavailable: false, schemaMissing: false,
};
const note = { id: "fixture-note", title: "Synthetic latency note", excerpt: "Fixture only", folder_id: null, updated_at: "2026-10-02T00:00:00Z", pinned_at: null, content_origin: "human" };
const notes = { folders: [], notes: [note], navigatorNotes: [note], timezone: "UTC", state: "ready", hasMore: false };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const delay of [80, 800]) for (const target of ["tasks", "notes"]) for (const cacheState of ["cold", "data-only", "data-plus-prefetch-requested"]) for (const mode of ["baseline", "resource"]) {
      const warm = cacheState !== "cold";
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const reads = { tasks: 0, notes: 0 };
      let updated = false;
      let rscRequests = 0;
      await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        const name = path === "/api/tasks/workspace" ? "tasks" : path === "/api/notes/workspace" ? "notes" : null;
        if (!name) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        reads[name] += 1;
        await pause(rttMs + delay);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(name === "tasks" ? { ...tasks, tasks: tasks.tasks.map((task) => ({ ...task, title: updated ? "Updated synthetic task" : task.title })) } : notes) });
      });
      await page.route("**/mobile-native-e2e?**", async (route) => {
        if (route.request().headers().rsc) { rscRequests += 1; await pause(rttMs); }
        await route.continue();
      });
      await page.goto(`${baseURL}/mobile-native-e2e?scene=latency&workspace=home&mode=${mode}&delay=${delay}`);
      await page.getByTestId("latency-harness").waitFor();
      if (warm) {
        await page.getByTestId("warm").click();
        await page.getByTestId("warm").filter({ hasText: "ready" }).waitFor();
      }
      if (cacheState === "data-plus-prefetch-requested") {
        const prefetched = page.waitForResponse((response) => response.request().headers().rsc && response.url().includes(`workspace=${target}`));
        await page.getByTestId(`prefetch-${target}`).click();
        await (await prefetched).finished();
        // Let the completed Flight payload reach Next's router cache.
        await page.waitForTimeout(100);
      }
      // Record the first visible DOM frame directly; locator polling below is
      // only a correctness wait and must not inflate the measured latency.
      await page.evaluate((text) => {
        performance.clearMarks("fixture-content-visible");
        let queued = false;
        const observer = new MutationObserver(() => {
          if (queued) return;
          const match = [...document.querySelectorAll('[data-testid="latency-harness"] span, [data-testid="latency-harness"] a, [data-testid="latency-harness"] button, [data-testid="latency-harness"] h1, [data-testid="latency-harness"] h2, [data-testid="latency-harness"] h3')]
            .find((node) => node.textContent.trim() === text && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
          if (!match) return;
          queued = true;
          observer.disconnect();
          requestAnimationFrame(() => performance.mark("fixture-content-visible"));
        });
        observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
      }, target === "tasks" ? "Synthetic latency task" : "Synthetic latency note");
      const beforeRsc = rscRequests;
      const beforeReads = reads[target];
      await page.getByTestId(`go-${target}`).click();
      await page.getByText(target === "tasks" ? "Synthetic latency task" : "Synthetic latency note", { exact: true }).first().waitFor();
      await page.waitForFunction(() => performance.getEntriesByName("fixture-content-visible").length > 0);
      const duration = await page.evaluate(() => performance.getEntriesByName("fixture-content-visible").at(-1).startTime - performance.getEntriesByName("fixture-navigation-click").at(-1).startTime);
      samples.push({ mode, target, cacheState, syntheticDataDelayMs: delay, syntheticRscRttMs: rttMs, clickToContentMs: Math.round(duration), navigationRscRequests: rscRequests - beforeRsc, additionalWorkspaceApiReads: reads[target] - beforeReads });
      assert.equal(errors.length, 0, errors.join("\n"));
      if (mode === "resource") assert.equal(reads[target] - beforeReads, warm ? 0 : 1, "navigation and loader share one resource read");
      if (mode === "resource" && warm && delay === 800) {
        assert.ok(duration < 650, `warm ${target} should not wait for the injected 800ms data delay (${duration}ms)`);
        await mkdir(output, { recursive: true });
        await page.screenshot({ path: `${output}/warm-${target}-navigation.png` });
      }
      if (mode === "resource" && cacheState === "data-only" && target === "tasks" && delay === 80) {
        await page.getByLabel("Unfinished fixture draft").fill("keep this unfinished draft");
        updated = true;
        const beforeMutationReads = reads.tasks;
        await page.getByTestId("commit-revision").click();
        await page.getByText("Updated synthetic task", { exact: true }).first().waitFor();
        assert.equal(reads.tasks - beforeMutationReads, 1, "server action revision refreshes active data once");
        assert.equal(await page.getByLabel("Unfinished fixture draft").inputValue(), "keep this unfinished draft");
        assert.ok((await context.cookies()).some((cookie) => cookie.name === "personal-os-workspace-revision"), "real Server Action revision cookie was set");
      }
      // Browser history must restore the correct workspace and content.
      await page.goBack();
      await page.getByTestId("latency-harness").filter({ has: page.getByRole("heading", { name: "Navigation latency fixture" }) }).waitFor();
      await page.goForward();
      await page.getByText(target === "tasks" ? updated ? "Updated synthetic task" : "Synthetic latency task" : "Synthetic latency note", { exact: true }).first().waitFor();
      await context.close();
    }
    await mkdir(output, { recursive: true });
    const result = { scope: "In-app navigation. data-only = RSC route miss with an already-warm workspace cache; data-plus-prefetch-requested attempts RSC warming; navigationRscRequests records whether a new request was still required. Does not measure a hard reload or real Supabase/auth latency.", label: "Synthetic production-build fixture; not authenticated production-user latency", timingMethod: "Click handler mark to first visible matching DOM frame (MutationObserver + requestAnimationFrame); independent of Playwright polling", samples };
    await writeFile(`${output}/navigation-latency.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
