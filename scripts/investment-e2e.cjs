/* eslint-disable @typescript-eslint/no-require-imports -- Isolated, synthetic CI fixture only. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const base = "http://127.0.0.1:4179";
const output = "test-results/investment";
(async () => {
  await mkdir(output,{recursive:true});
  const browser = await chromium.launch({headless:true});
  const evidence=[];
  try {
    for (const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:960},reducedMotion:"reduce",hasTouch:width<768});
      // Requests may only reach this read-only fixture; no provider, API or DB access.
      await context.route("**/*",route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base || route.request().method()!=="GET" || url.pathname.startsWith("/api/")) return route.abort();
        return route.continue();
      });
      const page=await context.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));
      const capture=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: horizontal overflow`);await page.screenshot({path:`${output}/${name}-${width}.png`});};
      await page.goto(base,{waitUntil:"networkidle"});
      await page.getByRole("heading",{name:"投资",exact:true}).waitFor();
      assert.ok((await page.locator("body").innerText()).includes("从一笔真实持仓开始"));
      await capture("empty");
      await page.getByRole("button",{name:"添加账户",exact:true}).click();
      const dialog=page.getByRole("dialog");await dialog.waitFor();await capture("account-dialog");
      await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
      await page.waitForFunction(()=>document.activeElement?.textContent?.includes("添加账户"));
      for(const tab of ["holdings","strategies","research"]){
        await page.goto(`${base}/?fixture=populated&tab=${tab}`,{waitUntil:"networkidle"});
        if(tab==="holdings") {assert.ok((await page.locator("body").innerText()).includes("成本未知"));assert.ok((await page.locator("body").innerText()).includes("暂无估值"));}
        if(tab!=="holdings") await page.locator("details").first().locator("summary").click();
        await capture(tab);
      }
      await page.goto(`${base}/?fixture=unavailable`,{waitUntil:"networkidle"});
      assert.ok(await page.getByRole("button",{name:"添加账户",exact:true}).isDisabled());
      assert.ok((await page.getByRole("alert").innerText()).includes("无法读取"));await capture("unavailable");
      assert.deepEqual(errors,[]);evidence.push({width,passed:true});await context.close();
    }
    await writeFile(`${output}/result.json`,JSON.stringify({fixture:"isolated synthetic, no database",evidence},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
