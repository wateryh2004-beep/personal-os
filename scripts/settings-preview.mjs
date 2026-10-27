// Isolated development-only fixture. It is not a Next route and cannot access the database.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(project, "tests/fixtures/settings-browser");
const mock = path.join(root, "mocks.jsx");
const server = await createServer({
  configFile: false,
  root,
  plugins: [react(), {
    name: "isolated-ordinary-comparison-action",
    enforce: "pre",
    resolveId(id, importer) {
      // Next turns this Server Function into a reference. Vite must stop at
      // that same I/O boundary instead of loading authentication/DB modules.
      if (id === "./ordinary-comparison" && importer?.split("?")[0] === path.join(project, "src/features/workflow-continuity/ordinary-comparison-transport.tsx")) return mock;
      return null;
    },
  }],
  define: { "process.env.CONTINUOUS_FIXTURE_COMPILED": JSON.stringify("0"), "process.env.NEXT_PUBLIC_PERF_DEBUG": JSON.stringify("false") },
  resolve: { alias: [
    { find: "@/features/files/storage-inspection/budget-actions", replacement: mock },
    { find: "@/features/ai/actions", replacement: mock },
    { find: "@/features/ai/queries", replacement: mock },
    { find: "@/features/system-status/queries", replacement: mock },
    { find: "@/features/workflow-continuity/ordinary-comparison", replacement: mock },
    { find: "next/navigation", replacement: mock },
    { find: "next/link", replacement: mock },
    { find: "@", replacement: path.join(project, "src") },
  ], dedupe: ["react", "react-dom"] },
  css: { postcss: { plugins: [tailwind()] } },
  server: { host: "127.0.0.1", port: 4183, strictPort: true, fs: { allow: [project] } },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await server.close(); process.exit(0); });
