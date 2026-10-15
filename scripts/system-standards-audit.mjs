import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";

// Whole-source inventory, with deliberately narrow machine-checkable failures.
// A named control or a passing regex is not a complete accessibility/security audit.
const ref = process.argv.find(arg => arg.startsWith("--ref="))?.slice(6);
const paths = ref
  ? execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "src"], { encoding: "utf8" }).trim().split("\n")
  : walk("src");
function walk(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${root}/${entry.name}`) : [`${root}/${entry.name}`]);
}
const findings = [];
const counts = { files: 0, modules: {}, routes: 0, apiRoutes: 0, nativeControls: 0, hiddenControls: 0 };
const read = path => ref ? execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" }) : readFileSync(path, "utf8");
function add(path, source, offset, rule, severity = "review") {
  findings.push({ path, line: source.slice(0, offset).split("\n").length, rule, severity });
}
for (const path of paths.filter(path => /\.(tsx?|css)$/.test(path))) {
  const source = read(path);
  counts.files++;
  const moduleName = path.match(/^src\/(?:features|components)\/([^/]+)/)?.[1] ?? "app/shared";
  counts.modules[moduleName] = (counts.modules[moduleName] ?? 0) + 1;
  counts.routes += /\/page\.tsx$/.test(path) ? 1 : 0;
  counts.apiRoutes += /\/api\/.*\/route\.ts$/.test(path) ? 1 : 0;
  if (!path.startsWith("src/components/testing/") && /\.(tsx|css)$/.test(path)) {
    for (const [pattern, rule] of [
      [/\b(?:bg|text|border)-(?:zinc|neutral|gray)-\d+\b/g, "legacy-neutral"],
      [/\bbg-white\b/g, "fixed-white-surface"],
      [/\btransition-all\b/g, "broad-transition"],
      [/(?:text|bg|border)-\[#(?:365F78|EDF3F6|b8cbd6|f5f9fb)\]/gi, "legacy-accent"],
      [/text-\[(?:[789]|10(?:\.\d+)?|11(?:\.\d+)?)px\]/g, "small-ui-type"],
      [/\bfont-size\s*:\s*(?:[1-9](?:\.\d+)?|1[01](?:\.\d+)?)px\b/gi, "small-css-ui-type"],
    ]) for (const match of source.matchAll(pattern)) add(path, source, match.index, rule, "error");
  }
  if (!path.endsWith(".tsx") || path.startsWith("src/components/ui/")) continue;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const labels = new Set();
  const attributes = node => Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(file), attribute.initializer?.getText(file)]));
  function collect(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === "label") {
      const label = attributes(node).htmlFor;
      if (label) labels.add(label);
    }
    ts.forEachChild(node, collect);
  }
  collect(file);
  function inspect(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      if (["input", "select", "textarea"].includes(tag)) {
        counts.nativeControls++;
        const props = attributes(node);
        const hidden = props.type === '"hidden"' || /(?:^|["\s])hidden(?:["\s]|$)/.test(props.className ?? "");
        if (hidden) counts.hiddenControls++;
        let hasLabel = false;
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(file) === "label") { hasLabel = true; break; }
        }
        // Spreads/custom field renderers require a human trace; do not mark them as failures.
        if (!hidden && !hasLabel && !props["aria-label"] && !props["aria-labelledby"] && !labels.has(props.id)) add(path, source, node.getStart(file), "control-name-needs-trace");
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(file);
}
const report = { ref: ref ?? "working-tree", counts, findings };
const output = process.argv.find(arg => arg.startsWith("--json="))?.slice(7);
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
const summary = findings.reduce((all, item) => ({ ...all, [item.rule]: (all[item.rule] ?? 0) + 1 }), {});
console.log(JSON.stringify({ ref: report.ref, ...counts, findings: summary }, null, 2));
if (process.argv.includes("--check") && findings.some(item => item.severity === "error")) process.exitCode = 1;
