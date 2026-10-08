/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic UI-only fixture. */
const assert=require('node:assert/strict');
const {mkdir,writeFile}=require('node:fs/promises');
const {chromium}=require('playwright');
const base='http://127.0.0.1:4186',output='test-results/ai-first';
(async()=>{
 await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true});const evidence=[];
 try {for(const width of [360,390,1440]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce',hasTouch:width<768});let writes=0;const errors=[];
  await context.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!==base)return route.abort();if(r.method()!=='GET'){writes++;return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const capture=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflow');await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});};
  for(const scene of ['profile','skills','certifications','capital','reviews','interview','inbox']){
   await page.goto(`${base}/?scene=${scene}`,{waitUntil:'networkidle'});await page.locator('main').waitFor();
   if(['profile','skills','certifications'].includes(scene)){
    assert.equal(await page.locator('input:visible,textarea:visible,select:visible').count(),0);await capture(scene+'-reader');
    const summary=page.locator('summary').filter({hasText:'更正资料'}).first();await summary.click();assert.ok(await page.locator('input:visible,textarea:visible,select:visible').count()>0);await capture(scene+'-correction');await summary.click();assert.equal(await page.locator('input:visible,textarea:visible,select:visible').count(),0);
   }else if(scene==='reviews'){
    await page.getByText('示例 AI 复盘',{exact:true}).waitFor();await page.getByText('示例待复核决定',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'每日复盘'}).isVisible(),false);await capture('reviews-history');
   }else if(scene==='interview'){
    assert.equal(await page.getByRole('link',{name:'题目管理',exact:true}).isVisible(),false);await page.getByText('更多 · 资料管理',{exact:true}).click();await page.getByRole('link',{name:'面试记录',exact:true}).waitFor();await capture('interview-more');
   }else if(scene==='inbox'){
    await page.getByRole('button',{name:'同意，创建笔记',exact:true}).waitFor();await page.getByText('示例建议缺失记录',{exact:true}).waitFor();assert.equal(await page.locator('textarea:visible').count(),0);assert.equal(await page.getByRole('button',{name:'转任务',exact:true}).first().isVisible(),false);await capture('inbox-pending');await page.getByText('必要更正 · 手动选择去向',{exact:true}).first().click();await page.getByRole('button',{name:'转笔记',exact:true}).first().click();await capture('inbox-correction');
   }else await capture(scene);
  }
  assert.deepEqual(errors,[]);assert.equal(writes,0);evidence.push({width,passed:true,writes});await context.close();
 }}finally{await browser.close();}
 await writeFile(`${output}/evidence.json`,JSON.stringify({syntheticOnly:true,evidence},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
