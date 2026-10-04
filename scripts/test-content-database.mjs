#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const help = `Local-only, rollback-only content database verification.

Prerequisites, prepared separately by an authorized developer:
- An isolated PostgreSQL database with the relevant Personal OS migrations
- psql already installed; this runner installs/provisions nothing
- PGHOST=127.0.0.1 or ::1; PGDATABASE=personal_os_content_test (optional _suffix)
- PGUSER identifying a local test administrator able to SET ROLE and make fixtures
- CONTENT_DB_TEST_ALLOW_LOCAL=1
- Supply authentication through the process environment or your existing pgpass;
  never put credentials in command arguments

Run: node scripts/test-content-database.mjs
  Uses an already-installed, reviewed write_content function
Run: node scripts/test-content-database.mjs --proposal
  Includes the prepared function/index in the same rolled-back transaction;
  refuses an existing function/index rather than replacing either

Only synthetic fixtures are used. Every mutation rolls back, including the
proposal in --proposal mode. No production URL, service configuration, or
non-loopback host is accepted. SQL errors stop the process; no automatic retry.

Pending two-process concurrency gate (not claimed by the single-session suite):
1. In a disposable database, prepare shared synthetic owners/records explicitly
2. Session A: BEGIN; call note.update; hold transaction open before COMMIT
3. Session B: same owner/operation/payload; must wait, then return replayed=true
4. Repeat with different operation IDs and identical expected note revision:
   exactly one commits; the second receives P0101 and creates no snapshots
5. Repeat interview appends on one mode/language/duration stream:
   exactly one expectedVersion wins; no duplicate version number or receipt
6. Repeat with A rolling back: B should succeed once, with one durable receipt
7. Reset/drop that disposable database through its separately authorized setup

Shared fixtures must commit for independent sessions to see them. This runner
never commits fixtures and deliberately does not implement that separate gate.
`;

export function validateLocalDatabaseEnvironment(environment) {
  if (environment.CONTENT_DB_TEST_ALLOW_LOCAL !== "1") throw new Error("Explicit local test opt-in is required");
  if (!["127.0.0.1", "::1"].includes(environment.PGHOST)) throw new Error("PGHOST must be a literal loopback address");
  if (environment.PGHOSTADDR && environment.PGHOSTADDR !== environment.PGHOST) throw new Error("PGHOSTADDR must match the loopback host");
  if (environment.PGSERVICE || environment.PGSERVICEFILE || environment.DATABASE_URL) throw new Error("Connection URLs and service indirection are not accepted");
  if (!/^personal_os_content_test(?:_[a-z0-9_]+)?$/.test(environment.PGDATABASE ?? "")) throw new Error("Use a dedicated personal_os_content_test database");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(environment.PGUSER ?? "")) throw new Error("An explicit local test PGUSER is required");
  const port = environment.PGPORT ?? "5432";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("PGPORT must be a valid TCP port");
  // Deliberate allowlist: inherited libpq service/options/host lists cannot reroute.
  const result = {
    PATH: environment.PATH ?? "",
    HOME: environment.HOME ?? "",
    PGHOST: environment.PGHOST,
    PGHOSTADDR: environment.PGHOST,
    PGPORT: port,
    PGDATABASE: environment.PGDATABASE,
    PGUSER: environment.PGUSER,
    PGAPPNAME: "personal-os-content-rollback-test",
    PGCONNECT_TIMEOUT: "5",
    PGSSLMODE: "disable",
  };
  for (const key of ["PGPASSWORD", "PGPASSFILE", "SYSTEMROOT", "SystemRoot", "TMPDIR", "TEMP", "TMP"]) {
    if (environment[key] !== undefined) result[key] = environment[key];
  }
  return result;
}

export function buildDatabaseTestSql(withProposal = false) {
  const tests = readFileSync(resolve(root, "tests/database/content-write.sql"), "utf8");
  if (/^\s*commit\s*;/im.test(tests) || !/^rollback;$/m.test(tests)) throw new Error("Test transaction must end in rollback");
  if (!withProposal) return tests;
  const proposal = readFileSync(resolve(root, "docs/contracts/content-write-transaction.sql"), "utf8");
  if ((proposal.match(/^begin;$/gm) ?? []).length !== 1 || (proposal.match(/^commit;$/gm) ?? []).length !== 1) throw new Error("Unexpected proposal transaction structure");
  const proposalBody = proposal.replace(/^begin;$/m, "").replace(/^commit;$/m, "");
  const testBody = tests.replace(/^begin;$/m, "");
  const combined = `begin;\n${proposalBody}\n${testBody}`;
  if (/^\s*commit\s*;/im.test(combined)) throw new Error("A test proposal must never commit");
  return combined;
}

export function main(args = process.argv.slice(2), environment = process.env) {
  if (args.length === 1 && args[0] === "--help") { process.stdout.write(help); return 0; }
  if (args.some((argument) => argument !== "--proposal") || args.length > 1) {
    process.stderr.write("Only --help or --proposal is supported; connection arguments are forbidden\n");
    return 2;
  }
  let childEnvironment;
  let sql;
  try {
    childEnvironment = validateLocalDatabaseEnvironment(environment);
    const database = childEnvironment.PGDATABASE; // Strict identifier-only validation above.
    const identityGuard = `do $$ begin if current_database() <> '${database}' then raise exception 'wrong isolated database'; end if; end $$;\n`;
    sql = identityGuard + buildDatabaseTestSql(args.includes("--proposal"));
  } catch (error) {
    process.stderr.write(`${error.message}. See --help\n`);
    return 2;
  }
  const run = spawnSync("psql", ["--no-psqlrc", "--no-password", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1"], {
    cwd: root, env: childEnvironment, input: sql, encoding: "utf8", shell: false,
    timeout: 120_000, maxBuffer: 2_000_000,
  });
  if (run.error?.code === "ENOENT") {
    process.stderr.write("psql is not installed; no database connection was attempted\n");
    return 2;
  }
  if (run.error || run.status !== 0 || !run.stdout.includes("PASS: content owner/RLS")) {
    // Do not print psql stderr, SQL statements, connection details, or credentials.
    process.stderr.write("Database verification failed or was interrupted; transaction closed without a commit. Review the isolated setup before retrying\n");
    return 1;
  }
  process.stdout.write("PASS: isolated content transaction checks completed; synthetic changes rolled back\n");
  process.stdout.write("Two-session concurrency remains a separate verification gate; see --help\n");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
