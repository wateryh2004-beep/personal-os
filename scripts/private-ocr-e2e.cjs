/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic only; serves a cold static copy with zero API/storage credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { build } = require('esbuild');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { jsPDF } = require('jspdf');
const { chromium } = require('playwright');
(async () => {
  const evidence = path.resolve('test-results/private-ocr');
  await fs.mkdir(evidence, { recursive: true });
  const stages = [], requests = [], blockedRequests = [], browserErrors = [], sourceResponses = [];
  let browser, page, phase = 'prepare', passed = false;
  const checkpoint = name => { phase = name; stages.push({ name, at: new Date().toISOString() }); console.log(`OCR checkpoint: ${name}`); };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'private-ocr-cold-'));
  await fs.cp('public/ocr', path.join(root, 'ocr'), { recursive: true });
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'ocr/v1/manifest.json')));
  for (const file of manifest.files) {
    const bytes = await fs.readFile(path.join(root, 'ocr/v1', file.path));
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  await build({ entryPoints: ['src/lib/adapters/private-ocr-browser.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'PrivateOcr', outfile: path.join(root, 'client.js'), alias: { '@': path.resolve('src') } });
  await build({ entryPoints: ['tests/fixtures/private-ocr-browser/main.tsx'], bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: path.join(root, 'ui.js'), alias: { '@': path.resolve('src') } });
  const css = await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
  await fs.writeFile(path.join(root, 'app.css'), css.css);
  const font = process.env.OCR_TEST_FONT || '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
  assert(GlobalFonts.registerFromPath(font, 'FixtureChinese'));
  const canvas = createCanvas(1500, 420), context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0,0,1500,420); context.fillStyle = 'black'; context.font = '56px FixtureChinese';
  context.fillText('私人文档 中文识别测试',80,115); context.fillText('PRIVATE SCANNED DOCUMENT 7412',80,225); context.fillText('SEARCHABLE ENGLISH AND CHINESE',80,330);
  const image = canvas.toBuffer('image/png');
  await fs.writeFile(path.join(root, 'ui.html'), `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body data-size="${image.length}"><main id="root" class="p-4"></main><output id="saved"></output><script src="/ui.js"></script></body></html>`); await fs.writeFile(path.join(root,'scan.png'),image);
  const pdf = new jsPDF({unit:'pt',format:[750,210],orientation:'landscape'}); pdf.addImage(image,'PNG',0,0,750,210); await fs.writeFile(path.join(root,'scan.pdf'),Buffer.from(pdf.output('arraybuffer')));
  const digital = new jsPDF();
  // Keep the complete native text inside the crop box. The former single line
  // extended off-page, leaving just 66 visible characters (below the 80-char fast path).
  const digitalText = 'This digital text layer has enough characters to skip the recognition engine entirely and preserve its original searchable contents.';
  digital.text(digital.splitTextToSize(digitalText, 160), 20, 25); await fs.writeFile(path.join(root,'digital.pdf'),Buffer.from(digital.output('arraybuffer')));
  pdf.addPage(); await fs.writeFile(path.join(root,'scan-with-blank.pdf'),Buffer.from(pdf.output('arraybuffer')));
  const tooMany=new jsPDF(); for(let i=0;i<10;i++)tooMany.addPage();await fs.writeFile(path.join(root,'too-many.pdf'),Buffer.from(tooMany.output('arraybuffer')));
  await fs.writeFile(path.join(root,'index.html'),'<script src="/client.js"></script><h1>Synthetic local OCR verification</h1>');
  let sourceTransport = 'chunked';
  const server=http.createServer(async(req,res)=>{try{
    const requestUrl = new URL(req.url,'http://local');
    if (requestUrl.pathname.startsWith('/api/files/') && requestUrl.searchParams.get('source') === '1') {
      const headers = { 'Content-Type': 'application/octet-stream', 'X-Ocr-Sha256': createHash('sha256').update(image).digest('hex') };
      if (sourceTransport === 'gzip') {
        const encoded = gzipSync(image); assert.notEqual(encoded.length, image.length);
        res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': String(encoded.length) });
        return res.end(encoded);
      }
      // A real chunked response omits Content-Length, as a streaming proxy can.
      res.writeHead(200, headers); res.write(image.subarray(0, Math.floor(image.length / 2)));
      return res.end(image.subarray(Math.floor(image.length / 2)));
    }
    const filename=path.join(root,decodeURIComponent(requestUrl.pathname));const target=filename===root+'/'?path.join(root,'index.html'):filename;if(!target.startsWith(root+path.sep))throw Error();const bytes=await fs.readFile(target);res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':target.endsWith('.wasm')?'application/wasm':target.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let denied=0;
  try {
    checkpoint('launch');
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
    const browserContext=await browser.newContext({ viewport: { width: 390, height: 844 } });page=await browserContext.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('response', response => { if (response.url().endsWith('?source=1')) sourceResponses.push(response.headers()); });
    await browserContext.route('**/*',route=>{if(!route.request().url().startsWith(base+'/')){denied++;blockedRequests.push(route.request().url());return route.abort();}requests.push(route.request().url());return route.continue();});
    await page.goto(base);assert(!requests.some(url=>url.includes('/ocr/')),'must not load OCR on page open');
    const recognize=filename=>page.evaluate(async filename=>{const bytes=new Uint8Array(await(await fetch('/'+filename)).arrayBuffer());const pages=[];const result=await PrivateOcr.recognizePrivateDocument({bytes,filename,mimeType:filename.endsWith('.pdf')?'application/pdf':'image/png',signal:new AbortController().signal,onProgress:()=>{},onPage:async(page,total)=>{pages.push([page,total]);}});return{...result,progress:pages};},filename);
    checkpoint('digital-text-fast-path');
    const digitalResult=await recognize('digital.pdf');assert(digitalResult.text.replace(/\s/g,'').length >= 80, 'digital fixture must expose sufficient on-page native text');assert(digitalResult.text.includes('digital text layer'));assert(!requests.some(url=>url.includes('/ocr/')),'digital pages should not load OCR');
    checkpoint('real-image-recognition');
    const imageResult=await recognize('scan.png');assert.match(imageResult.text,/PRIVATE SCANNED DOCUMENT 7412/);assert.match(imageResult.text.replace(/\s/g,''),/中文识别测试/);assert.deepEqual(imageResult.progress,[[1,1]]);
    checkpoint('real-scanned-pdf');
    const scanned=await recognize('scan.pdf');assert.match(scanned.text,/PRIVATE SCANNED DOCUMENT 7412/);assert.match(scanned.text.replace(/\s/g,''),/中文识别测试/);
    checkpoint('blank-page-and-bounds');
    const withBlank=await recognize('scan-with-blank.pdf');assert.equal(withBlank.pages,2);assert.equal(withBlank.emptyPages,1);assert.match(withBlank.text.replace(/\s/g,''),/中文识别测试/);
    await assert.rejects(()=>recognize('too-many.pdf'),/ocr_too_many_pages/);
    checkpoint('worker-cancellation');
    // Terminate during engine initialization; both supervisor and child disappear.
    const cancelled=await page.evaluate(async()=>{const abort=new AbortController();const worker=new PrivateOcr.LocalOcrWorker(abort.signal,()=>{});const started=worker.initialize().then(()=> 'unexpected',error=>error.message);setTimeout(()=>abort.abort(),1);return started;});assert.equal(cancelled,'ocr_cancelled');
    await page.waitForTimeout(300);assert.equal(page.workers().length,0,'no worker may outlive cancellation or completion');
    checkpoint('navigation-cancellation');
    await page.evaluate(()=>{const worker=new PrivateOcr.LocalOcrWorker(new AbortController().signal,()=>{});void worker.initialize().catch(()=>{});});
    await page.goto(base);await page.waitForTimeout(300);assert.equal(page.workers().length,0,'navigation must terminate recognition workers');
    assert.equal(denied,0,'recognition must never ask an external origin');
    assert(requests.some(url=>url.includes('chi_sim.traineddata.gz')));assert(requests.some(url=>url.includes('eng.traineddata.gz')));
    const actions=[]; let starts=0; const token='33333333-3333-4333-8333-333333333333';
    await browserContext.route(`${base}/api/files/*/ocr*`, async route=>{
      const request=route.request();
      if(request.method()==='POST'){starts++;return route.fulfill({json:{token}});}
      if(request.method()==='PATCH'){const body=request.postDataJSON();actions.push(body.action);assert.equal(body.token,token);return route.fulfill({json:{ok:true,characterCount:body.text?.length??0}});}
      if(request.url().endsWith('?source=1'))return route.continue();
      return route.fulfill({json:{job:null}});
    });
    checkpoint('actual-dialog-opt-in');
    await page.goto(base+'/ui.html');
    const beforeOpen=requests.filter(url=>url.includes('/ocr/v1/')).length;
    await page.getByRole('button',{name:'识别图片文字：Synthetic OCR scan'}).click();
    await page.getByRole('button',{name:'开始 / 重新识别',exact:true}).waitFor();
    assert.equal(requests.filter(url=>url.includes('/ocr/v1/')).length,beforeOpen,'opening actual OCR dialog must not load engine');
    await page.screenshot({path:path.join(evidence,'01-dialog-opt-in.png'),fullPage:true});
    checkpoint('actual-dialog-cancel');
    await page.getByRole('button',{name:'开始 / 重新识别',exact:true}).click();
    await page.getByRole('button',{name:'取消识别',exact:true}).click();
    await page.getByText('已停止本次识别；可重新打开查看保存状态或重试。',{exact:true}).waitFor();
    assert(actions.includes('cancel'));assert.equal(starts,1);
    await page.screenshot({path:path.join(evidence,'02-cancelled.png'),fullPage:true});
    checkpoint('actual-dialog-retry');
    await page.getByRole('button',{name:'开始 / 重新识别',exact:true}).click();
    await page.locator('#saved').filter({hasText:/Saved/}).waitFor({timeout:60000});
    assert(actions.includes('complete'));assert.equal(starts,2);
    assert(sourceResponses.some(headers => !headers['content-length'] && headers['transfer-encoding'] === 'chunked'));
    await page.screenshot({path:path.join(evidence,'03-completed.png'),fullPage:true});
    checkpoint('actual-dialog-compressed-source');
    sourceTransport = 'gzip';
    await page.locator('#saved').evaluate(element => { element.textContent = ''; });
    await page.getByRole('button',{name:'开始 / 重新识别',exact:true}).click();
    await page.locator('#saved').filter({hasText:/Saved/}).waitFor({timeout:60000});
    assert.equal(actions.filter(action => action === 'complete').length,2);assert.equal(starts,3);
    assert(sourceResponses.some(headers => headers['content-encoding'] === 'gzip' && Number(headers['content-length']) !== image.length));
    checkpoint('actual-dialog-close');
    await page.getByRole('button',{name:'开始 / 重新识别',exact:true}).click();
    await page.getByRole('button',{name:'取消识别',exact:true}).waitFor();
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.waitForTimeout(300);assert.equal(page.workers().length,0,'closing actual OCR dialog must terminate workers');
    assert.equal(denied,0);
    passed=true;checkpoint('complete');
    await fs.writeFile(path.join(evidence,'recognition.json'),JSON.stringify({image:imageResult,pdf:scanned,withBlank,uiActions:actions},null,2));
    console.log(JSON.stringify({passed:true,coldAssets:manifest.files.length,image:imageResult,pdf:scanned,withBlank,digital: digitalResult.pages,externalRequests:denied,remainingWorkers:page.workers().length,uiActions:actions},null,2));
  } catch (error) {
    await page?.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});
    await fs.writeFile(path.join(evidence,'failure.txt'),`${phase}\n${error.stack || error}`);
    throw error;
  } finally {
    await fs.writeFile(path.join(evidence,'network-and-stages.json'),JSON.stringify({passed,phase,stages,requests,blockedRequests,browserErrors,sourceResponses,remainingWorkers:page && !page.isClosed() ? page.workers().map(worker=>worker.url()) : [],coldAssetCount:manifest.files.length},null,2));
    await browser?.close();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exit(1);});
