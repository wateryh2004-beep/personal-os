/* eslint-disable @typescript-eslint/no-require-imports -- Isolated CI Chromium; synthetic data, writes blocked. */
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { chromium } = require('playwright');
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
assert.match(base, /^http:\/\/127\.0\.0\.1:/);
const out = 'test-results/notes-navigation';
(async () => {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = []; let activePage;
  try {
    for (const width of [360, 390, 768, 1440]) {
      const row = { width, errors: [], checks: [], navigation: [] }; evidence.push(row);
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference', recordVideo: { dir: out, size: { width, height: 900 } } });
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== base || req.method() !== 'GET') return route.abort();
        if (req.headers()['next-router-prefetch']) return route.abort();
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Synthetic offline boundary' } });
        if (/^\/notes\/[0-9a-f-]{36}$/.test(url.pathname)) row.navigation.push(url.pathname);
        return route.continue();
      });
      const page = await context.newPage(); activePage = page;
      page.on('pageerror', error => row.errors.push(error.message));
      await page.goto(`${base}/mobile-native-e2e?scene=note-continuity`);
      const content = page.locator('.cm-content[contenteditable=true]');
      const trigger = page.getByRole('button', { name: '目录', exact: true });
      const panel = page.getByRole('dialog', { name: '笔记目录', exact: true });
      const input = panel.getByRole('textbox', { name: '筛选目录', exact: true });
      await content.waitFor({ state: 'visible' }); await page.evaluate(() => document.fonts.ready);
      await trigger.click(); await input.waitFor({ state: 'visible' });
      assert.ok(await input.evaluate(el => el === document.activeElement), 'opening focuses chapter search');
      await input.fill('第 120 节');
      assert.equal(await panel.locator('[data-outline-index]').count(), 1, 'filters 180 headings');
      await input.press('ArrowDown');
      assert.ok(await panel.getByRole('button', { name: '第 120 节', exact: true }).evaluate(el => el === document.activeElement));
      await page.screenshot({ path: `${out}/chapter-filter-${width}.png` });
      await page.keyboard.press('Enter');
      await panel.waitFor({ state: 'hidden' });
      assert.ok(await content.evaluate(el => el === document.activeElement), 'jump focuses editor, not trigger');
      assert.match(await page.locator('[data-status=cursor]').innerText(), /第 477 行/);
      await trigger.click(); await input.waitFor({ state: 'visible' });
      assert.equal(await input.inputValue(), '', 'reopen resets search');
      await page.waitForFunction(() => Number(document.querySelector('[data-outline-index][aria-current=location]')?.dataset.outlineIndex) > 100);
      row.checks.push('filtered-source-target-and-current-scrolled-chapter');
      await input.fill('不存在的章节');
      assert.equal(await panel.locator('[data-outline-index]').count(), 0);
      assert.ok(await panel.getByText('没有匹配的章节。换一个关键词，或清空筛选。', { exact: true }).isVisible());
      await panel.getByRole('button', { name: '清空目录筛选', exact: true }).click();
      assert.equal(await panel.locator('[data-outline-index]').count(), 180);
      await input.press('ArrowUp'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowUp');
      assert.ok(await input.evaluate(el => el === document.activeElement), 'up from first chapter returns to search');
      await input.press('Escape'); await panel.waitFor({ state: 'hidden' });
      assert.ok(await trigger.evaluate(el => el === document.activeElement), 'Escape restores trigger');
      // Rapid reversal uses actual pointer events, then outside dismissal and keyboard reentry.
      await trigger.click(); await page.waitForTimeout(70); await trigger.click(); await page.waitForTimeout(60); await trigger.click();
      await input.waitFor({ state: 'visible' });
      await page.getByRole('textbox', { name: '笔记标题', exact: true }).click(); await panel.waitFor({ state: 'hidden' });
      assert.ok(await page.getByRole('textbox', { name: '笔记标题', exact: true }).evaluate(el => el === document.activeElement), 'outside target keeps focus');
      row.checks.push('escape-outside-and-rapid-reversal-focus');
      await trigger.click(); await input.waitFor({ state: 'visible' });
      await page.setViewportSize({ width, height: 568 });
      const rect = await panel.boundingBox(); assert.ok(rect.y >= -1 && rect.y + rect.height <= 569, `short viewport bounds: ${JSON.stringify(rect)}`);
      await input.fill('第 180 节'); await input.press('Enter'); await panel.waitFor({ state: 'hidden' });
      await page.setViewportSize({ width, height: 900 });
      // Enlarge the actual px-based glyphs/line boxes, rather than merely root rem.
      await trigger.click(); await input.waitFor({ state: 'visible' });
      const zoom = await page.addStyleTag({ content: '.note-outline-surface input {font-size:32px!important;min-height:64px!important}.note-outline-surface .note-outline-item {font-size:26px!important;line-height:40px!important}.note-outline-surface p {font-size:24px!important;line-height:32px!important}' });
      assert.ok(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 32));
      await input.fill('第 180 节');
      assert.ok(await panel.getByRole('button', { name: '第 180 节', exact: true }).isVisible());
      await page.screenshot({ path: `${out}/chapter-text-200-${width}.png` });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await input.press('Enter'); await panel.waitFor({ state: 'hidden' }); await zoom.evaluate(el => el.remove());
      row.checks.push('short-screen-and-actual-200-percent-chapter-text');
      await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
      await trigger.click(); await input.waitFor({ state: 'visible' });
      const motion = await panel.evaluate(el => ({ transform: getComputedStyle(el).transform, duration: getComputedStyle(el).transitionDuration }));
      assert.equal(motion.transform, 'none');
      assert.ok(motion.duration.split(',').every(s => parseFloat(s) < 0.01));
      await page.screenshot({ path: `${out}/chapter-reduced-forced-${width}.png` });
      await input.press('Escape'); await panel.waitFor({ state: 'hidden' });
      await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
      const cursorBeforeDrawer = await page.locator('[data-status=cursor]').innerText();
      if (width < 768) await page.getByRole('button', { name: '打开笔记文件', exact: true }).click();
      const navigation = width < 768 ? page.getByRole('dialog', { name: '笔记文件', exact: true }) : page.locator('.notes-navigator-panel');
      const quick = navigation.getByRole('textbox', { name: '快速打开', exact: true });
      await quick.fill('练习');
      if (width < 768) {
        assert.ok(await quick.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16 && el.getBoundingClientRect().height >= 44));
        for (const link of await navigation.locator('[aria-label="快速打开结果"] a').all()) assert.ok((await link.boundingBox()).height >= 44);
      }
      await quick.press('ArrowDown');
      const results = navigation.locator('[aria-label="快速打开结果"] a');
      assert.ok(await results.nth(0).evaluate(el => el === document.activeElement));
      await page.keyboard.press('End'); assert.ok(await results.nth(1).evaluate(el => el === document.activeElement));
      await page.keyboard.press('Home'); await page.keyboard.press('ArrowUp'); assert.ok(await quick.evaluate(el => el === document.activeElement));
      await page.screenshot({ path: `${out}/quick-open-${width}.png` });
      await quick.press('Escape'); assert.equal(await quick.inputValue(), '');
      if (width < 768) {
        await quick.press('Escape'); await navigation.waitFor({ state: 'hidden' });
        assert.equal(await page.locator('[data-status=cursor]').innerText(), cursorBeforeDrawer, 'drawer cancellation preserves caret');
        await page.getByRole('button', { name: '打开笔记文件', exact: true }).click();
      }
      await quick.fill('没有这篇笔记'); assert.ok(await navigation.getByText('没有匹配的笔记。', { exact: false }).isVisible());
      await navigation.getByRole('button', { name: '清空切换搜索', exact: true }).click();
      assert.ok(await quick.evaluate(el => el === document.activeElement));
      await quick.fill('练习 2'); await quick.press('Enter');
      await page.waitForURL(/\/login/); // Actual owner route denies the anonymous synthetic browser.
      assert.ok(row.navigation.includes('/notes/10000000-0000-4000-8000-000000000002'), 'Enter follows the real note link');
      row.checks.push('quick-open-real-link-keyboard-empty-clear-and-drawer-cancel');
      assert.deepEqual(row.errors, []);
      await context.close(); await page.video().saveAs(`${out}/flow-${width}.webm`);
    }
    await writeFile(`${out}/evidence.json`, JSON.stringify({ scope: 'Next production build, synthetic 180-section document. All writes blocked. Real local note navigation is checked through its anonymous login boundary. Actual chapter glyphs doubled; not native browser zoom. Normal-motion recordings and runtime reduced-motion/forced-colors checks.', evidence }, null, 2));
    console.log('PASS: notes quick open, mobile drawer continuity, searchable outline, focus/reversal, short screen, 200% chapter text, reduced motion and forced colors at 360/390/768/1440');
  } catch (error) { if (activePage) await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {}); await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(error), evidence }, null, 2)); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
