/* eslint-disable @typescript-eslint/no-require-imports -- Isolated CI browser verification. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const baseURL = process.env.E2E_COVERS_URL || "http://127.0.0.1:4187";
assert.equal(new URL(baseURL).hostname, "127.0.0.1", "cached-cover QA must use the isolated loopback fixture, never a deployed account");
assert.equal(new URL(baseURL).protocol, "http:");
const output = "test-results/pdf-cached-covers";
const fixtureURL = `${baseURL}/mobile-native-e2e?scene=files-cached-covers`;
const id = index => `e2e-cached-cover-${index}`;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const coverRequests = stats => stats.requests.filter(request => request.path.endsWith("/pdf-cover"));
const previewRequests = stats => stats.requests.filter(request => request.path.endsWith("/preview"));
const coverFor = (stats, index) => coverRequests(stats).filter(request => request.path.includes(`/${id(index)}/`));

(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  const failures = [];
  try {
    for (const width of [360, 390, 1440]) {
      const run = `cached-covers-${width}`;
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "no-preference", extraHTTPHeaders: { "X-Fixture-Run": run } });
      // Do not use context.route/page.route: interception disables Chromium's
      // HTTP cache and would invalidate the conditional-request evidence.
      await context.addInitScript(() => {
        window.__coverQa = { frames: [], urls: [], revoked: [], running: true };
        const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = object => { const url = create(object); window.__coverQa.urls.push(url); return url; };
        URL.revokeObjectURL = url => { window.__coverQa.revoked.push(url); return revoke(url); };
        const frame = () => {
          const qa = window.__coverQa;
          if (!qa.running) return;
          for (const element of document.querySelectorAll("[data-pdf-cover-state]")) {
            const box = element.getBoundingClientRect(), image = element.querySelector("img");
            if (qa.frames.length < 12000) qa.frames.push({ id: element.closest("li")?.id, state: element.dataset.pdfCoverState,
              width: box.width, height: box.height, opacity: image ? Number(getComputedStyle(image).opacity) : null });
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const page = await context.newPage();
      const errors = [], network = [], pdfJsChunks = [], scriptReads = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => {
        const url = new URL(request.url());
        if (["http:", "https:"].includes(url.protocol)) network.push({ url: request.url(), method: request.method(), type: request.resourceType() });
      });
      page.on("response", response => {
        if (response.request().resourceType() !== "script") return;
        scriptReads.push(response.text().then(body => {
          if (/Invalid PDF structure\.|Setting up fake worker failed/.test(body)) pdfJsChunks.push(response.url());
        }).catch(() => {}));
      });
      const stats = async () => {
        const response = await fetch(`${baseURL}/__fixture/stats?run=${run}`);
        assert.equal(response.status, 200);
        return response.json();
      };
      const card = index => page.locator(`#file-${id(index)}`);
      const cover = index => card(index).locator("[data-pdf-cover-state]");
      const ready = async index => {
        await cover(index).scrollIntoViewIfNeeded();
        await card(index).locator('img[data-pdf-cover-rendered="true"]').waitFor({ state: "visible", timeout: 20000 });
      };
      const capture = async name => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow");
        await page.screenshot({ path: `${output}/${name}-${width}.png` });
        row.screenshots.push(`${name}-${width}.png`);
      };
      const display = view => page.getByRole("group", { name: "文件显示方式" }).getByRole("button", { name: view, exact: true });
      const row = { width, run, screenshots: [], stages: {} };
      evidence.push(row);
      try {
        await page.goto(fixtureURL, { waitUntil: "networkidle" });
        await Promise.all(scriptReads);
        row.stages.list = await stats();
        assert.equal(coverRequests(row.stages.list).length, 0, "list loads no cover images");
        assert.equal(previewRequests(row.stages.list).length, 0, "list loads no PDF HEAD, GET or ranges");
        assert.equal(pdfJsChunks.length, 0, "list never loads the PDF.js engine");
        assert.equal(await page.locator("canvas").count(), 0);
        await capture("list-lightweight");

        await display("网格").click();
        await cover(0).waitFor();
        await page.waitForFunction(() => document.querySelector('#file-e2e-cached-cover-0 [data-pdf-cover-state]')?.dataset.pdfCoverState === "loading");
        await capture("loading-fixed-placeholders");
        await ready(0);
        await ready(1);
        for (const index of [2, 4, 5]) {
          await cover(index).scrollIntoViewIfNeeded();
          await page.waitForFunction(index => document.querySelector(`#file-e2e-cached-cover-${index} [data-pdf-cover-state]`)?.dataset.pdfCoverState === "failed", index);
          assert.match(await cover(index).innerText(), /点击预览/, "failed covers retain a usable reader fallback");
        }
        await ready(3);
        await cover(0).scrollIntoViewIfNeeded();
        await capture("ready-pending-and-failure-covers");
        row.stages.initialGrid = await stats();
        await Promise.all(scriptReads);
        assert.equal(previewRequests(row.stages.initialGrid).length, 0, "grid loads no original PDF bytes");
        assert.equal(pdfJsChunks.length, 0, "grid never loads the PDF.js engine");
        assert.equal(await page.locator("canvas").count(), 0, "all covers are images, never client-rendered canvases");
        assert.deepEqual(coverFor(row.stages.initialGrid, 1).map(item => item.status), [202, 202, 200], "pending cover retries then becomes ready");
        for (const index of [2, 4, 5]) assert.equal(coverFor(row.stages.initialGrid, index).length, 1, "terminal cover failure does not poll");
        for (const index of [0, 3]) assert.deepEqual(coverFor(row.stages.initialGrid, index).map(item => item.status), [200]);
        assert.ok(row.stages.initialGrid.maximum <= 3, "at most three cover fetches run together");
        assert.ok(coverRequests(row.stages.initialGrid).every(item => item.method === "GET" && !item.range), "covers never use HEAD or Range");
        assert.ok(coverRequests(row.stages.initialGrid).filter(item => item.status === 200).every(item => item.bodyBytes <= 128 * 1024), "each cover fits 128 KiB");

        row.geometry = await page.evaluate(() => {
          const result = {};
          for (const image of document.querySelectorAll('img[data-pdf-cover-rendered="true"]')) {
            const rect = image.getBoundingClientRect(), parent = image.parentElement.getBoundingClientRect(), style = getComputedStyle(image);
            result[image.closest("li").id] = { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
              renderedRatio: rect.width / rect.height, objectFit: style.objectFit, transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration,
              fits: rect.left >= parent.left && rect.right <= parent.right + 1 && rect.top >= parent.top && rect.bottom <= parent.bottom + 1 };
          }
          return result;
        });
        for (const [key, geometry] of Object.entries(row.geometry)) {
          assert.equal(geometry.objectFit, "contain"); assert.ok(geometry.fits, "whole page stays within fixed cover");
          assert.ok(geometry.naturalWidth * geometry.naturalHeight <= 512 * 512);
          const fixtureName = key.endsWith("-3") ? "landscape" : key.endsWith("-1") ? "chinese" : "portrait";
          const rendered = row.stages.initialGrid.rendererFixtures[fixtureName];
          assert.equal(geometry.naturalWidth, rendered.width); assert.equal(geometry.naturalHeight, rendered.height);
          const expected = rendered.width / rendered.height;
          assert.ok(Math.abs(geometry.renderedRatio - expected) < 0.025, "portrait and landscape pages keep original proportions");
          assert.match(geometry.transitionProperty, /opacity|all/);
        }
        const frames = await page.evaluate(() => window.__coverQa.frames);
        row.geometryFrames = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
          const samples = frames.filter(frame => frame.id === `file-${id(index)}` && frame.width > 0);
          const widths = samples.map(frame => frame.width), heights = samples.map(frame => frame.height);
          return [id(index), { samples: samples.length, states: [...new Set(samples.map(frame => frame.state))],
            widthVariation: Math.max(...widths) - Math.min(...widths), heightVariation: Math.max(...heights) - Math.min(...heights),
            intermediateOpacityFrames: samples.filter(frame => frame.opacity > 0 && frame.opacity < 1).length }];
        }));
        for (const geometry of Object.values(row.geometryFrames)) {
          assert.ok(geometry.samples > 0); assert.ok(geometry.widthVariation < 1 && geometry.heightVariation < 1, "loading/ready/failure never resize a cover slot");
        }
        assert.ok(Object.values(row.geometryFrames).some(geometry => geometry.intermediateOpacityFrames > 0), "normal motion visibly fades images in");

        // Sorting reorders existing nodes. History Back restores the browser
        // state without reparsing a document or redownloading cached covers.
        const beforeSort = coverRequests(await stats()).length;
        await page.getByLabel("文件排序", { exact: true }).selectOption("size-desc");
        assert.equal(await page.getByRole("list", { name: "文件网格" }).locator("li").first().getAttribute("id"), `file-${id(5)}`);
        await page.goBack();
        assert.equal(await page.getByLabel("文件排序", { exact: true }).inputValue(), "uploaded-desc");
        assert.equal(coverRequests(await stats()).length, beforeSort, "sort and history preserve mounted cover results");

        // Each remount revalidates through the private endpoint. A 304 has no
        // image bytes; no test-controlled response cache substitutes for this.
        for (let cycle = 0; cycle < 3; cycle++) {
          await display("列表").click();
          assert.equal(await page.locator("[data-pdf-cover-state]").count(), 0);
          const urls = await page.evaluate(() => window.__coverQa);
          assert.ok(urls.urls.every(url => urls.revoked.includes(url)), "all cover object URLs are revoked on list navigation");
          const beforeListWait = coverRequests(await stats()).length;
          await pause(1250);
          assert.equal(coverRequests(await stats()).length, beforeListWait, "unmounted covers stop polling");
          await display("网格").click();
          await ready(0); await ready(1); await ready(3);
        }
        row.stages.repeatedViews = await stats();
        for (const index of [0, 1, 3]) {
          const requests = coverFor(row.stages.repeatedViews, index);
          assert.equal(requests.filter(item => item.status === 200).length, 1, "ready image bytes transfer only once per browser context");
          assert.ok(requests.filter(item => item.status === 304).length >= 3, "remounts revalidate cached private images");
          assert.ok(requests.filter(item => item.status === 304).every(item => item.conditional && item.bodyBytes === 0));
        }
        assert.equal(previewRequests(row.stages.repeatedViews).length, 0);
        assert.equal(pdfJsChunks.length, 0);
        await cover(0).scrollIntoViewIfNeeded();
        await capture("repeated-navigation-cached-images");

        // A new page document retains only HTTP cache, not component/module
        // state. Reauthentication/revalidation still happens on the next grid.
        await page.goto(fixtureURL, { waitUntil: "networkidle" });
        assert.equal(await page.getByRole("list", { name: "文件列表" }).count(), 1);
        await display("网格").click(); await ready(0);
        row.stages.newDocument = await stats();
        assert.equal(coverFor(row.stages.newDocument, 0).filter(item => item.status === 200).length, 1);
        assert.ok(coverFor(row.stages.newDocument, 0).filter(item => item.status === 304).length >= 4);

        // Only an explicit reader open may load PDF.js and the original PDF.
        await card(0).getByRole("button", { name: /^预览 / }).click();
        const dialog = page.getByRole("dialog");
        await dialog.locator('canvas[data-pdf-rendered="true"]').waitFor({ timeout: 30000 });
        await Promise.all(scriptReads);
        assert.ok(pdfJsChunks.length > 0, "detector sees the lazy PDF.js chunk only after reader open");
        await capture("explicit-pdf-reader");
        await dialog.getByRole("button", { name: "下一页", exact: true }).click();
        await dialog.locator('canvas[data-pdf-page="2"][data-pdf-rendered="true"]').waitFor();
        if (width < 768) await page.goBack();
        else await dialog.getByRole("button", { name: "关闭", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await cover(0).getAttribute("data-pdf-cover-state"), "ready");
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "预览 1. ready · Synthetic PDF");
        await capture("reader-back-retains-cover");

        await page.emulateMedia({ reducedMotion: "reduce" });
        const duration = await card(0).locator("img").evaluate(image => getComputedStyle(image).transitionDuration);
        assert.ok(duration.split(",").every(value => parseFloat(value) <= 0.001), "reduced-motion users receive no fade");
        row.reducedMotionDuration = duration;
        row.stages.final = await stats();
        row.pdfJsChunks = [...new Set(pdfJsChunks)];
        row.coverBytesTransferred = coverRequests(row.stages.final).reduce((total, item) => total + (item.status === 200 ? item.bodyBytes : 0), 0);
        row.pdfBytesTransferredAfterExplicitOpen = previewRequests(row.stages.final).reduce((total, item) => total + item.bodyBytes, 0);
        assert.ok(previewRequests(row.stages.final).some(item => item.method === "HEAD") && previewRequests(row.stages.final).some(item => item.method === "GET"));
        assert.ok(row.stages.final.requests.every(item => ["GET", "HEAD"].includes(item.method)));
        assert.ok(row.stages.final.requests.every(item => !item.path.endsWith("/download")));
        assert.ok(network.every(item => new URL(item.url).origin === new URL(baseURL).origin), "no requests leave the isolated fixture origin");
        assert.deepEqual(errors, []);

        if (width === 390) {
          // New context resets the synthetic server's pending attempts and the
          // browser cache, so this really interrupts an unfinished 202 retry.
          const interruptedRun = `${run}-interrupted`;
          const interruptedContext = await browser.newContext({ viewport: { width, height: 1000 }, extraHTTPHeaders: { "X-Fixture-Run": interruptedRun } });
          try {
            const interruptedPage = await interruptedContext.newPage();
            const interruptedStats = async () => (await fetch(`${baseURL}/__fixture/stats?run=${interruptedRun}`)).json();
            const pendingResponse = () => interruptedPage.waitForResponse(response => response.url().endsWith(`/${id(1)}/pdf-cover`) && response.status() === 202);
            const interruptedDisplay = view => interruptedPage.getByRole("group", { name: "文件显示方式" }).getByRole("button", { name: view, exact: true });
            await interruptedPage.goto(fixtureURL, { waitUntil: "networkidle" });
            let pending = pendingResponse();
            await interruptedDisplay("网格").click(); await pending;
            await interruptedDisplay("列表").click();
            const first = coverFor(await interruptedStats(), 1).length;
            await pause(1500);
            assert.equal(coverFor(await interruptedStats(), 1).length, first, "switching to list cancels a pending cover retry");
            pending = pendingResponse();
            await interruptedDisplay("网格").click(); await pending;
            await interruptedPage.goto(fixtureURL, { waitUntil: "networkidle" });
            const second = coverFor(await interruptedStats(), 1).length;
            await pause(1500);
            assert.equal(coverFor(await interruptedStats(), 1).length, second, "leaving the page cancels a pending cover retry");
            assert.equal(second, 2);
            row.interruptedPending = await interruptedStats();
            assert.equal(previewRequests(row.interruptedPending).length, 0);
            await interruptedPage.screenshot({ path: `${output}/interrupted-pending-clean-list-${width}.png` });
            row.screenshots.push(`interrupted-pending-clean-list-${width}.png`);
          } finally { await interruptedContext.close(); }
        }
        row.passed = true;
      } catch (error) {
        row.passed = false; row.failure = error.stack;
        failures.push(`${width}px: ${error.message}`);
        await page.screenshot({ path: `${output}/failure-${width}.png` }).catch(() => {});
      } finally {
        row.errors = errors;
        row.network = network;
        row.server = await stats().catch(error => ({ unavailable: error.message }));
        await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
        await context.close();
      }
    }
  } finally { await browser.close(); }
  assert.deepEqual(failures, [], failures.join("\n"));
})().catch(error => { console.error(error); process.exitCode = 1; });
