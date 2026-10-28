import { build } from "esbuild";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join("/private/tmp", "personal-os-experience-library-preview");
await mkdir(output, { recursive: true });

const stubs = {
  "next/link": `import{createElement}from"react";export default function Link({children,...p}){return createElement("a",p,children)}`,
  "next/navigation": `export const useRouter=()=>({refresh(){}});`,
  "@/features/experience-library/actions": `
    export const appendExperienceCapture=async()=>({entryId:"11111111-1111-4111-8111-111111111111",captureId:"22222222-2222-4222-8222-222222222222",title:"Synthetic",createdEntry:false,appended:true});
    export const attachExperienceMedia=async()=>({mediaId:"33333333-3333-4333-8333-333333333333",alreadyAttached:false});
    export const createImageOnlyExperience=appendExperienceCapture;
    export const saveExperienceAiSettings=async()=>{};
    export const testExperienceAiSettings=async()=>{};
    export const removeExperienceAiSettings=async()=>{};
  `,
};

await build({
  entryPoints: [path.join(root, "tests/fixtures/experience-library-visual-harness.tsx")],
  bundle: true,
  outfile: path.join(output, "harness.js"),
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [{
    name: "personal-os-preview-stubs",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (stubs[args.path]) return { path: args.path, namespace: "preview-stub" };
        if (args.path.startsWith("@/")) {
          const base = path.join(root, "src", args.path.slice(2));
          const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
            .find((candidate) => existsSync(candidate));
          if (resolved) return { path: resolved };
        }
        return undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: "preview-stub" }, (args) => ({
        loader: "js",
        resolveDir: root,
        contents: stubs[args.path],
      }));
    },
  }],
});

const cssFiles = (await readdir(path.join(root, ".next/static/chunks")))
  .filter((name) => name.endsWith(".css"));
const css = (await Promise.all(cssFiles.map((name) =>
  readFile(path.join(root, ".next/static/chunks", name), "utf8")))).join("\n");
await writeFile(path.join(output, "index.html"), `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Experience Library visual preview</title>
  <style>${css}\n.experience-preview-shell{padding:36px 32px 72px;min-height:100vh;background:var(--surface-app)}@media(max-width:767px){.experience-preview-shell{padding:20px 16px 64px}}</style>
</head>
<body><div id="root"></div><script src="./harness.js"></script></body>
</html>`);

console.log(path.join(output, "index.html"));
