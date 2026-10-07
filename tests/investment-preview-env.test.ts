import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { expect, it } from "vitest";
it("isolated investment preview supplies Next's public timing constant",()=>{
 const config=readFileSync("scripts/investment-preview.mjs","utf8");
 expect(config).toContain('"process.env.NEXT_PUBLIC_PERF_DEBUG": JSON.stringify("false")');
 const source=readFileSync("src/lib/perf.ts","utf8");
 const code=transformSync(source,{loader:"ts",format:"cjs",define:{"process.env.NEXT_PUBLIC_PERF_DEBUG":'"false"'}}).code;
 expect(()=>runInNewContext(code,{module:{exports:{}},exports:{}})).not.toThrow();
});
