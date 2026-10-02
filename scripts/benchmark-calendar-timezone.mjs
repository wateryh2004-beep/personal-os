import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Synthetic CPU comparison only. This does not measure a browser, network,
// Supabase or production navigation. Usage: node scripts/benchmark-calendar-timezone.mjs [baseline-ref]
const path = "src/features/calendar/timezone.ts";
const baselineRef = process.argv[2] ?? "aeb4407";
function load(source) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Intl, Date, Map, Set, Number, Error });
  return exports;
}
const before = load(execFileSync("git", ["show", `${baselineRef}:${path}`], { encoding: "utf8" }));
const after = load(readFileSync(path, "utf8"));
const project = (api) => Array.from({ length: 200 }, (_, index) => {
  const start = new Date(Date.UTC(2026, 7, 8, 1, index * 5));
  const end = new Date(start.getTime() + 3_600_000);
  return [api.instantToFullCalendarDate(start.toISOString(), "Asia/Shanghai").toISOString(), api.instantToFullCalendarDate(end.toISOString(), "Asia/Shanghai").toISOString()];
});
const drag = (api) => Array.from({ length: 20 }, (_, index) => api.wallTimeToInstant(`2026-08-08T${String(8 + index % 12).padStart(2, "0")}:10`, "Asia/Shanghai"));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function benchmark(api, work) {
  work(api);
  return median(Array.from({ length: 9 }, () => { const start = performance.now(); work(api); return performance.now() - start; }));
}
for (const [name, work] of [["200 event projections", project], ["20 wall-time conversions", drag]]) {
  assert.equal(JSON.stringify(work(before)), JSON.stringify(work(after)), "Optimization must preserve exact results");
  const beforeMs = benchmark(before, work);
  const afterMs = benchmark(after, work);
  console.log(JSON.stringify({ name, baselineRef, environment: `Node ${process.version}; synthetic CPU; median of 9`, beforeMs: +beforeMs.toFixed(2), afterMs: +afterMs.toFixed(2), reductionPercent: +(100 * (1 - afterMs / beforeMs)).toFixed(1) }));
}
