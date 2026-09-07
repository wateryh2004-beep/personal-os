import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

it(
  "passes repository lint",
  () => {
    execFileSync("npm", ["run", "lint"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  },
  120_000,
);
