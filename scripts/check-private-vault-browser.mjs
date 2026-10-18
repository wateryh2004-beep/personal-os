const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const root=process.env.VAULT_ARTIFACT_DIR || `${process.cwd()}/test-results/private-vault`;
const baseUrl=process.env.VAULT_BASE_URL || 'http://127.0.0.1:3188';
await mkdir(`${root}/outputs`,{recursive:true});
await mkdir(`${root}/work`,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {})});
const id='20000000-0000-4000-8000-000000000001';
const fileId='30000000-0000-4000-8000-000000000001';
const pass='Synthetic-private-password-123';
const token='b'.repeat(64);
const failures=[];const evidence=[];let debugPage;
async function setup(width,height){
 const context=await browser.newContext({serviceWorkers:"block",viewport:{width,height},recordVideo:{dir:`${root}/work/vault-videos`,size:{width,height}}});
 let configured=false,unlocked=false,rev=1,body='# 合成隐藏笔记\n\n仅用于浏览器验收，没有个人数据。',title='合成隐藏笔记';
 const notes=[{id,title,folder_id:null,vault_group_id:id}],files=[{id:fileId,title:'合成图片.png',original_filename:'fixture.png',mime_type:'image/png',file_size:68,folder_id:null,vault_group_id:fileId}];
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(!url.pathname.startsWith('/api/vault'))return json({});
  if(url.pathname.endsWith('/session')){
   if(method==='GET')return json({configured});
   if(method==='DELETE'){unlocked=false;return json({locked:true});}
   if(method==='POST'){
    const input=request.postDataJSON();
    if(input.password!==pass||(!configured&&input.loginPassword!=='Synthetic-login-password'))return json({error:'口令不正确。'},403);
    configured=true;unlocked=true;return json({unlocked:true,tabToken:token,draftSalt:'c'.repeat(64),owner:'00000000-0000-4000-8000-000000000001'});
   }
  }
  if(!unlocked||request.headers()['x-vault-tab']!==token)return json({error:'需要重新验证。'},423);
  if(url.pathname.endsWith('/session'))return json({unlocked:true});
  if(url.pathname.endsWith('/items')){
   if(method==='GET'&&url.searchParams.has('note'))return json({note:{...notes[0],title,body_markdown:body,revision:rev},versions:[{id:'v1',title:'历史标题',body_markdown:'合成历史正文',version_number:1,created_at:'2026-10-18T08:00:00Z'}]});
   if(method==='PUT'){const value=request.postDataJSON();if(value.revision!==rev)return json({error:'编辑冲突'},409);rev++;title=value.title;body=value.body;notes[0].title=title;return json({revision:rev});}
   if(method==='POST'){const value=request.postDataJSON();if(value.hidden===false)notes.splice(0,1);return json({saved:true,noteIds:[id],documentIds:[]});}
   return json({notes,files,noteFolders:[],fileFolders:[]});
  }
  if(url.pathname.includes('/files/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});
  return json({});
 });
 const page=await context.newPage();debugPage=page;
 page.on('pageerror',error=>failures.push(error.message));
 await page.goto(`${baseUrl}/mobile-native-e2e?scene=vault`);
 await page.getByRole('heading',{name:'笔记 · Synthetic fixture'}).waitFor();
 await page.waitForTimeout(350);
 return {page,context};
}
async function verify(page,first){
 await page.getByLabel('独立口令',{exact:true}).fill(pass);
 if(first){await page.getByLabel('当前登录密码',{exact:true}).fill('Synthetic-login-password');await page.getByLabel('再次输入',{exact:true}).fill(pass);}
 await page.getByRole('button',{name:first?'设置并进入':'继续',exact:true}).click();
 await page.getByRole('button',{name:'整理普通内容',exact:true}).waitFor();
 await page.getByRole('button',{name:/合成.*笔记|合成私密草稿标题/}).first().waitFor();
}
try{
 const {page,context}=await setup(1440,1000);
 assert.equal(await page.getByRole('button',{name:'收入暗格',exact:true}).count(),0);
 const logo=page.getByRole('link',{name:'Life of HANG，返回今日',exact:true});
 await logo.hover();await page.mouse.down();await page.waitForTimeout(2150);await page.mouse.up();
 await page.getByRole('heading',{name:'设置独立口令',exact:true}).waitFor();
 await page.waitForTimeout(650);
 await page.screenshot({path:`${root}/outputs/personalOS-vault-verification.png`});
 await verify(page,true);evidence.push('Desktop long hold and first-time setup flow');
 await page.waitForTimeout(650);
 await page.screenshot({path:`${root}/outputs/personalOS-vault-desktop.png`});
 await page.getByRole('button',{name:'合成隐藏笔记',exact:true}).click();
 await page.getByLabel('笔记标题',{exact:true}).fill('合成私密草稿标题');
 await page.locator('.cm-content').waitFor();await page.locator('.cm-content').fill('仅用于测试的加密草稿，不应出现在明文存储中。');
 await page.waitForTimeout(500);
 const stored=await page.evaluate(()=>Object.entries(sessionStorage));
 assert.ok(stored.some(([key])=>key.startsWith('personal-os:sealed-draft:')));
 assert.ok(!JSON.stringify(stored).includes('合成私密草稿标题'));assert.ok(!JSON.stringify(stored).includes('仅用于测试的加密草稿'));
 await page.keyboard.press('Meta+Shift+p');
 await page.getByRole('heading',{name:'笔记 · Synthetic fixture'}).waitFor();
 assert.equal(await page.getByText('合成私密草稿标题',{exact:true}).count(),0);
 await page.keyboard.press('Meta+Shift+p');await verify(page,false);
 await page.getByRole('button',{name:'合成隐藏笔记',exact:true}).click();
 await page.getByRole('button',{name:'在当前版本继续编辑',exact:true}).click();
 assert.equal(await page.getByLabel('笔记标题',{exact:true}).inputValue(),'合成私密草稿标题');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('status').filter({hasText:'已保存'}).waitFor();
 await page.waitForTimeout(650);
 await page.screenshot({path:`${root}/outputs/personalOS-vault-editor.png`});
 evidence.push('Editing, encrypted-only sessionStorage, keyboard lock, draft recovery and revision save');
 await page.getByRole('button',{name:'返回',exact:true}).click();
 await page.getByRole('button',{name:'文件',exact:true}).click();
 await page.getByRole('button',{name:'合成图片.png',exact:true}).click();
 await page.getByRole('img',{name:'合成图片.png',exact:true}).waitFor();
 evidence.push('Header-authorized private file preview');
 await page.getByRole('button',{name:'收起并锁定',exact:true}).click();
 await page.keyboard.press('Meta+Shift+p');await verify(page,false);
 await page.reload();
 await page.getByRole('heading',{name:'笔记 · Synthetic fixture'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'合成私密草稿标题',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'收入暗格',exact:true}).count(),0);
 evidence.push('Reload loses in-memory proof and returns to locked state');
 await page.keyboard.press('Meta+Shift+p');await verify(page,false);
 await page.getByRole('button',{name:'整理普通内容',exact:true}).click();
 await page.route('**/notes',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><h1>普通列表 · Synthetic reload</h1>'}));
 await page.getByRole('button',{name:'收入暗格',exact:true}).click();
 await page.getByRole('heading',{name:'普通列表 · Synthetic reload',exact:true}).waitFor();
 evidence.push('Moving a document refreshes the ordinary page and discards prior UI memory');
 await context.close();

 const mobile=await setup(390,844);
 await mobile.page.getByRole('button',{name:'打开导航',exact:true}).click();
 const mobileLogo=mobile.page.getByRole('button',{name:'Life of HANG',exact:true});
 await mobileLogo.hover();await mobile.page.mouse.down();await mobile.page.waitForTimeout(2150);await mobile.page.mouse.up();await verify(mobile.page,true);
 assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await mobile.page.waitForTimeout(650);
 await mobile.page.screenshot({path:`${root}/outputs/personalOS-vault-mobile.png`});
 await mobile.page.getByRole('button',{name:'合成隐藏笔记',exact:true}).click();
 await mobile.page.locator('.cm-content').waitFor();
 assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await mobile.page.keyboard.press('Escape');
 await mobile.page.getByRole('heading',{name:'笔记 · Synthetic fixture'}).waitFor();
 evidence.push('390px mobile layout, editable document and Escape locking');
 await mobile.page.keyboard.press('Control+Shift+p');await verify(mobile.page,false);
 await mobile.page.clock.install();
 await mobile.page.clock.fastForward(300001);
 await mobile.page.getByRole('heading',{name:'笔记 · Synthetic fixture'}).waitFor();
 assert.equal(await mobile.page.getByRole('button',{name:'收入暗格',exact:true}).count(),0);
 evidence.push('Five-minute idle automatic locking');
 await mobile.context.close();
 assert.deepEqual(failures,[]);
 await writeFile(`${root}/work/vault-browser-result.json`,JSON.stringify({passed:evidence,pageErrors:failures},null,2));
 console.log(JSON.stringify({passed:evidence,pageErrors:failures},null,2));
}catch(error){if(debugPage){await debugPage.screenshot({path:`${root}/work/vault-browser-failure.png`}).catch(()=>{});await writeFile(`${root}/work/vault-browser-failure.txt`,await debugPage.locator('body').innerText().catch(()=>''));}throw error;}finally{await browser.close();}
