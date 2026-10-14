import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.RECOVERY_PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;");
  await db.exec(await readFile(new URL("../supabase/migrations/20261014072543_question_password_recovery.sql", import.meta.url), "utf8"));
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select public.consume_question_recovery_attempt()"), /permission denied/);
    await assert.rejects(db.query("select * from public.question_recovery_attempts"), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  const results = await Promise.all(Array.from({ length: 20 }, () => db.query("select public.consume_question_recovery_attempt() as allowed")));
  assert.equal(results.filter((result) => result.rows[0].allowed).length, 5);
  assert.equal((await db.query("select attempts from public.question_recovery_attempts")).rows[0].attempts, 6);
  await db.exec("update public.question_recovery_attempts set window_started_at = clock_timestamp() - interval '16 minutes'");
  assert.equal((await db.query("select public.consume_question_recovery_attempt() as allowed")).rows[0].allowed, true);
  assert.equal((await db.query("select attempts from public.question_recovery_attempts")).rows[0].attempts, 1);
  console.log("PASS: anonymous/authenticated denial, shared 5-attempt limit, capped counter, cooldown reset");
} finally { await db.close(); }
