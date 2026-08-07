// Vitest runs server-side modules in Node. Next.js enforces this import only
// during application bundling, so tests use an inert module without weakening
// the production boundary.
export {};
