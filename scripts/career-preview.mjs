// Loopback-only UI fixture; imports no database client, environment loader or real actions.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const root=path.join(project,"tests/fixtures/career-browser");const mock=path.join(root,"mocks.jsx");
const server=await createServer({configFile:false,root,plugins:[react()],resolve:{alias:[{find:"@/features/career/queries",replacement:path.join(root,"queries.js")},{find:"@/features/career/form-actions",replacement:mock},{find:"@/components/links/entity-mention-textarea",replacement:path.join(root,"mention.jsx")},{find:"next/navigation",replacement:mock},{find:"next/link",replacement:mock},{find:"@",replacement:path.join(project,"src")}],dedupe:["react","react-dom"]},css:{postcss:{plugins:[tailwind()]}},server:{host:"127.0.0.1",port:4193,strictPort:true,fs:{allow:[project]}}});
await server.listen();server.printUrls();for(const signal of ["SIGINT","SIGTERM"])process.once(signal,async()=>{await server.close();process.exit(0);});
