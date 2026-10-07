/* eslint-disable @typescript-eslint/no-require-imports -- Loopback synthetic multipart browser regression. */
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4192';
const output = 'test-results/multipart';
const evidence = {
  scope: 'Production uploadMultipartFile client + FileResumableUploads component, with loopback in-memory provider endpoints',
  excludedProofs: ['No real R2 requests, bucket CORS/permission proof or presigned-provider acceptance', 'No immutable sealed-copy/final publication proof; covered separately by service/SQL tests and authorized live-R2 acceptance'],
  viewports: [],
};
const interruption = '分片上传中断；已完成的分片已保留，可重新选择原文件继续。';
const wrongFile = '所选文件与未完成上传不一致，请重新选择同一份原文件。';
const stats = async page => (await page.request.get(`${base}/fixture/stats`)).json();
async function reselect(page, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择原文件继续', exact: true }).click();
  await (await chooser).setFiles(file);
}
async function capture(page, record, state) {
  const panel = page.getByRole('region', { name: '未完成上传', exact: true });
  await panel.waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('[aria-label="未完成上传"]');
    const main = document.querySelector('main');
    const rect = panel.getBoundingClientRect();
    const overflow = [...main.querySelectorAll('*')].filter(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.display !== 'none' &&
        (box.left < -1 || box.right > innerWidth + 1);
    }).map(element => ({ tag: element.tagName, text: (element.textContent ?? '').trim().slice(0, 100) }));
    return {
      viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
      panel: { left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      panelText: panel.textContent.trim(), wrapperMessage: document.querySelector('[data-upload-feedback]').textContent,
      overflow,
    };
  });
  const screenshot = `${record.width}-${state}.png`;
  const checkpoint = { state, screenshot, layout, provider: await stats(page) };
  record.states.push(checkpoint);
  // Retain the failing frame too; do not make a failed overflow check destroy evidence.
  await page.screenshot({ path: `${output}/${screenshot}`, fullPage: true });
  await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  assert.ok(layout.panel.height > 50 && (layout.panelText.includes('完成保存') || layout.panelText.includes('选择原文件继续')), `${state} must retain a meaningful real resume component`);
  assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `${record.width}px ${state}: document overflows`);
  assert.deepEqual(layout.overflow, [], `${record.width}px ${state}: visible content exceeds viewport`);
}

