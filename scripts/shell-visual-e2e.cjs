/* eslint-disable @typescript-eslint/no-require-imports -- Remote CI only; local browser inspection uses CUA. */
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { chromium } = require('playwright');
const base = process.env.E2E_BASE_URL;
assert.match(base || '', /^http:\/\/127\.0\.0\.1:/, 'Only an isolated synthetic build may be tested');
const out = 'test-results/shell-visual';
async function settle(page, selector) {
  await page.locator(selector).evaluate(async node => {
    const finite = node.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity);
    await Promise.allSettled(finite.map(animation => animation.finished));
  });
}
async function contained(page, label) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(geometry.scroll <= geometry.width + 1, `${label}: root ${JSON.stringify(geometry)}`);
}
(async () => {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const evidence = [];
  let activePage;
  try {
    for (const width of [360, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, recordVideo: { dir: `${out}/video`, size: { width: Math.min(width, 1100), height: 900 } }, hasTouch: width < 768 });
      let page;
      const row = { width, checks: [], errors: [], navigation: [] }; evidence.push(row);
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      try {
        await context.route('**/*', route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) return route.abort();
          if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Synthetic network boundary; fixture GETs only.' } });
          return route.continue();
        });
        page = await context.newPage(); activePage = page;
        page.on('pageerror', error => row.errors.push(error.message));
        await page.goto(`${base}/mobile-native-e2e?scene=workspace-motion`);
        await page.getByTestId('workspace-motion-fixture').waitFor();
        const navigation = page.getByRole('navigation', { name: width < 768 ? '底部导航' : '主导航', exact: true });
        for (const [name, workspace, direction] of [['职业', 'career', 'navigation-forward'], ['今日', 'today', 'navigation-backward']]) {
          await navigation.getByRole('link', { name, exact: true }).click();
          // The previous route has the same button label. Await destination
          // commit and destination-owned DOM, never the previous visible probe.
          await page.waitForURL(url => url.searchParams.get('workspace') === workspace);
          const destination = page.locator(`[data-navigation-probe="${workspace}"]`);
          const probe = destination.getByRole('button', { name: '验证即时操作', exact: true });
          await probe.waitFor({ state: 'visible' });
          const frame = await probe.evaluate(node => {
            const bounds = node.getBoundingClientRect();
            const surface = node.closest('.workspace-live-surface');
            return { workspace: node.closest('[data-navigation-probe]').dataset.navigationProbe, url: location.pathname + location.search, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, direction: surface.dataset.navigationMotion, animations: surface.getAnimations().map(animation => ({ playState: animation.playState, currentTime: animation.currentTime })) };
          });
          assert.equal(frame.workspace, workspace);
          assert.equal(frame.direction, direction);
          assert.ok(frame.animations.some(animation => animation.playState === 'running'), 'probe must be clicked during the real movement, without waiting for stability');
          // Raw trusted pointer input intentionally bypasses locator.click's stability wait.
          await page.mouse.click(frame.x, frame.y);
          assert.equal(await destination.getByTestId('navigation-immediate-count').textContent(), '1', 'the first pointer click during navigation must work');
          row.navigation.push(frame);
          await contained(page, `immediate-navigation-${name}-${width}`);
        }
        row.checks.push('forward-backward-motion-running-at-click', 'first-body-click-works');
        const launcher = page.getByRole('button', { name: '搜索 Personal OS', exact: true });
        await launcher.click();
        const dialog = page.getByRole('dialog', { name: '搜索', exact: true });
        const input = dialog.getByPlaceholder('搜索 Personal OS 或输入命令…', { exact: true });
        await input.fill('阅读');
        const picker = dialog.getByRole('combobox', { name: '预览内容', exact: true });
        await picker.waitFor();
        assert.equal(await dialog.locator('.command-result-preview').count(), 0, 'opening search does not mount a reader');
        const value = await picker.locator('option').nth(1).getAttribute('value');
        await picker.selectOption(value);
        const previewTrigger = dialog.getByRole('button', { name: '预览所选', exact: true });
        if (width < 768) {
          const rect = await previewTrigger.boundingBox();
          assert.ok(rect.height >= 44, 'touch preview has a real 44px target');
          assert.ok(await picker.evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 16), 'touch selector avoids input zoom');
        }
        await previewTrigger.click();
        const preview = dialog.getByRole('complementary', { name: '搜索结果预览', exact: true });
        await preview.locator('.workbench-markdown').waitFor();
        await settle(page, '.global-command-surface');
        assert.equal(await input.inputValue(), '阅读', 'preview preserves query');
        assert.equal(await dialog.locator('.cm-editor').count(), 0, 'search preview does not mount an autosaving editor');
        await contained(page, `search-preview-${width}`);
        await page.screenshot({ path: `${out}/search-preview-${width}.png` });
        const next = await picker.locator('option').nth(2).getAttribute('value');
        await picker.selectOption(next);
        await page.waitForFunction(() => document.querySelector('.command-result-preview h2')?.textContent?.includes('阅读记录 05'));
        const openLink = preview.getByRole('link', { name: '在主区打开 ↗', exact: true });
        await openLink.focus(); await page.keyboard.press('Escape');
        await preview.waitFor({ state: 'detached' });
        assert.ok(await dialog.getByRole('button', { name: '预览所选', exact: true }).evaluate(node => node === document.activeElement), 'preview Escape returns focus without closing search');
        await input.focus(); await input.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.ok(await launcher.evaluate(node => node === document.activeElement), 'search Escape restores launch focus');
        row.checks.push('explicit-touch-preview', 'one-protected-readonly-reader', 'query-preserved', 'selection-replaced', 'nested-Escape-focus');
        // Keep the real Dialog/useMobileBackLayer lifecycle while the fixture maps
        // the shared navigation event to an isolated App Router note destination.
        await navigation.getByRole('link', { name: '笔记', exact: true }).click();
        await page.locator('.notes-library').waitFor();
        await launcher.click(); await input.fill('阅读'); await picker.waitFor(); await picker.selectOption(value);
        await dialog.getByRole('button', { name: '预览所选', exact: true }).click();
        await preview.locator('.workbench-markdown').waitFor();
        if (width < 768) assert.ok(await page.evaluate(() => String(history.state?.__personalOsMobileLayer).startsWith('dialog:')), 'real mobile dialog owns a history marker');
        await preview.getByRole('link', { name: '在主区打开 ↗', exact: true }).click();
        await page.waitForURL(url => url.searchParams.get('document') === value.slice('result:'.length));
        await page.locator('.notes-editor-surface').waitFor();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => history.state?.__personalOsMobileLayer), undefined, 'navigation consumed the old dialog marker');
        await page.goBack();
        await page.waitForURL(url => url.searchParams.get('workspace') === 'notes' && !url.searchParams.has('document'));
        await page.locator('.notes-library').waitFor();
        assert.equal(await page.locator('.global-command-surface').count(), 0, 'Back returns to list with search dismissed');
        row.checks.push('preview-Link-real-route', 'mobile-marker-released-before-dismiss', 'Back-to-list-search-closed');
        // Dynamic reduced motion and true computed text enlargement on the live search.
        await launcher.click(); await input.fill('阅读'); await picker.waitFor(); await picker.selectOption(value);
        await dialog.getByRole('button', { name: '预览所选', exact: true }).click(); await preview.locator('.workbench-markdown').waitFor();
        await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
        await page.evaluate(() => {
          const sizes = [...document.querySelectorAll('.global-command-surface *')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
          for (const [node, size] of sizes) if (node instanceof HTMLElement && Number.isFinite(size)) node.style.setProperty('font-size', `${size * 2}px`, 'important');
        });
        await contained(page, `search-200-reduced-${width}`);
        assert.equal(await preview.evaluate(node => getComputedStyle(node).animationName), 'none');
        await page.screenshot({ path: `${out}/search-accessibility-${width}.png` });
        await dialog.getByRole('button', { name: '关闭', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
        row.checks.push('200%-computed-search-text', 'dynamic-reduced-motion', 'forced-colors', 'close-reachable');
        if (width >= 768) {
          await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
          await page.goto(`${base}/mobile-native-e2e?scene=workbench`);
          await page.getByTestId('workbench-fixture').waitFor();
          const editor = await page.locator('.workbench-main-pane .cm-editor').elementHandle();
          const referenceRecord = page.locator('[data-workbench-record^="note:"]');
          await referenceRecord.getByRole('button', { name: /更多操作/ }).click();
          await page.getByRole('menuitem', { name: '放到参考区', exact: true }).click();
          const divider = page.getByRole('separator', { name: '调整工作区比例', exact: true });
          await divider.waitFor(); await settle(page, '.workbench-layout');
          const start = Number(await divider.getAttribute('aria-valuenow'));
          await divider.focus(); await divider.press('ArrowLeft');
          assert.equal(Number(await divider.getAttribute('aria-valuenow')), start + 2);
          await page.getByRole('button', { name: '交换位置', exact: true }).click();
          await divider.focus(); await divider.press('ArrowRight');
          assert.equal(Number(await divider.getAttribute('aria-valuenow')), start + 4);
          await settle(page, '.workbench-layout');
          const bounds = await divider.boundingBox();
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 60); await page.mouse.down();
          await page.mouse.move(bounds.x + 35, bounds.y + 60, { steps: 8 });
          assert.ok(await page.locator('.workbench-layout').evaluate(node => node.hasAttribute('data-resizing')));
          await page.keyboard.press('Escape'); await page.mouse.up();
          assert.equal(await divider.getAttribute('aria-valuenow'), String(start + 4), 'Escape restores gesture start');
          assert.ok(await editor.evaluate(node => node.isConnected), 'resize and swap preserve main editor identity');
          await contained(page, `divider-${width}`); await page.screenshot({ path: `${out}/divider-${width}.png` });
          row.checks.push('divider-keyboard-direction', 'pointer-follow-cancel', 'editor-identity');
        }
        assert.deepEqual(row.errors, []);
      } catch (error) {
        row.failure = String(error);
        if (page && !page.isClosed()) await page.screenshot({ path: `${out}/failure-${width}.png` }).catch(() => {});
        throw error;
      } finally {
        await context.tracing.stop({ path: `${out}/trace-${width}.zip` });
        if (page) await page.close();
        await context.close();
      }
    }
    console.log('PASS: shell visual search, protected previews, touch/keyboard, divider, reduced motion, 200% text, focus, containment.');
  } catch (error) {
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    await writeFile(`${out}/evidence.json`, JSON.stringify(evidence, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
