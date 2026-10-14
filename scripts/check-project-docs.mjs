import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--inventory")) {
  throw new Error("Usage: node scripts/check-project-docs.mjs [--inventory pinned-tree.json]");
}

// A pinned GitHub tree lets a documentation-only source snapshot validate paths.
// CI uses the complete checkout and never supplies this optional inventory.
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root, encoding: "utf8",
}).split("\0").filter(Boolean);
let sourceCommit;
let inventory = [];
if (args.length) {
  const source = JSON.parse(readFileSync(path.resolve(args[1]), "utf8"));
  if (!/^[a-f0-9]{40}$/.test(source.commit) || !Array.isArray(source.paths)
      || source.paths.some((value) => typeof value !== "string" || value.startsWith("/") || value.split("/").includes(".."))) {
    throw new Error("Invalid pinned source-tree inventory");
  }
  sourceCommit = source.commit;
  inventory = source.paths;
}
const paths = new Set([...inventory, ...tracked]);
const documents = [...paths].filter((name) => name.endsWith(".md")
  && (!name.includes("/") || name.startsWith("docs/") || name === ".github/PULL_REQUEST_TEMPLATE.md"));
const errors = [];
const required = ["README.md", "AGENTS.md", "CLAUDE.md", "docs/README.md", "docs/project-governance.md",
  "docs/agent-workflow.md", "docs/product-spec.md", "docs/design-system.md", "docs/data-governance.md",
  "docs/security.md", "docs/quality-standards.md", "docs/release-operations.md"];
for (const name of required) {
  if (!paths.has(name) || !existsSync(path.join(root, name))) errors.push(`Missing required document: ${name}`);
}

const stripFences = (text) => text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
const slug = (text) => text.replace(/<[^>]*>/g, "").replace(/`/g, "").trim().toLowerCase()
  .replace(/[^\p{L}\p{N}_\- ]/gu, "").replace(/ /g, "-");
const anchorCache = new Map();
function anchors(name) {
  if (anchorCache.has(name)) return anchorCache.get(name);
  const text = stripFences(readFileSync(path.join(root, name), "utf8"));
  const values = new Set();
  const duplicates = new Map();
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = slug(match[1]);
    const count = duplicates.get(base) ?? 0;
    values.add(count ? `${base}-${count}` : base);
    duplicates.set(base, count + 1);
  }
  for (const match of text.matchAll(/<(?:a|h[1-6])\b[^>]*(?:id|name)=["']([^"']+)["']/g)) values.add(match[1]);
  anchorCache.set(name, values);
  return values;
}

let links = 0;
for (const name of documents) {
  if (!existsSync(path.join(root, name))) {
    errors.push(`Document content unavailable: ${name}`);
    continue;
  }
  const text = stripFences(readFileSync(path.join(root, name), "utf8"));
  const targets = [...text.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
  // Reference definitions are checked even when unused, so stale destinations
  // cannot remain hidden behind a reference-style link.
  for (const match of text.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*<?([^\s>]+)>?/gm)) targets.push(match[1]);
  for (const raw of targets) {
    if (/^[a-z][\w+.-]*:/i.test(raw) || raw.startsWith("//")) continue;
    links += 1;
    let file;
    let anchor;
    try {
      const [location, fragment] = raw.split("#", 2);
      file = decodeURIComponent(location.split("?", 1)[0]);
      anchor = fragment ? decodeURIComponent(fragment) : "";
    } catch {
      errors.push(`${name}: invalid encoded link ${raw}`);
      continue;
    }
    const target = file ? path.posix.normalize(file.startsWith("/")
      ? file.slice(1) : path.posix.join(path.posix.dirname(name), file)) : name;
    if (target.startsWith("../") || (!paths.has(target) && ![...paths].some((value) => value.startsWith(`${target}/`)))) {
      errors.push(`${name}: missing local target ${raw}`);
    } else if (anchor && target.endsWith(".md") && existsSync(path.join(root, target)) && !anchors(target).has(anchor)) {
      errors.push(`${name}: missing Markdown anchor ${raw}`);
    }
  }
}

const index = existsSync(path.join(root, "docs/README.md")) ? readFileSync(path.join(root, "docs/README.md"), "utf8") : "";
const topics = [...index.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((match) => Number(match[1]));
if (topics.length !== 34 || new Set(topics).size !== 34 || topics.some((value, i) => value !== i + 1)) {
  errors.push("The documentation index must cover topics 1–34 exactly once and in order");
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ documents: documents.length, localLinks: links, topics: topics.length,
    mode: sourceCommit ? "pinned-documentation-snapshot" : "full-checkout", sourceCommit: sourceCommit ?? null }));
}
