/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic, no live services. */
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { chromium } = require("playwright");
const base = "http://127.0.0.1:4179", output = "test-results/investment";
(async()=>{
  await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});const evidence=[], diagnostics=[];
  try {
    for(const width of [360,390,1440]) {
      const context=await browser.newContext({viewport:{width,height:960},reducedMotion:"reduce",hasTouch:width<768});
      await context.route("**/*",route=>{const url=new URL(route.request().url());return url.origin===base && route.request().method()==="GET" && !url.pathname.startsWith("/api/") ? route.continue() : route.abort();});
      const page=await context.newPage(),errors=[];page.on("pageerror",error=>{errors.push(error.message);diagnostics.push({kind:"pageerror",message:error.message});});
      const capture=async(name)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow: ${name}`);await page.screenshot({path:`${output}/daily-${name}-${width}.png`,fullPage:true});};
      await page.goto(`${base}/?fixture=daily`,{waitUntil:"networkidle"});await page.getByRole("heading",{name:"投资",exact:true}).waitFor();
      let text=await page.locator("body").innerText();assert.ok(text.includes("1,017"));assert.ok(text.includes("1,440"));assert.ok(text.includes("超过 72 小时"));assert.ok(text.includes("成本未知"));assert.ok(!text.includes("UI 测试账户（模拟）"));await capture("real-overview");
      const opener=page.getByRole("button",{name:"现金 / 分红",exact:true});await opener.click();const dialog=page.getByRole("dialog");await dialog.getByLabel("记录类型",{exact:true}).selectOption("dividend");
      await dialog.getByLabel("分红税前总额 · CNY",{exact:true}).fill("10.25");await dialog.getByLabel("市场与标的代码",{exact:true}).fill("TEST:REAL");await dialog.getByLabel("记录来源",{exact:true}).fill("Synthetic browser test");await dialog.locator('[name="confirmed"]').check();
      await dialog.getByRole("button",{name:"确认保存",exact:true}).click();await dialog.getByRole("alert").waitFor();assert.equal(await dialog.getByLabel("分红税前总额 · CNY",{exact:true}).inputValue(),"10.25");await capture("dividend-error");await dialog.getByRole("button",{name:"取消",exact:true}).click();await dialog.waitFor({state:"hidden"});await opener.focus();
      await page.getByRole("button",{name:"更新报价",exact:true}).click();await page.getByRole("dialog").getByLabel("录入方式",{exact:true}).selectOption("import");await capture("import-dialog");await page.keyboard.press("Escape");await page.getByRole("dialog").waitFor({state:"hidden"});
      await page.getByRole("link",{name:"模拟",exact:true}).click();await page.getByRole("heading",{name:"UI 测试账户（模拟）",exact:true}).waitFor();text=await page.locator("body").innerText();assert.ok(text.includes("480"));assert.ok(text.includes("80"));assert.ok(text.includes("导入"));assert.ok(!text.includes("UI 测试账户（实盘）"));await capture("paper-overview");
      await page.goto(`${base}/?fixture=daily&tab=strategies&item=30000000-0000-4000-8000-000000000001`,{waitUntil:"networkidle"});await page.waitForFunction(()=>document.querySelector('[data-selected]')?.open===true);await capture("search-link");
      assert.deepEqual(errors,[]);evidence.push({width,passed:true});await context.close();
    }
    await writeFile(`${output}/daily-result.json`,JSON.stringify({fixture:"synthetic only; all writes mocked and no network except localhost",evidence},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
