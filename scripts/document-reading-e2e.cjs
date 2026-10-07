/* eslint-disable @typescript-eslint/no-require-imports -- Loopback-only synthetic browser checks. */
const assert=require('node:assert/strict');
const {mkdir}=require('node:fs/promises');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:["--no-sandbox"]} : {})});
 try {
  await mkdir('test-results/document-reading',{recursive:true});
  const a=await browser.newPage({viewport:{width:390,height:900}}), b=await browser.newPage({viewport:{width:1440,height:1000}});
  const open=async p=>{await p.goto('http://127.0.0.1:4191');await p.getByRole('button',{name:'打开 PDF',exact:true}).click();await p.locator('canvas[data-pdf-rendered="true"]').waitFor();};
  await open(a);await open(b);
  await a.getByRole('button',{name:'下一页',exact:true}).click();await a.getByText('阅读进度已同步',{exact:true}).waitFor();
  assert.equal(await a.locator('canvas').getAttribute('data-pdf-page'),'2');
  await b.getByRole('button',{name:'下一页',exact:true}).click();await b.getByText('另一设备已更新到第 2 页',{exact:true}).waitFor();
  await b.getByRole('button',{name:'接续最新进度',exact:true}).click();
  await b.getByRole('button',{name:'从头阅读',exact:true}).click();await b.getByText('阅读进度已同步',{exact:true}).waitFor();
  await a.reload();await a.locator('canvas[data-pdf-rendered="true"]').waitFor();assert.equal(await a.locator('canvas').getAttribute('data-pdf-page'),'1');
  await a.getByRole('button',{name:'下一页',exact:true}).click();await a.getByText('阅读进度已同步',{exact:true}).waitFor();
  await a.getByRole('button',{name:'关闭预览',exact:true}).click();await a.getByRole('button',{name:'打开 PDF',exact:true}).waitFor();
  await a.goForward();await a.getByText('已接续第 2 页',{exact:true}).waitFor();
  await a.locator('canvas[data-pdf-rendered="true"]').waitFor();
  const ink=await a.locator('canvas').evaluate(canvas=>{const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);let colored=0;for(let i=0;i<data.length;i+=4)if(data[i]<220||data[i+1]<220||data[i+2]<220)colored++;return colored;});assert.ok(ink>1000);
  await a.screenshot({path:'test-results/document-reading/mobile-continued.png'});await b.screenshot({path:'test-results/document-reading/desktop-restarted.png'});
  console.log('PASS actual PDF canvas ink, independent contexts conflict, deliberate backwards progress, reload, close, Back/Forward and persisted reopen');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
