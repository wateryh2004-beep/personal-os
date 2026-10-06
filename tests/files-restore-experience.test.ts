import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";

it("passes the standard-library-only offline restore and multipart verifier regressions", () => {
  const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", "tests", "-p", "test_files_restore_experience.py", "-v"], { encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}, 30_000);
