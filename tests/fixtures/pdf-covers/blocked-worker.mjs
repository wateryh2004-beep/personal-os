// Deliberately non-cooperative synthetic renderer used only for SIGKILL tests.
process.once("message", () => { for (;;) { /* synchronous CPU loop */ } });
