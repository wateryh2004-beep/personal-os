// Loopback-only, in-memory provider substitute. No real credentials or R2 calls.
// This exercises the production multipart client/component, not sealed publication.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sessions = new Map();
let attempts = {}, events = [], failPart = true, activePuts = 0, maxActivePuts = 0;
const event = value => events.push({ sequence: events.length + 1, ...value });
const json = (res, value, status = 200) => {
  res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(value));
};
async function body(req) { let text = ''; for await (const chunk of req) text += chunk; return JSON.parse(text); }
const snapshot = session => ({ ...session, parts: session.parts.map(part => ({ ...part })) });
const server = await createServer({ configFile: false, root: path.join(project, 'tests/fixtures/multipart-browser'), plugins: [react(), {
  name: 'multipart-fixture', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1:4192');
        if (url.pathname === '/fixture/reset') {
          if (activePuts) return json(res, { error: 'Uploads still active' }, 409);
          sessions.clear(); attempts = {}; events = []; failPart = true; maxActivePuts = 0;
          return json(res, { ok: true });
        }
        if (url.pathname === '/fixture/stats') return json(res, { attempts, events, activePuts, maxActivePuts, sessions: [...sessions.values()].map(snapshot) });
        if (url.pathname === '/fixture/reset-failure') { failPart = true; return json(res, { ok: true }); }
        if (url.pathname === '/api/files/multipart') {
          // The real service lists uploaded-but-not-published sessions for Finish Save.
          if (req.method === 'GET') return json(res, [...sessions.values()].filter(session => !['completed', 'aborted'].includes(session.status)).map(snapshot));
          if (req.method === 'DELETE') {
            const session = sessions.get(url.searchParams.get('sessionId'));
            if (!session || !['uploading', 'aborted'].includes(session.status)) return json(res, { error: 'Only unfinished uploads can be canceled' }, 409);
            session.status = 'aborted'; session.parts = [];
            event({ action: 'abort', filename: session.filename, sessionId: session.sessionId });
            return json(res, { ok: true });
          }
          const input = await body(req);
          if (req.method === 'POST') {
            let session = [...sessions.values()].find(session => session.checksum === input.checksum && session.filename === input.filename && session.status !== 'aborted');
            const resumed = !!session;
            if (!session) {
              const id = randomUUID();
              session = { sessionId: id, documentId: randomUUID(), status: 'uploading', filename: input.filename, contentType: input.contentType, size: input.size, checksum: input.checksum, folderId: null, partSize: 8 * 1024 * 1024, expiresAt: '2099-01-01', parts: [], file: {} };
              sessions.set(id, session);
            }
            event({ action: resumed ? 'resume' : 'create', filename: session.filename, sessionId: session.sessionId, confirmedParts: session.parts.map(part => part.partNumber) });
            return json(res, snapshot(session));
          }
          const session = sessions.get(input.sessionId);
          if (input.action === 'sign') {
            event({ action: 'sign', filename: session.filename, partNumber: input.partNumber });
            return json(res, { uploadUrl: `http://127.0.0.1:4192/part/${session.sessionId}/${input.partNumber}`, size: Math.min(session.partSize, session.size - (input.partNumber - 1) * session.partSize) });
          }
          if (session.parts.length !== Math.ceil(session.size / session.partSize)) return json(res, { error: 'missing parts' }, 409);
          session.status = 'uploaded'; event({ action: 'assembled', filename: session.filename, sessionId: session.sessionId, confirmedParts: session.parts.map(part => part.partNumber) });
          return json(res, snapshot(session));
        }
        if (url.pathname.startsWith('/part/')) {
          const [, , id, n] = url.pathname.split('/'), number = Number(n), session = sessions.get(id);
          attempts[`${session.filename}:${number}`] = (attempts[`${session.filename}:${number}`] ?? 0) + 1;
          activePuts++; maxActivePuts = Math.max(maxActivePuts, activePuts);
          try {
            let size = 0; for await (const chunk of req) size += chunk.length;
            if (number === 2 && failPart) {
              failPart = false; await new Promise(resolve => setTimeout(resolve, 150));
              event({ action: 'part-failed', filename: session.filename, partNumber: number, bytes: size, status: 503 });
              return json(res, { error: 'synthetic interruption' }, 503);
            }
            session.parts = session.parts.filter(part => part.partNumber !== number); session.parts.push({ partNumber: number, size });
            event({ action: 'part-confirmed', filename: session.filename, partNumber: number, bytes: size, status: 200 });
            return json(res, { ok: true });
          } catch (error) {
            event({ action: 'part-disconnected', filename: session.filename, partNumber: number }); throw error;
          } finally { activePuts--; }
        }
        next();
      } catch { if (!res.writableEnded) res.destroy(); }
    });
  },
}], resolve: { alias: [{ find: '@', replacement: path.join(project, 'src') }], dedupe: ['react', 'react-dom'] },
css: { postcss: { plugins: [tailwind()] } }, server: { host: '127.0.0.1', port: 4192, strictPort: true, fs: { allow: [project] } } });
await server.listen(); server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
