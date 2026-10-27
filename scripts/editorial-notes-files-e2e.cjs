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
      const row = { width, mode, errors: [], requests: [], paperFrames: [], imageFrames: [], textSizes: [], pdfGeometry: [], viewerBounds: [], alignment: [], listRecovery: {} }; evidence.push(row);
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
        let textBootstrapInstalled = false;
        page.on("pageerror", error => row.errors.push(error.message));
        // Install a persistent typography stylesheet before the first list
        // checkpoint. New route/read/PDF nodes receive 200% from CSS during
        // layout, before the product restores scrolling; no post-layout font
        // patching, observer, scroll correction or root-rem-only simulation.
        const scale = "";
        const scaleText = async label => {
          if (mode !== "text200") return;
          if (label === "files-list" || label === "standalone-editor") assert.equal(await page.evaluate(() => window.__editorialText200?.installedAtDocumentEntry), true, `${label}: the new document receives the preference before application layout`);
          const result = await page.evaluate(() => {
            let bootstrap;
            if (!window.__editorialText200) {
              let declarations = 0;
              const rules = entries => [...entries].map(rule => {
                if (rule instanceof CSSStyleRule) {
                  const size = rule.style.getPropertyValue("font-size");
                  // Relative em/percent/inherited sizes already follow the
                  // doubled parent. Doubling those again would make 400%.
                  const relative = /(?<!r)em\b|%|^(inherit|initial|unset|revert|revert-layer)$/i.test(size);
                  const root = rule.selectorText.split(",").some(selector => ["html", ":root", ":host"].includes(selector.trim()));
                  const priority = rule.style.getPropertyPriority("font-size");
                  const declaration = size && !relative && !root ? `font-size:calc((${size}) * 2)${priority ? " !important" : ""};` : "";
                  if (declaration) declarations++;
                  const children = rule.cssRules ? rules(rule.cssRules) : "";
                  return declaration || children ? `${rule.selectorText}{${declaration}${children}}` : "";
                }
                if (rule.cssRules) {
                  const children = rules(rule.cssRules);
                  return children ? `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${children}}` : "";
                }
                // Preserve the app's original layer ordering when the same
                // font-only CSS is preloaded before a new document's links.
                if (/^@layer[^{}]+;$/i.test(rule.cssText.trim())) return rule.cssText;
                return "";
              }).join("\n");
              // All application styles are same-origin. A blocked stylesheet is
              // a failed test, never an silently incomplete accessibility pass.
              const styles = [...document.styleSheets].map(sheet => rules(sheet.cssRules)).join("\n");
              if (declarations < 10) throw new Error("The stable typography fixture did not inspect the actual application stylesheet");
              const bodySize = parseFloat(getComputedStyle(document.body).fontSize);
              const css = `body{font-size:${bodySize * 2}px;}\n${styles}`;
              const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
              document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
              window.__editorialText200 = { declarations };
              bootstrap = { css, declarations };
            }
            const title = innerWidth < 768 ? 28 : Math.max(28, Math.min(36, innerWidth * .025));
            const expected = [
              [".notes-list-row .note-title-anchor", innerWidth < 768 ? 20 : 21],
              [".notes-title-input", title], [".note-title-motion-face", title], [".notes-reading-title", title],
              [".notes-editor-surface .cm-scroller", 16], [".notes-editor-surface .cm-content", 16],
              [".note-reading-prose", 16], [".file-preview-surface [data-slot=dialog-title]", 26], [".file-pdf-page-count", 12],
            ];
            const measurements = expected.flatMap(([selector, normal]) => {
              const node = document.querySelector(selector);
              return node ? [{ selector, normalExpected: normal, after: parseFloat(getComputedStyle(node).fontSize) }] : [];
            });
            return { declarations: window.__editorialText200.declarations, installedAtDocumentEntry: Boolean(window.__editorialText200.installedAtDocumentEntry), measurements, bootstrap };
          });
          if (!textBootstrapInstalled && result.bootstrap) {
            // page.goto creates a new document. Install the SAME pure CSS at
            // document entry, before Notes/Files/CodeMirror's first layout;
            // do not re-enlarge an already painted standalone editor later.
            await context.addInitScript(({ css, declarations }) => {
              const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
              document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
              window.__editorialText200 = { declarations, installedAtDocumentEntry: true };
            }, result.bootstrap);
            textBootstrapInstalled = true;
          }
          row.textSizes.push({ label, declarations: result.declarations, measurements: result.measurements, preferenceInstalledAtDocumentEntry: result.installedAtDocumentEntry, bootstrapRegisteredForNextDocument: textBootstrapInstalled });
          for (const measurement of result.measurements) assert.ok(Math.abs(measurement.after - measurement.normalExpected * 2) < .1, `${label}/${measurement.selector} must have stable 200% actual text: ${JSON.stringify(measurement)}`);
        };
        const noOverflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} has no root horizontal overflow`);
        const aligned = async (label, reading = false, scope = null) => {
          const geometry = await page.evaluate(({ isReading, selector }) => {
            const host = selector ? document.querySelector(selector) : document;
            const title = host.querySelector(isReading ? ".notes-reading-title" : ".notes-title-input");
            const content = host.querySelector(isReading ? ".note-reading-prose" : ".notes-editor-surface .cm-content");
            return { title: title.getBoundingClientRect().left + parseFloat(getComputedStyle(title).paddingLeft), text: content.getBoundingClientRect().left + parseFloat(getComputedStyle(content).paddingLeft), titleWidth: title.getBoundingClientRect().width, textWidth: content.getBoundingClientRect().width };
          }, { isReading: reading, selector: scope });
          row.alignment.push({ label, ...geometry });
          assert.ok(geometry.titleWidth > 0 && geometry.textWidth > 0, `${label}: alignment measures the live, visible pane`);
          assert.ok(Math.abs(geometry.title - geometry.text) <= 2, `${label}: the title and actual prose/editor must share one axis ${JSON.stringify(geometry)}`);
        };
        const capture = async label => { await scaleText(label); await noOverflow(label); await page.screenshot({ path: `${output}/${label}-${width}-${mode}.png` }); };
        await page.goto(`${base}/mobile-native-e2e?scene=workspace-motion${scale}`);
        const list = page.locator(".notes-library");
        await list.getByRole("heading", { name: "全部笔记", exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(new URL(page.url()).searchParams.get("workspace"), "notes", "the fixture canonicalizes the Notes URL before taking a recovery checkpoint");
        const listRoute = await page.evaluate(() => location.pathname + location.search);
        await scaleText("notes-list"); await noOverflow("notes-list");
        const link = page.locator('a[data-note-result]').nth(5);
        await link.scrollIntoViewIfNeeded();
        const listTop = await list.evaluate(node => node.scrollTop);
        row.listRecovery = { sourceRoute: listRoute, before: listTop };
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
        await page.locator('.notes-editor-surface .cm-content[contenteditable="true"] .cm-line').first().waitFor();
        await scaleText("notes-editor");
        await aligned("notes-editor");
        const saved = await page.evaluate(sourceRoute => {
          const key = `life-of-hang:workspace:scroll:notes:list:${sourceRoute}`;
          const snapshot = sessionStorage.getItem(key);
          return { key, scrollTop: snapshot ? JSON.parse(snapshot).value?.scrollTop : null };
        }, listRoute);
        row.listRecovery.saved = saved;
        assert.ok(typeof saved.scrollTop === "number" && Math.abs(saved.scrollTop - listTop) < 3, "the real click saves the actual list position under the source URL");
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
        await aligned("notes-reading", true);
        if (mode === "text200") assert.equal(await page.locator(".note-reading-prose").evaluate(node => getComputedStyle(node).fontSize), "32px", "the real reading prose is doubled from 16px to 32px");
        await readerMode.getByRole("button", { name: "编辑", exact: true }).click();
        await page.getByRole("button", { name: "返回笔记列表", exact: true }).click();
        await list.waitFor();
        await scaleText("notes-list-return");
        row.listRecovery.returnRoute = await page.evaluate(() => location.pathname + location.search);
        row.listRecovery.after = await list.evaluate(node => node.scrollTop);
        assert.equal(row.listRecovery.returnRoute, listRoute, "the return tests the same canonical list URL and its recovery key");
        assert.ok(Math.abs(row.listRecovery.after - listTop) < 3, `return preserves list position ${JSON.stringify(row.listRecovery)}`);
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
            if (surface) { const bounds = surface.getBoundingClientRect(); window.__editorialImageFrames.push({ time: performance.now(), root: document.documentElement.scrollWidth, viewport: innerWidth, viewportHeight: innerHeight, bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }, transitionDuration: getComputedStyle(surface).transitionDuration, animations: surface.getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime, endTime: animation.effect?.getComputedTiming().endTime })), transform: getComputedStyle(surface).transform, x: surface.style.getPropertyValue("--file-origin-x"), scale: surface.style.getPropertyValue("--file-origin-scale-x") }); }
            if (performance.now() - began < 1100) requestAnimationFrame(frame); else window.__editorialImageDone = true;
          }; requestAnimationFrame(frame);
        });
        await photoLauncher.click();
        const dialog = page.getByRole("dialog");
        const waitForViewerRest = async () => {
          // Canvas readiness does not imply the enclosing CSS transition has
          // ended. Observe the actual shell animations, including reversal.
          await dialog.evaluate(async surface => {
            for (let pass = 0; pass < 4; pass++) {
              const animations = surface.getAnimations().filter(animation => animation.playState !== "finished");
              if (!animations.length) return;
              await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
            }
            if (surface.getAnimations().some(animation => animation.playState === "running")) throw new Error("Viewer motion did not reach its resting state");
          });
        };
        const viewerContained = async label => {
          await waitForViewerRest();
          const geometry = await dialog.evaluate(surface => {
            const box = node => { const bounds = node.getBoundingClientRect(); return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height }; };
            const style = getComputedStyle(surface);
            return { viewport: { width: innerWidth, height: innerHeight }, surface: box(surface), controls: [...surface.querySelectorAll('.file-preview-navigation button,[data-slot="dialog-close"]')].map(box), translate: style.translate, transform: style.transform, left: style.left, top: style.top };
          });
          row.viewerBounds.push({ label, ...geometry });
          for (const box of [geometry.surface, ...geometry.controls]) assert.ok(box.width > 0 && box.height > 0 && box.left >= -1 && box.top >= -1 && box.right <= geometry.viewport.width + 1 && box.bottom <= geometry.viewport.height + 1, `${label}: viewer and its navigation/close controls are inside the viewport ${JSON.stringify(geometry)}`);
        };
        await dialog.waitFor();
        await dialog.locator("img").waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] img')].every(image => image.complete && image.naturalWidth > 0));
        await page.waitForFunction(() => window.__editorialImageDone);
        row.imageFrames = await page.evaluate(() => window.__editorialImageFrames);
        assert.ok(row.imageFrames.every(frame => frame.root <= frame.viewport + 1), "image expansion stays contained");
        assert.ok(row.imageFrames.at(-1).scale, "the image viewer reads the actual source geometry");
        if (mode === "normal") assert.ok(new Set(row.imageFrames.map(frame => frame.transform)).size > 2, "the actual image viewer geometry changes across presented frames");
        await capture("file-photo");
        await viewerContained("photo-resting");
        const viewerShell = await dialog.elementHandle();
        await dialog.getByRole("button", { name: "上一文件", exact: true }).click();
        await dialog.getByRole("heading", { name: "示例资料 1 · Synthetic fixture", exact: true }).waitFor();
        await dialog.locator('canvas[data-pdf-rendered="true"]').waitFor();
        assert.ok(await viewerShell.evaluate(node => node === document.querySelector('[role="dialog"]')), "switching files preserves the actual viewer shell");
        await scaleText("file-switch-pdf"); await noOverflow("file-switch-pdf");
        await viewerContained("switched-pdf-resting");
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
        await viewerContained("pdf-resting-before-page-turn");
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
        const restingTransform = await dialog.evaluate(node => getComputedStyle(node).transform);
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await dialog.evaluate(node => getComputedStyle(node).transform), restingTransform, "reduced motion preserves the viewer's resting placement");
        assert.equal(await dialog.evaluate(node => node.getAnimations().filter(animation => animation.playState === "running").length), 0, "reduced motion leaves no moving viewer animation");
        await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
        assert.ok(!row.requests.some(request => request.path.endsWith("/download")), "viewing never downloads an original");
        await page.goto(`${base}/mobile-native-e2e?scene=workbench`);
        await page.getByTestId("workbench-fixture").waitFor();
        await page.locator('.workbench-main-pane .cm-content[contenteditable="true"] .cm-line').first().waitFor();
        await scaleText("standalone-editor");
        await aligned("standalone-editor", false, ".workbench-main-pane");
        const mainEditor = await page.locator(".workbench-main-pane .cm-editor").elementHandle();
        await page.locator('[data-workbench-record^="note:"]').getByRole("button", { name: /更多操作/ }).click();
        await page.getByRole("menuitem", { name: "放到参考区", exact: true }).click();
        await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
        await page.locator('.workbench-reference-pane .cm-content[contenteditable="true"] .cm-line').first().waitFor();
        await scaleText("dual-reference-editor");
        await aligned("dual-reference-editor", false, ".workbench-reference-pane");
        if (width < 768) await page.getByRole("button", { name: "主区", exact: true }).click();
        await aligned("warm-main-editor", false, ".workbench-main-pane");
        assert.ok(await mainEditor.evaluate(node => node.isConnected), "the warm main editor survives opening a second note");
        await capture("notes-dual");
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
