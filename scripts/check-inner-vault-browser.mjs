import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.VAULT_BASE_URL || "http://127.0.0.1:3188";
const output = process.env.VAULT_ARTIFACT_DIR || `${process.cwd()}/test-results/inner-vault`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
const outerPassword = "Synthetic-outer-passphrase";
const innerPassword = "Synthetic-inner-passphrase";
const tab = "a".repeat(64), proof = "b".repeat(64);
const id = "00000000-0000-4000-8000-000000000091";
const zip = Buffer.from("UEsDBBQAAAAAAAAAIQCfPbG+OgAAADoAAAALAAAAZml4dHVyZS50eHRTeW50aGV0aWMgWklQIHVzZWQgb25seSBmb3IgdGhlIGlubmVyLXZhdWx0IGJyb3dzZXIgdGVzdC4KUEsBAhQDFAAAAAAAAAAhAJ89sb46AAAAOgAAAAsAAAAAAAAAAAAAAIABAAAAAGZpeHR1cmUudHh0UEsFBgAAAAABAAEAOQAAAGMAAAAAAA==", "base64");
const archive = {id, filename: "合成备份.zip", size: zip.length, status: "uploading", expiresAt: "2099-01-01", parts: []};
const results = [];

try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext({
      viewport: {width, height}, reducedMotion: width === 390 ? "reduce" : "no-preference",
      serviceWorkers: "block", recordVideo: { dir: output, size: {width, height} }, acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let outer = false, inner = false, configured = false, saved = false;
    await context.route("**/api/vault/**", route => {
      const request = route.request(), url = new URL(request.url());
      const method = request.method();
      const json = (body, status = 200, headers = {}) => route.fulfill({json: body, status, headers});
      if (url.pathname === "/api/vault/session") {
        if (method === "GET") return json({ configured: true });
        if (method === "DELETE") { outer = inner = false; return json({ locked: true }); }
        if (method === "POST") {
          if (request.postDataJSON().password !== outerPassword) return json({error:"口令不正确。"}, 403);
          outer = true;
          return json({tabToken:tab, draftSalt:"d".repeat(64), owner:"00000000-0000-4000-8000-000000000061"});
        }
      }
      if (url.pathname.endsWith(`/download/${archive.id}`)) {
        if (!outer || !inner) return json({error:"请重新验证内层口令。"}, 423);
        return route.fulfill({status:200, contentType:"application/zip", headers:{"content-disposition":`attachment; filename*=UTF-8''${encodeURIComponent(archive.filename)}`}, body:zip});
      }
      if (!outer || request.headers()["x-vault-tab"] !== tab) return json({error:"需要重新验证。"}, 423);
      if (url.pathname === "/api/vault/items") return json({notes:[], files:[], noteFolders:[], fileFolders:[]});
      if (url.pathname === "/api/vault/inner/session") {
        if (method === "GET") return json({ configured });
        if (method === "POST") {
          if (request.postDataJSON().password !== innerPassword) return json({error:"内层口令不正确。"}, 403);
          configured = inner = true;
          return json({token:proof});
        }
        if (method === "DELETE") { inner = false; return json({locked:true}); }
      }
      if (!inner || request.headers()["x-vault-inner"] !== proof)
        return json({error:"请重新验证内层口令。"}, 423, {"x-vault-locked":"inner"});
      if (url.pathname.endsWith("/uploads")) {
        if (method === "GET") return json({files:saved ? [{...archive, status:"completed"}] : [], next:null});
        if (method === "POST") return json(archive);
        if (request.postDataJSON().action === "sign") return json({uploadUrl:"https://synthetic-r2.invalid/part", size:zip.length});
        if (request.postDataJSON().action === "complete") { saved = true; return json({...archive,status:"completed"}); }
      }
      if (url.pathname.endsWith("/download")) return json({url:`/api/vault/inner/download/${archive.id}`});
      return json({});
    });
    await context.route("https://synthetic-r2.invalid/part", route =>
      route.fulfill({status: 200, headers: {"access-control-allow-origin":"*"}}));
    await page.goto(`${base}/mobile-native-e2e?scene=vault`);
    await page.keyboard.press("Control+Shift+P");
    await page.getByLabel("独立口令").fill(outerPassword);
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await page.getByRole("button", {name:"文件", exact:true}).click();
    const entry = page.getByRole("button", {name:"内层文件"});
    await entry.click();
    await page.getByLabel("内层口令", { exact:true }).fill(innerPassword);
    await page.getByLabel("确认内层口令").fill(innerPassword);
    await page.screenshot({ path: `${output}/inner-vault-locked-${width}.png` });
    await page.getByRole("button", {name:"设置并解锁"}).click();
    await page.getByText("还没有文件。可以上传一份 ZIP。").waitFor();
    await page.getByLabel("上传 ZIP").setInputFiles({name:archive.filename, mimeType:"application/zip", buffer:zip});
    await page.getByText("已保存", {exact:false}).last().waitFor();
    await page.getByText(archive.filename, {exact:true}).waitFor();
    await page.screenshot({ path: `${output}/inner-vault-files-${width}.png` });
    const download = page.waitForEvent("download");
    await page.getByRole("button", {name:"下载 ZIP"}).click();
    const downloaded = await download;
    assert.equal(downloaded.suggestedFilename(), archive.filename);
    assert.deepEqual(await readFile(await downloaded.path()), zip);
    await page.getByRole("button", {name:"锁定并返回"}).click();
    await page.getByText("内层已锁定。").waitFor();
    assert.equal(await page.getByText(archive.filename, {exact:true}).count(), 0);
    assert.equal(await entry.evaluate(element => element === document.activeElement), true);
    await entry.click();
    await page.getByLabel("内层口令", {exact:true}).fill("Synthetic-wrong-passphrase");
    await page.getByRole("button", {name:"解锁内层"}).click();
    await page.getByRole("alert").getByText("内层口令不正确。").waitFor();
    await page.getByLabel("内层口令", {exact:true}).fill(innerPassword);
    await page.getByRole("button", {name:"解锁内层"}).click();
    await page.getByText(archive.filename, {exact:true}).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("heading", {name:"文档", exact:true}).waitFor({state:"hidden"});
    assert.equal(await page.getByText(archive.filename, {exact:true}).count(), 0);
    assert.deepEqual(errors, []);
    const file = page.video();
    await context.close();
    if (file) { await file.saveAs(`${output}/inner-vault-flow-${width}.webm`); await file.delete(); }
    results.push({ width, height, setup: true, upload: true, download: true, relock: true, focusRestored: true, wrongPasswordDenied: true });
  }
  await writeFile(`${output}/inner-vault-result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
