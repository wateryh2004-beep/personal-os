import { expect, it } from "vitest";
import { workbenchHrefSchema, workspaceSceneSnapshotSchema } from "@/features/workbench/contracts";
import matrix from "./fixtures/continuous-workflows/scene-validator-matrix.json";
it.each(matrix.hrefs)("matches the shared native SQL href matrix: $value", ({ value, valid }) => { expect(workbenchHrefSchema.safeParse(value).success).toBe(valid); });
it.each(matrix.snapshots)("matches the shared native SQL scene matrix: $name", ({ value, valid }) => { expect(workspaceSceneSnapshotSchema.safeParse(value).success).toBe(valid); });

it("keeps the frozen SQL JSON shape exactly aligned with the installed Zod schema", async () => {
  const { readFile } = await import("node:fs/promises"); const { z } = await import("zod");
  const { workbenchViewStateSchema } = await import("@/features/workbench/view-state-contracts");
  const sql = await readFile("supabase/migrations/20261027095503_continuous_scene_state.sql", "utf8");
  const literal = /return public\.valid_continuous_scene_shape\(p_value,'([^\n]+)'::jsonb\);/.exec(sql)?.[1];
  expect(literal).toBeDefined(); expect(JSON.parse(literal!.replaceAll("''", "'"))).toEqual(z.toJSONSchema(workbenchViewStateSchema, { unrepresentable: "any" }));
});
