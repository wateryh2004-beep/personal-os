import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const roots = ["src/app", "src/components"];
const patterns = [
  [/(?:bg|text|border)-(?:zinc|neutral|gray)-\d+/g, "legacy neutral utility"],
  [/bg-white\b/g, "hard-coded white surface"],
  [/transition-all\b/g, "broad transition"],
  [/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6,8})\b/g, "hard-coded hex"],
];
const allow = ["src/app/globals.css", "src/components/notes/visual-markdown-editor.tsx"];

function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const next = join(path, entry.name);
    return entry.isDirectory() ? files(next) : /\.(ts|tsx)$/.test(entry.name) ? [next] : [];
  });
}

const warnings = [];
for (const root of roots) for (const file of files(root)) {
  if (allow.includes(file)) continue;
  const source = readFileSync(file, "utf8");
  for (const [pattern, label] of patterns) {
    const count = [...source.matchAll(pattern)].length;
    if (count) warnings.push(`${file}: ${count} × ${label}`);
  }
  if (file.startsWith("src/components/") && !file.startsWith("src/components/ui/")) {
    const rawControls = [...source.matchAll(/<(?:input|select|textarea)\b/g)].length;
    if (rawControls) warnings.push(`${file}: ${rawControls} × raw form control (confirm primitive is not appropriate)`);
  }
}
if (warnings.length) console.warn(`UI consistency audit (warning-only):\n${warnings.map((warning) => `- ${warning}`).join("\n")}`);
else console.info("UI consistency audit: no new warnings.");
