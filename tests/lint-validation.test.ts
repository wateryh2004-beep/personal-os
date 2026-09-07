import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

it(
  "passes lint for the Tasks change set",
  () => {
    execFileSync(
      "npm",
      [
        "exec",
        "eslint",
        "--",
        "src/app/(app)/tasks/page.tsx",
        "src/components/tasks/task-workspace-loader.tsx",
        "src/components/tasks/task-workspace.tsx",
        "src/features/tasks/task-view.ts",
        "tests/task-view.test.ts",
        "tests/task-workspace-interactions.test.ts",
        "tests/lint-validation.test.ts",
      ],
      {
        cwd: repoRoot,
        stdio: "inherit",
      },
    );
  },
  120_000,
);