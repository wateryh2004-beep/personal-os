/* eslint-disable @typescript-eslint/no-require-imports -- Isolated CI Chromium; all writes blocked. */
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { chromium } = require('playwright');
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
assert.match(base, /^http:\/\/127\.0\.0\.1:/);
const out = 'test-results/notes-continuity';
async function viewportAnchor(page) {
  return page.locator('.cm-scroller').evaluate(pane => {
    const top = pane.getBoundingClientRect().top;
    const line = [...pane.querySelectorAll('.cm-line[data-source-line]')].find(node => node.getBoundingClientRect().bottom > top + 1);
    return { line: Number(line?.dataset.sourceLine), offset: line ? top - line.getBoundingClientRect().top : 0, cursor: document.querySelector('[data-status="cursor"]')?.textContent };
  });
}
(async () => {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true }); const evidence = [];
  let activePage;
  try {
    for (const width of [360, 390, 768, 1440]) {
      const row = { width, requests: [], errors: [], samples: [] }; evidence.push(row);
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', recordVideo: { dir: out, size: { width, height: 900 } } });
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== base) return route.abort();
        if (req.method() !== 'GET') return route.abort(); // Intentional failed-save fixture. Never submits synthetic data.
        if (req.headers()['next-router-prefetch']) return route.abort();
        if (url.pathname.startsWith('/api/')) { row.requests.push(url.pathname); return route.fulfill({ status: 503, json: { error: 'Synthetic offline boundary' } }); }
        return route.continue();
      });
      const page = await context.newPage(); activePage = page;
      page.on('pageerror', error => row.errors.push(error.message));
      await page.goto(`${base}/mobile-native-e2e?scene=note-continuity`);
      const content = page.locator('.cm-content[contenteditable=true]');
      const mode = page.getByRole('group', { name: '笔记阅读方式' });
      await content.waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      assert.ok(!row.requests.some(p => /\/details$|\/ai\/preferences/.test(p)), 'closed inspector and AI do not read data');
      // Move into the long document using actual keyboard input, no view replacement.
      await content.press('Control+End'); await content.press('ArrowUp');
      await page.waitForTimeout(250); // CodeMirror completes its measured keyboard scroll before the baseline.
      const before = await page.locator('.cm-scroller').evaluate(el => el.scrollTop);
      assert.ok(before > 1000, 'long document is scrolled');
      const beforeAnchor = await viewportAnchor(page); row.beforeAnchor = beforeAnchor;
      await mode.getByRole('button', { name: '阅读', exact: true }).click();
      await page.locator('.note-reading-pane').waitFor({ state: 'visible' });
      const readerTop = await page.locator('.note-reading-pane').evaluate(el => el.scrollTop);
      assert.ok(readerTop > 1000, 'reading opens near the current source paragraph');
      await mode.getByRole('button', { name: '编辑', exact: true }).click();
      await content.waitFor({ state: 'visible' });
      await page.waitForTimeout(200);
      assert.ok(Math.abs(await page.locator('.cm-scroller').evaluate(el => el.scrollTop) - before) < 100, 'round trip preserves editor viewport');
      // Warm navigation restores a cached body while the 1500ms route read is pending.
      await page.getByRole('button', { name: '打开练习 2', exact: true }).click();
      await page.getByRole('textbox', { name: '笔记标题', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('[aria-label="笔记标题"]')?.value.includes('2'));
      for (let sample = 0; sample < 3; sample++) {
        const wanted = sample % 2 ? '2' : '1';
        await page.getByRole('button', { name: `打开练习 ${wanted}`, exact: true }).click();
        await page.waitForFunction(value => document.querySelector('[aria-label="笔记标题"]')?.value.includes(value), wanted);
        const duration = await page.evaluate(() => performance.now() - performance.getEntriesByName('continuity-open').at(-1).startTime);
        row.samples.push(duration); assert.ok(duration <= 200, `warm body restored within budget: ${duration}`);
      }
      await content.waitFor({ state: 'visible' }); await page.waitForTimeout(250);
      const warmTop = await page.locator('.cm-scroller').evaluate(el => el.scrollTop);
      const warmAnchor = await viewportAnchor(page); row.warmAnchor = warmAnchor; row.rawScroll = { before, warmTop };
      // Virtual scrollTop changes when unseen line heights are re-estimated on remount.
      // Compare the actual source line, its screen offset and exact caret instead.
      assert.equal(warmAnchor.line, beforeAnchor.line, 'cached note restores the same visible source line');
      assert.equal(warmAnchor.cursor, beforeAnchor.cursor, 'cached note restores the exact caret');
      assert.ok(Math.abs(warmAnchor.offset - beforeAnchor.offset) < 20, 'cached source line retains its screen offset within 20px');
      await page.screenshot({ path: `${out}/editor-${width}.png` });
      // Long-doc typing, failed autosave, dirty remote revision and restore after leaving.
      await content.press('Control+End'); await content.press('End');
      const inputStarted = Date.now(); await content.pressSequentially(' synthetic typing continuity', { delay: 12 });
      row.typingMs = Date.now() - inputStarted;
      await page.getByRole('button', { name: '模拟远端更新', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '检测到其他设备修改' }).waitFor();
      await page.waitForTimeout(1000);
      assert.ok(await page.getByRole('alert').filter({ hasText: '检测到其他设备修改' }).isVisible(), 'late failed autosave cannot replace a known revision conflict');
      await mode.getByRole('button', { name: '阅读', exact: true }).click();
      assert.ok((await page.locator('.note-reading-pane').innerText()).includes('synthetic typing continuity'), 'dirty draft survives background revision');
      assert.ok(!(await page.locator('.note-reading-pane').innerText()).includes('远端新版本'), 'dirty draft is not silently overwritten');
      await page.screenshot({ path: `${out}/reading-${width}.png` });
      await page.getByRole('button', { name: '打开笔记详情', exact: true }).click();
      await page.getByRole('button', { name: '重试读取', exact: true }).waitFor();
      assert.ok(row.requests.some(p => p.endsWith('/details')), 'inspector loads on intent and reports offline failure');
      await page.keyboard.press('Escape');
      assert.ok(await mode.isVisible(), 'Esc returns to document');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.screenshot({ path: `${out}/text-200-${width}.png` });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow at 200% text zoom');
      assert.deepEqual(row.errors, []);
      const video = page.video(); await context.close(); await video.saveAs(`${out}/flow-${width}-reduce.webm`);
    }
    // Continuous interrupt/reverse clip with normal motion as a distinct run.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', recordVideo: { dir: out, size: { width: 1440, height: 900 } } });
    await context.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'Synthetic offline boundary' } }));
    const page = await context.newPage(); await page.goto(`${base}/mobile-native-e2e?scene=note-continuity`);
    await page.locator('.cm-content').waitFor();
    const mode = page.getByRole('group', { name: '笔记阅读方式' });
    for (let i = 0; i < 3; i++) { await mode.getByRole('button', { name: '阅读', exact: true }).click(); await mode.getByRole('button', { name: '编辑', exact: true }).click(); }
    await page.screenshot({ path: `${out}/normal-motion-desktop.png` });
    const video = page.video(); await context.close(); await video.saveAs(`${out}/flow-normal-desktop.webm`);
    await writeFile(`${out}/evidence.json`, JSON.stringify({ scope: 'Next production build, synthetic 180-section documents; 1500ms delayed route reconciliation, cloud CI Chromium. Typing elapsed includes 12ms artificial delay; not production latency. 200% root text size, not native browser zoom.', evidence }, null, 2));
    console.log('PASS: note body cache, paragraph continuity, draft/conflict, long typing, lazy reads, 360/390/768/1440 screenshots, motion and text-zoom evidence');
  } catch (error) {
    await activePage?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    await writeFile(`${out}/failure.json`, JSON.stringify(evidence, null, 2)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
