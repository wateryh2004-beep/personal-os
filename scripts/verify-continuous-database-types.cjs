/* Compatibility entrypoint: implementation uses ESM without lint suppressions. */
void import("./verify-continuous-database-types.mjs").then(module => module.runCli()).catch(error => { console.error(error); process.exitCode = 1; });
