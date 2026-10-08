import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
it("enforces disposable PostgreSQL-only targets and historical replay regression guards", () => {
  const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", "tests", "-p", "test_system_backup_postgres.py", "-v"], { encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}, 30_000);
