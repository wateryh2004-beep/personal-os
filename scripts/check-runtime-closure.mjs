// Run after next build. No credentials, database or external requests.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);
require("mammoth");
const cliPath = /(?:\/node_modules\/(?:shadcn|sprintf-js|braces|micromatch|fast-glob|eslint-config-next|@next\/eslint-plugin-next)\/|\/mammoth\/node_modules\/argparse\/|\/mammoth\/bin\/)/;
assert.equal(Object.keys(require.cache).filter(file => cliPath.test(file.replaceAll("\\", "/"))).length, 0, "Mammoth's library entry must not load the CLI advisory chain");

function manifests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? manifests(file) : file.endsWith(".nft.json") ? [file] : [];
  });
}
const traces = [...manifests(path.join(root, ".next/server")), ...readdirSync(path.join(root, ".next")).filter(file => file.endsWith(".nft.json")).map(file => path.join(root, ".next", file))];
assert.ok(traces.length > 0, "A production build is required before checking deployment traces");
let checkedPaths = 0;
for (const trace of traces) {
  const manifest = JSON.parse(readFileSync(trace, "utf8"));
  for (const entry of manifest.files) {
    const file = path.resolve(path.dirname(trace), entry).replaceAll("\\", "/");
    assert.ok(!cliPath.test(file), `CLI-only dependency entered ${path.relative(root, trace)}: ${path.relative(root, file)}`);
    checkedPaths++;
  }
}
console.log(JSON.stringify({ traces: traces.length, checkedPaths, cliAdvisoryChainLoaded: false, cliAdvisoryChainTraced: false }));
