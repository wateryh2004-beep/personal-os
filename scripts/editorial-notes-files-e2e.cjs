/* Remote CI Chromium only. Local visual inspection uses CUA. */
(async () => {
  const { createRequire } = await import("node:module");
  const { chromium } = await import(createRequire(__filename).resolve("playwright")).then(module => module.default ?? module);
  const assert = (await import("node:assert/strict")).default;
  const fs = await import("node:fs/promises");
  const fixtures = await import("./fixtures/pdf-cover-fixtures.cjs").then(module => module.default ?? module);
  const base = process.env.EDITORIAL_E2E_BASE_URL;
  assert.match(base ?? "", /^http:\/\/127\.0\.0\.1:\d+$/, "Only an isolated E2E_MOBILE_HARNESS server is allowed");
  const output = "test-results/editorial-notes-files";
  await fs.mkdir(output, { recursive: true });
  const pdfBytes = fixtures.syntheticPdf();
  const photoBytes = await fixtures.syntheticCover();
  const browser = await chromium.launch();
  const evidence = [];
  let activePage;
  try {
    for (const width of [360, 390, 768, 1440]) for (const mode of ["normal", "text200", "reduced"]) {
      const row = { width, mode, errors: [], requests: [], paperFrames: [], imageFrames: [], textSizes: [], pdfGeometry: [] }; evidence.push(row);
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: mode === "reduced" ? "reduce" : "no-preference", recordVideo: { dir: `${output}/video`, size: { width: Math.min(width, 1000), height: 900 } } });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      try {
        await context.route("**/*", async route => {
          const request = route.request(); const url = new URL(request.url());
          if (url.origin !== base) return route.abort();
          if (!["GET", "HEAD"].includes(request.method())) return route.fulfill({ status: 503, json: { error: "Synthetic verification blocks every write" } });
          if (url.pathname.startsWith("/api/")) row.requests.push({ method: request.method(), path: url.pathname });
          if (/^\/api\/files\/e2e-file-\d+\/thumbnail$/.test(url.pathname)) return route.fulfill({ contentType: "image/jpeg", body: photoBytes, headers: { "Cache-Control": "private, no-store" } });
          if (/^\/api\/files\/e2e-file-\d+\/preview$/.test(url.pathname)) {
            const headers = { "Content-Type": "application/pdf", "Content-Length": String(pdfBytes.length), "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Reading-Source-Version": "71000000-0000-4000-8000-000000000001" };
            const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers().range ?? "");
            if (range && request.method() === "GET") {
              const start = Number(range[1]), end = Math.min(pdfBytes.length - 1, range[2] ? Number(range[2]) : pdfBytes.length - 1);
              const body = pdfBytes.subarray(start, end + 1); headers["Content-Range"] = `bytes ${start}-${end}/${pdfBytes.length}`; headers["Content-Length"] = String(body.length);
              return route.fulfill({ status: 206, headers, body });
            }
            return route.fulfill({ headers, body: request.method() === "HEAD" ? Buffer.alloc(0) : pdfBytes });
          }
          if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "No live data in the synthetic fixture" } });
          return route.continue();
        });
        const page = await context.newPage(); activePage = page;
        page.on("pageerror", error => row.errors.push(error.message));
        // Enlarge actual computed text rather than only changing root rem units:
        // much of the product deliberately uses fixed px typography. Restore the
        // preceding state first, read ALL baselines before writing any ancestor,
        // then double each element once. Reapply after dynamic content mounts.
        const scale = "";
        const scaleText = async label => {
          if (mode !== "text200") return;
          const measurements = await page.evaluate(() => {
            window.__editorialRestoreFonts?.();
            const nodes = [...document.querySelectorAll("body,body *")].filter(node => node instanceof HTMLElement);
            const baselines = nodes.map(node => ({ node, size: parseFloat(getComputedStyle(node).fontSize), previous: node.style.getPropertyValue("font-size"), priority: node.style.getPropertyPriority("font-size") }));
            const selectors = [".notes-list-row .note-title-anchor", ".notes-title-input", ".notes-reading-title", ".note-reading-prose", ".file-preview-surface [data-slot=dialog-title]", ".file-pdf-page-count"];
            const samples = selectors.flatMap(selector => { const node = document.querySelector(selector); return node ? [{ selector, node, before: parseFloat(getComputedStyle(node).fontSize) }] : []; });
            for (const { node, size } of baselines) if (Number.isFinite(size) && size > 0) node.style.setProperty("font-size", `${size * 2}px`, "important");
            window.__editorialRestoreFonts = () => { for (const { node, previous, priority } of baselines) { if (previous) node.style.setProperty("font-size", previous, priority); else node.style.removeProperty("font-size"); } };
            return samples.map(({ selector, node, before }) => ({ selector, before, after: parseFloat(getComputedStyle(node).fontSize) }));
          });
          for (const measurement of measurements) assert.ok(Math.abs(measurement.after - measurement.before * 2) < .1, `${label}/${measurement.selector} must be exactly 200% actual text`);
          row.textSizes.push({ label, measurements });
        };
        const noOverflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} has no root horizontal overflow`);
        const capture = async label => { await scaleText(label); await noOverflow(label); await page.screenshot({ path: `${output}/${label}-${width}-${mode}.png` }); };
        await page.goto(`${base}/mobile-native-e2e?scene=workspace-motion${scale}`);
        const list = page.locator(".notes-library");
        await list.getByRole("heading", { name: "全部笔记", exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await scaleText("notes-list"); await noOverflow("notes-list");
        const link = page.locator('a[data-note-result]').nth(5);
        await link.scrollIntoViewIfNeeded();
        const listTop = await list.evaluate(node => node.scrollTop);
        const id = (await link.getAttribute("href")).split("/").at(-1);
        // Sample every presented frame, including native pseudo-element geometry.
        await page.evaluate(noteId => {
          window.__editorialPaperFrames = [];
          window.__editorialPaperDone = false;
          const began = performance.now();
          const frame = () => {
            const group = getComputedStyle(document.documentElement, `::view-transition-group(note-paper-${noteId})`);
            window.__editorialPaperFrames.push({ elapsed: performance.now() - began, root: document.documentElement.scrollWidth, viewport: innerWidth, width: group.width, height: group.height, transform: group.transform, animation: group.animationName });
            if (performance.now() - began < 1100) requestAnimationFrame(frame); else window.__editorialPaperDone = true;
          }; requestAnimationFrame(frame);
        }, id);
        await link.click();
        await page.getByRole("textbox", { name: "笔记标题", exact: true }).waitFor();
        await scaleText("notes-editor");
        if (mode === "text200") assert.equal(await page.getByRole("textbox", { name: "笔记标题", exact: true }).evaluate(node => parseFloat(getComputedStyle(node).fontSize)), width === 1440 ? 72 : 56, "the actual title is enlarged from 28/36px to 56/72px");
        await page.waitForFunction(() => window.__editorialPaperDone);
        row.paperFrames = await page.evaluate(() => window.__editorialPaperFrames);
        assert.ok(row.paperFrames.every(frame => frame.root <= frame.viewport + 1), "paper motion stays horizontally contained");
        if (mode === "normal") {
          const moving = row.paperFrames.filter(frame => frame.animation !== "none" && Number.parseFloat(frame.width) > 0);
          assert.ok(moving.length > 2, "the actual native paper participant must animate");
          assert.ok(new Set(moving.map(frame => `${frame.width}/${frame.height}/${frame.transform}`)).size > 2, "paper geometry must change across real frames");
        }
        const readerMode = page.getByRole("group", { name: "笔记阅读方式", exact: true });
        await readerMode.getByRole("button", { name: "阅读", exact: true }).click();
        await page.getByRole("article", { name: "笔记正文", exact: true }).waitFor();
        await page.locator(".note-reading-prose table").first().waitFor();
        await page.locator(".note-reading-prose pre").first().waitFor();
        await capture("notes-reading");
        if (mode === "text200") assert.equal(await page.locator(".note-reading-prose").evaluate(node => getComputedStyle(node).fontSize), "32px", "the real reading prose is doubled from 16px to 32px");
        await readerMode.getByRole("button", { name: "编辑", exact: true }).click();
        await page.getByRole("button", { name: "返回笔记列表", exact: true }).click();
        await list.waitFor();
        assert.ok(Math.abs(await list.evaluate(node => node.scrollTop) - listTop) < 3, "return preserves list position");
        // A visible destination must work immediately while its paper is moving.
        // Do not wait for animation completion before clicking Reading or Back.
        await page.locator(`a[data-note-result][href="/notes/${id}"]`).click();
        await page.getByRole("textbox", { name: "笔记标题", exact: true }).waitFor();
        await scaleText("notes-editor-immediate");
        await readerMode.getByRole("button", { name: "阅读", exact: true }).click();
        await page.getByRole("article", { name: "笔记正文", exact: true }).waitFor();
        await scaleText("notes-reader-immediate");
        await page.getByRole("button", { name: "返回笔记列表", exact: true }).click();
        await list.waitFor(); await capture("notes-return");

        await page.goto(`${base}/mobile-native-e2e?scene=files${scale}`);
        const photoLauncher = page.getByRole("button", { name: "预览 示例资料 2 · Synthetic fixture", exact: true });
        await photoLauncher.scrollIntoViewIfNeeded();
        await scaleText("files-list");
        await page.evaluate(() => {
          window.__editorialImageFrames = []; window.__editorialImageDone = false;
          const began = performance.now();
          const frame = () => {
            const surface = document.querySelector(".file-preview-surface");
            if (surface) window.__editorialImageFrames.push({ root: document.documentElement.scrollWidth, viewport: innerWidth, transform: getComputedStyle(surface).transform, x: surface.style.getPropertyValue("--file-origin-x"), scale: surface.style.getPropertyValue("--file-origin-scale-x") });
            if (performance.now() - began < 1100) requestAnimationFrame(frame); else window.__editorialImageDone = true;
          }; requestAnimationFrame(frame);
        });
        await photoLauncher.click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await dialog.locator("img").waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] img')].every(image => image.complete && image.naturalWidth > 0));
        await page.waitForFunction(() => window.__editorialImageDone);
        row.imageFrames = await page.evaluate(() => window.__editorialImageFrames);
        assert.ok(row.imageFrames.every(frame => frame.root <= frame.viewport + 1), "image expansion stays contained");
        assert.ok(row.imageFrames.at(-1).scale, "the image viewer reads the actual source geometry");
        if (mode === "normal") assert.ok(new Set(row.imageFrames.map(frame => frame.transform)).size > 2, "the actual image viewer geometry changes across presented frames");
        await capture("file-photo");
        const viewerShell = await dialog.elementHandle();
        await dialog.getByRole("button", { name: "上一文件", exact: true }).click();
        await dialog.getByRole("heading", { name: "示例资料 1 · Synthetic fixture", exact: true }).waitFor();
        await dialog.locator('canvas[data-pdf-rendered="true"]').waitFor();
        assert.ok(await viewerShell.evaluate(node => node === document.querySelector('[role="dialog"]')), "switching files preserves the actual viewer shell");
        await scaleText("file-switch-pdf"); await noOverflow("file-switch-pdf");
        await dialog.getByRole("button", { name: "下一文件", exact: true }).focus();
        await page.keyboard.press("ArrowRight");
        await dialog.getByRole("heading", { name: "示例资料 2 · Synthetic fixture", exact: true }).waitFor();
        assert.ok(await viewerShell.evaluate(node => node === document.querySelector('[role="dialog"]')), "keyboard file switch also preserves viewer shell");
        await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
        await page.waitForFunction(node => document.activeElement === node, await photoLauncher.elementHandle());
        const pdfLauncher = page.getByRole("button", { name: "预览 示例资料 1 · Synthetic fixture", exact: true });
        await pdfLauncher.click(); await dialog.waitFor();
        await dialog.locator('canvas[data-pdf-rendered="true"]').waitFor();
        await scaleText("file-pdf-loaded");
        const controls = await dialog.getByLabel("PDF 阅读控制", { exact: true }).elementHandle();
        await dialog.getByRole("button", { name: "下一页", exact: true }).click();
        await dialog.locator('canvas[data-pdf-rendered="true"][data-pdf-page="2"]').waitFor();
        assert.ok(await controls.evaluate(node => node.isConnected), "PDF control shell survives page changes");
        for (const zoom of [.5, 1, 2]) {
          await dialog.getByRole("button", { name: "适合宽度", exact: true }).click();
          for (let step = 1; step > zoom; step -= .25) await dialog.getByRole("button", { name: "缩小 PDF", exact: true }).click();
          for (let step = 1; step < zoom; step += .25) await dialog.getByRole("button", { name: "放大 PDF", exact: true }).click();
          await dialog.locator('canvas[data-pdf-rendered="true"][data-pdf-page="2"]').waitFor();
          const geometry = await dialog.locator(".file-pdf-page").evaluate(paper => {
            const canvas = paper.querySelector("canvas"); const page = paper.getBoundingClientRect(), ink = canvas.getBoundingClientRect();
            return { paperWidth: page.width, paperHeight: page.height, canvasWidth: ink.width, canvasHeight: ink.height };
          });
          row.pdfGeometry.push({ zoom, ...geometry });
          assert.ok(Math.abs(geometry.paperHeight - geometry.canvasHeight) <= 1, `PDF ${zoom * 100}% paper height follows actual canvas`);
          assert.ok(Math.abs(geometry.paperWidth - geometry.canvasWidth) <= 1, `PDF ${zoom * 100}% paper width follows actual canvas`);
        }
        await capture("file-pdf");
        // Preference changes during a live dialog must safely settle.
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await dialog.evaluate(node => getComputedStyle(node).transform), "none");
        await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
        assert.ok(!row.requests.some(request => request.path.endsWith("/download")), "viewing never downloads an original");
        assert.deepEqual(row.errors, []);
      } catch (error) {
        await activePage?.screenshot({ path: `${output}/failure-${width}-${mode}.png` }).catch(() => {});
        throw error;
      } finally {
        await context.tracing.stop({ path: `${output}/trace-${width}-${mode}.zip` });
        await context.close();
      }
    }
    await fs.writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
    console.log("PASS editorial Notes/Files: four widths × normal/200%/reduced, native paper trajectories, immediate reversal, long prose, image expansion, real PDF canvas and focus restoration.");
  } catch (error) {
    await activePage?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    await fs.writeFile(`${output}/failure.json`, JSON.stringify({ error: error.message, evidence }, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
