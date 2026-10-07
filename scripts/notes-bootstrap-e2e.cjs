/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic loopback performance evidence. */
const assert=require('node:assert/strict');
const {mkdir,writeFile}=require('node:fs/promises');
const {chromium}=require('playwright');
const base='http://127.0.0.1:3000';
const fixture={notes:[{id:'10000000-0000-4000-8000-000000000001',title:'流式首屏 · Synthetic notebook',excerpt:null,folder_id:null,updated_at:'2026-10-07T00:00:00Z',pinned_at:null,content_origin:'manual'}],folders:[],navigatorNotes:[],timezone:'UTC',state:'ready',hasMore:false};
(async()=>{
 const out='test-results/notes-bootstrap';await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];
 try { for(const width of [390,1440]) for(const mode of ['baseline','streamed']) for(let sample=0;sample<3;sample++) {
  const ctx=await browser.newContext({viewport:{width,height:1000}});const page=await ctx.newPage();let apiCalls=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/notes/workspace',async route=>{apiCalls++;await new Promise(r=>setTimeout(r,400));await route.fulfill({json:fixture});});
  await page.route('**/api/perf',route=>route.fulfill({status:204}));
  await page.goto(`${base}/mobile-native-e2e?scene=notes-bootstrap&mode=${mode}&workspace=notes`,{waitUntil:'domcontentloaded'});
  await page.getByText(fixture.notes[0].title,{exact:true}).waitFor();
  const cold=await page.evaluate(()=>({readyMs:performance.getEntriesByName('personal-os:initial-workspace-ready').at(-1)?.duration,jsBytes:performance.getEntriesByType('resource').filter(r=>r.name.includes('/_next/')&&r.name.endsWith('.js')).reduce((n,r)=>n+r.transferSize,0)}));
  assert.equal(apiCalls,mode==='baseline'?1:0,'streamed route removes hydration API round trip');assert.ok(cold.readyMs>0);
  await page.getByTestId('bootstrap-home').click();await page.getByText('合成导航首页 · 不连接真实数据库').waitFor();
  await page.getByTestId('bootstrap-notes').click();await page.getByText(fixture.notes[0].title,{exact:true}).waitFor();
  const warm=await page.evaluate(()=>performance.getEntriesByName('personal-os:workspace-data-ready').at(-1)?.duration);
  assert.ok(warm>=0);assert.equal(apiCalls,mode==='baseline'?1:0,'warm navigation preserves cache without duplicate API');assert.deepEqual(errors,[]);
  if(sample===0)await page.screenshot({path:`${out}/${mode}-${width}.png`,fullPage:true});
  results.push({width,mode,sample,...cold,warmMs:warm,apiCalls});await ctx.close();
 }
 await writeFile(`${out}/measurements.json`,JSON.stringify({scope:'Actual Next production-build synthetic Notes loader; baseline API delay 400ms, streamed server read delay150ms; cloud CI browser, no private auth/database or China network measurement',results},null,2));
 for(const width of [390,1440]){const avg=mode=>results.filter(x=>x.width===width&&x.mode===mode).reduce((n,x)=>n+x.readyMs,0)/3;assert.ok(avg('streamed')<avg('baseline'),'streamed sample should beat serialized API sample');}
 console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