(async () => {
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/README.txt`, [
    'Multipart browser visual evidence',
    'Each viewport (360, 390, 1440) retains interrupted, refreshed resume-ready, wrong-file error, assembled/save-ready, and cancelled-state screenshots.',
    'Screenshots use the real FileResumableUploads component and uploadMultipartFile client. Fixture captions are explicitly test-only evidence.',
    'The uploaded state means provider parts were assembled; it does not claim immutable sealed publication or saved production originals.',
    'evidence.json includes overflow geometry, HTTP outcomes, authoritative confirmed parts, attempt counts, session identity and cancellation isolation.',
    'Service/SQL tests separately cover sealed verification and atomic publication. Real R2, deployed presigning/CORS, and permissions are not tested here.',
  ].join('\n'));
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'],
  } : {}) });
  try {
    for (const width of [360, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      const record = { width, states: [], network: [], pageErrors: [], assertions: {} };
      evidence.viewports.push(record);
      page.on('pageerror', error => record.pageErrors.push(error.message));
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.pathname === '/api/files/multipart' || url.pathname.startsWith('/part/')) {
          record.network.push({ method: response.request().method(), path: url.pathname, status: response.status() });
        }
      });
      page.on('requestfailed', request => {
        const url = new URL(request.url());
        if (url.pathname === '/api/files/multipart' || url.pathname.startsWith('/part/')) {
          record.network.push({ method: request.method(), path: url.pathname, failure: request.failure()?.errorText });
        }
      });
      try {
        const reset = await page.request.get(`${base}/fixture/reset`);
        assert.equal(reset.status(), 200);
        await page.goto(base);
        const filename = `合成_长期文件管理_跨设备恢复与断点续传验证_${width}.pdf`;
        const file = { name: filename, mimeType: 'application/pdf', buffer: Buffer.alloc(17 * 1024 * 1024, 7) };
        await page.getByLabel('新上传', { exact: true }).setInputFiles(file);
        await page.getByText(interruption, { exact: true }).waitFor();
        await page.getByRole('button', { name: '选择原文件继续', exact: true }).waitFor();
        const interrupted = await stats(page);
        const originalSession = interrupted.sessions.find(session => session.filename === filename);
        assert.ok(originalSession.parts.some(part => part.partNumber === 1));
        await capture(page, record, 'interrupted');

        await page.reload();
        await page.getByRole('button', { name: '选择原文件继续', exact: true }).waitFor();
        assert.equal(await page.locator('[data-upload-feedback]').textContent(), '');
        await capture(page, record, 'resume-ready-after-refresh');
        await reselect(page, []);
        assert.equal(await page.getByRole('button', { name: '选择原文件继续', exact: true }).count(), 1);
        const beforeWrong = await stats(page);
        await reselect(page, { ...file, buffer: Buffer.from('wrong synthetic bytes') });
        await page.getByText(wrongFile, { exact: true }).waitFor();
        const afterWrong = await stats(page);
        assert.deepEqual(afterWrong.attempts, beforeWrong.attempts, 'Wrong-file selection must not upload any part');
        assert.equal(afterWrong.events.filter(event => ['create', 'resume'].includes(event.action)).length,
          beforeWrong.events.filter(event => ['create', 'resume'].includes(event.action)).length);
        await capture(page, record, 'wrong-file-error');

        await reselect(page, file);
        await page.getByText('分片已组装，等待最终保存确认', { exact: true }).waitFor();
        const finish = page.getByRole('button', { name: '完成保存', exact: true });
        await finish.waitFor();
        assert.equal(await finish.isEnabled(), true);
        assert.equal(await page.getByRole('button', { name: '取消上传', exact: true }).isDisabled(), true);
        const resumed = await stats(page);
        const assembled = resumed.sessions.find(session => session.filename === filename);
        assert.equal(assembled.sessionId, originalSession.sessionId);
        assert.equal(assembled.status, 'uploaded');
        assert.deepEqual(assembled.parts.map(part => part.partNumber).sort(), [1, 2, 3]);
        for (const part of originalSession.parts) {
          assert.equal(resumed.attempts[`${filename}:${part.partNumber}`], interrupted.attempts[`${filename}:${part.partNumber}`], 'Confirmed parts must not be uploaded again');
        }
        assert.equal(resumed.attempts[`${filename}:2`], 2);
        assert.ok(resumed.maxActivePuts <= 2);
        await capture(page, record, 'completed-save-ready');

        await page.request.get(`${base}/fixture/reset-failure`);
        const cancelledName = `合成_取消上传保留记录_${width}.pdf`;
        await page.getByLabel('新上传', { exact: true }).setInputFiles({ ...file, name: cancelledName });
        await page.getByText(interruption, { exact: true }).waitFor();
        await page.getByRole('button', { name: '选择原文件继续', exact: true }).waitFor();
        // Two rows are visible: assembled row cannot cancel, unfinished row can.
        const unfinishedCancel = page.locator('[aria-label="未完成上传"] button:not([disabled])').filter({ hasText: /^取消上传$/ });
        assert.equal(await unfinishedCancel.count(), 1);
        await unfinishedCancel.dblclick();
        await page.waitForFunction(() => ![...document.querySelectorAll('[aria-label="未完成上传"] button')].some(button => button.textContent === '选择原文件继续'));
        await page.reload();
        await finish.waitFor();
        await page.getByRole('complementary', { name: '夹具保留的取消证据', exact: true }).waitFor();
        assert.equal(await page.locator('[data-upload-feedback]').textContent(), '', 'Cancelled screenshot must not retain an earlier upload error');
        const cancelled = await stats(page);
        assert.equal(cancelled.sessions.find(session => session.filename === cancelledName).status, 'aborted');
        assert.equal(cancelled.sessions.find(session => session.filename === filename).status, 'uploaded');
        assert.equal(await page.locator('[aria-label="未完成上传"]').getByText(cancelledName, { exact: false }).count(), 0);
        assert.equal(await page.locator('[aria-label="未完成上传"]').getByText(filename, { exact: false }).count(), 1);
        await capture(page, record, 'cancelled-with-completed-session-preserved');
        assert.deepEqual(record.pageErrors, []);
        record.assertions = { pickerCancellationPreservedSession: true, wrongFileSentNoParts: true,
          stableSessionIdentity: true, confirmedPartsNotReuploaded: originalSession.parts.map(part => part.partNumber),
          failedPartAttempts: resumed.attempts[`${filename}:2`], maxConcurrentPartRequests: resumed.maxActivePuts,
          allThreePartsAssembled: true, cancellationPreservedAssembledSession: true, staleErrorCleared: true, noHorizontalOverflowAtEveryCheckpoint: true };
      } finally {
        await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
        await context.close();
      }
    }
    console.log('PASS 360/390/1440px: 15 retained state screenshots, no horizontal overflow, refresh/picker/wrong-file/part reuse/cancel evidence; production sealing and live R2 excluded');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
