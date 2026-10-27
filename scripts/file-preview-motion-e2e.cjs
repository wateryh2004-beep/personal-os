/* Complete real viewer trajectories, isolated remote CI only. */
const base = process.env.E2E_BASE_URL;
const output = "test-results/file-preview-motion", evidence = [];
(async () => {
  const { createRequire } = await import("node:module");
  const [{ default: assert }, fs, { chromium }, { default: fixtures }] = await Promise.all([
    import("node:assert/strict"), import("node:fs/promises"), import(createRequire(__filename).resolve("playwright")).then(module => module.default ?? module), import("./fixtures/pdf-cover-fixtures.cjs"),
  ]);
  assert.ok(process.env.CI && /^http:\/\/127\.0\.0\.1:\d+$/.test(base || ""));
  await fs.mkdir(output, { recursive: true }); const browser = await chromium.launch();
  const pdf = fixtures.syntheticPdf(); let active;
  try {
    for (const viewport of [{ width: 360, height: 600 }, { width: 390, height: 640 }, { width: 768, height: 600 }, { width: 1440, height: 900 }]) for (const mode of ["normal", "reduced", "forced"]) {
      const label = `${viewport.width}x${viewport.height}-${mode}`, row = { label, frames: [], errors: [] }; evidence.push(row);
      const context = await browser.newContext({ viewport, reducedMotion: mode === "reduced" ? "reduce" : "no-preference", forcedColors: mode === "forced" ? "active" : "none", recordVideo: { dir: `${output}/video`, size: viewport } });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      try {
        await context.route("**/*", route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== base) return route.abort();
          if (!['GET', 'HEAD'].includes(request.method())) return route.fulfill({ status: 503, json: { error: "synthetic_write_blocked" } });
          if (/^\/api\/files\/e2e-file-\d+\/preview$/.test(url.pathname)) return route.fulfill({ contentType: "application/pdf", body: request.method() === "HEAD" ? Buffer.alloc(0) : pdf, headers: { "Content-Length": String(pdf.length), "Accept-Ranges": "bytes", "X-Reading-Source-Version": "71000000-0000-4000-8000-000000000001" } });
          if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "synthetic_read_unavailable" } });
          return route.continue();
        });
        const page = await context.newPage(); active = page; page.on("pageerror", error => row.errors.push(error.message));
        await page.goto(`${base}/mobile-native-e2e?scene=files`);
        const launcher = page.getByRole("button", { name: "预览 示例资料 1 · Synthetic fixture", exact: true });
        await launcher.scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          window.__previewMotionFrames = []; window.__previewMotionStop = false;
          const sample = () => {
            const surface = document.querySelector(".file-preview-surface");
            if (surface) {
              const rect = node => { const b = node.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
              window.__previewMotionFrames.push({ state: surface.dataset.state, viewport: { width: innerWidth, height: innerHeight }, surface: rect(surface), controls: [...surface.querySelectorAll('[data-slot="dialog-close"],.file-preview-navigation button')].map(rect), transform: getComputedStyle(surface).transform, running: surface.getAnimations().filter(animation => animation.playState === "running").length });
            }
            if (!window.__previewMotionStop) requestAnimationFrame(sample);
          }; requestAnimationFrame(sample);
        });
        await launcher.click(); const dialog = page.getByRole("dialog"); await dialog.waitFor();
        if (mode !== "reduced") {
          await page.waitForFunction(() => document.querySelector(".file-preview-surface")?.getAnimations().some(animation => animation.playState === "running"));
          row.interruptedRunning = await dialog.evaluate(surface => surface.getAnimations().some(animation => animation.playState === "running"));
          assert.equal(row.interruptedRunning, true, "Escape interrupts a genuinely moving viewer");
        }
        await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
        await page.waitForFunction(node => document.activeElement === node, await launcher.elementHandle());
        await launcher.click(); await dialog.waitFor(); await dialog.locator('canvas[data-pdf-rendered="true"]').waitFor();
        await dialog.evaluate(async surface => { await Promise.all(surface.getAnimations().map(animation => animation.finished.catch(() => {}))); });
        await page.screenshot({ path: `${output}/resting-${label}.png` });
        if (mode === "normal") { await page.emulateMedia({ reducedMotion: "reduce" }); assert.equal(await dialog.evaluate(surface => surface.getAnimations().filter(animation => animation.playState === "running").length), 0); }
        await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
        row.frames = await page.evaluate(() => { window.__previewMotionStop = true; return window.__previewMotionFrames; });
        assert.ok(row.frames.length >= 3, "the evidence includes actual presented geometry");
        for (const frame of row.frames) for (const bounds of [frame.surface, ...frame.controls]) assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.left >= -1 && bounds.top >= -1 && bounds.right <= frame.viewport.width + 1 && bounds.bottom <= frame.viewport.height + 1, `${label}/${frame.state}: ${JSON.stringify(bounds)}`);
        if (mode !== "reduced") assert.ok(new Set(row.frames.map(frame => frame.transform)).size > 2, "space motion remains visibly active through interruption/reopen");
        assert.deepEqual(row.errors, []);
      } catch (error) { await active?.screenshot({ path: `${output}/failure-${label}.png` }).catch(() => {}); throw error; }
      finally { await context.tracing.stop({ path: `${output}/trace-${label}.zip` }); await context.close(); }
    }
    await fs.writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  } catch (error) { await fs.writeFile(`${output}/failure.json`, JSON.stringify({ error: error.message, evidence }, null, 2)); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
