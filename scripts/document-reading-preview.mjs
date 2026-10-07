// Loopback-only browser fixture: no real session, database, or R2 credentials.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url);
const { syntheticPdf } = require('./fixtures/pdf-cover-fixtures.cjs');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceVersion = '11111111-1111-4111-8111-111111111111';
let progress = null, mutation = null;
const bytes = syntheticPdf();
const server = await createServer({ configFile:false, root:path.join(project,'tests/fixtures/document-reading-browser'),
  plugins:[react(), {name:'reading-fixture',configureServer(server) { server.middlewares.use(async (req,res,next) => {
    if(req.url.startsWith('/fixture/progress')) {
      res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
      if(req.method === 'POST') { let body=''; for await(const chunk of req) body+=chunk; const input=JSON.parse(body);
        if(mutation !== input.mutationId && (progress?.revision ?? 0) !== input.expectedRevision) res.end(JSON.stringify({status:'conflict',progress}));
        else { if(mutation !== input.mutationId) { progress={page:input.page,totalPages:2,revision:(progress?.revision ?? 0)+1,updatedAt:new Date().toISOString()}; mutation=input.mutationId; } res.end(JSON.stringify({status:'saved',progress})); }
      } else res.end(JSON.stringify({sourceVersion,progress})); return;
    }
    if(req.url.includes('/api/files/') && req.url.endsWith('/preview')) {
      res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Length',bytes.length);res.setHeader('X-Reading-Source-Version',sourceVersion);res.setHeader('Cache-Control','no-store');res.end(req.method==='HEAD' ? undefined : bytes); return;
    }
    next();
  }); }}],
  resolve:{alias:[{find:'@/features/files/reading-progress-actions',replacement:path.join(project,'tests/fixtures/document-reading-browser/actions.js')},{find:'@',replacement:path.join(project,'src')}],dedupe:['react','react-dom']},
  css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:4191,strictPort:true,fs:{allow:[project]}},
});
await server.listen(); server.printUrls();
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await server.close();process.exit(0);});
