/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic CI-only browser download verification. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const ts = require("typescript");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = "test-results/files-recovery";
const modules = new Map();
function load(relative) {
  const filename = path.resolve(relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} }; modules.set(filename, loaded);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name.startsWith(".") ? load(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name);
  new Function("require", "module", "exports", code)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { createExportPlan, describeExportPart, selectExportPart } = load("src/features/files/export/plan.ts");
const { exportArchive } = load("src/features/files/export/portable.ts");
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const original = Buffer.alloc(20_000, "synthetic recovery fixture\n");
const checksum = createHash("sha256").update(original).digest("hex");
const documents = [3, 4].map(number => ({ id: id(number), title: `合成文件 ${number}`, original_filename: `fixture-${number}.txt`, storage_path: `synthetic/files/${id(number)}/fixture.txt`, storage_state: "available", file_size: original.length, checksum, folder_id: id(1), archived_at: null }));
async function* rows(values) { yield* values; }
function source() {
  return { folders: () => rows([{ id: id(1), name: "合成资料", parent_id: null }]), documents: () => rows(documents), relationships: () => rows([]),
    openObject: async () => ({ size: original.length, body: new ReadableStream({ start(c) { c.enqueue(original); c.close(); } }) }) };
}
(async () => {
  await fsp.mkdir(output, { recursive: true });
  const signal = new AbortController().signal;
  const plan = await createExportPlan(source(), signal, 48_000);
  assert.equal(plan.parts.length, 2);
  const packages = new Map();
  for (const part of plan.parts) {
    const descriptor = describeExportPart(plan, part.partIndex);
    const chunks = [];
    for await (const chunk of exportArchive(selectExportPart(source(), descriptor), signal, "2026-10-06T00:00:00.000Z", { collection: descriptor, maxBytes: 48_000, verifyCollection: async () => true })) chunks.push(Buffer.from(chunk));
    packages.set(part.partIndex, Buffer.concat(chunks));
  }
  if (process.argv.includes("--prepare-only")) {
    const directory = await fsp.mkdtemp("/tmp/files-recovery-browser-fixture-");
    try {
      const files = [];
      for (const [part, buffer] of packages) { const file = path.join(directory, `part-${part}.tar`); await fsp.writeFile(file, buffer); files.push(file); }
      const verified = spawnSync("python3", ["scripts/verify-files-export.py", ...files, "--summary"], { encoding: "utf8" });
      assert.equal(verified.status, 0, verified.stdout + verified.stderr);
      assert.match(verified.stdout, /2\/2 parts/);
      console.log(verified.stdout);
    } finally { await fsp.rm(directory, { recursive: true, force: true }); }
    return;
  }
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true, reducedMotion: "reduce" });
      let unexpectedWrites = 0, planChanged = false;
      await context.route("**/*", route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== new URL(baseURL).origin) return route.abort();
        if (url.pathname === "/api/files/export/plan") return route.fulfill({ json: plan });
        if (url.pathname === "/api/files/export/part") {
          if (planChanged) return route.fulfill({ status: 409, json: { error: "清单已变化，请重新生成计划。", code: "files_export_plan_changed" } });
          const body = new URLSearchParams(req.postData());
          assert.equal(body.get("planId"), plan.planId);
          const part = Number(body.get("partIndex"));
          assert.ok(packages.has(part));
          return route.fulfill({ body: packages.get(part), contentType: "application/x-tar", headers: { "Content-Disposition": `attachment; filename="synthetic-part-${part}.tar"` } });
        }
        if (req.method() !== "GET") { unexpectedWrites++; return route.abort(); }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
        return route.continue();
      });
      const page = await context.newPage();
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${baseURL}/mobile-native-e2e?scene=files`, { waitUntil: "networkidle" });
      await page.getByText("导出与恢复副本", { exact: true }).click();
      await page.getByRole("button", { name: "准备分包导出", exact: true }).click();
      await page.getByRole("region", { name: "文件恢复包计划", exact: true }).waitFor();
      const files = [];
      for (const part of plan.parts) {
        const downloaded = page.waitForEvent("download");
        await page.getByRole("button", { name: `下载第 ${part.partIndex} 包`, exact: true }).click();
        const download = await downloaded;
        const target = `${output}/${width}-part-${part.partIndex}.tar`;
        await download.saveAs(target); files.push(target);
        assert.equal(await download.failure(), null);
      }
      const verify = spawnSync("python3", ["scripts/verify-files-export.py", ...files, "--summary"], { encoding: "utf8" });
      assert.equal(verify.status, 0, verify.stdout + verify.stderr);
      assert.match(verify.stdout, /2\/2 parts/);
      assert.ok((await page.getByRole("region", { name: "文件恢复包计划" }).innerText()).includes("未校验"));
      await page.getByText("导出与恢复副本", { exact: true }).scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${output}/files-recovery-${width}.png` });
      planChanged = true;
      await page.getByRole("button", { name: "重试第 1 包（未校验）", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "清单已变化" }).waitFor();
      assert.ok(page.url().includes("/mobile-native-e2e"));
      assert.equal(await page.getByRole("button", { name: "准备分包导出", exact: true }).count(), 1);
      assert.equal(unexpectedWrites, 0); assert.deepEqual(errors, []);
      evidence.push({ width, syntheticOnly: true, partsDownloaded: files.length, verifierExit: verify.status, errors });
      await context.close();
    }
    await fsp.writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
