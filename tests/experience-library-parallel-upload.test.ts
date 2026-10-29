import { expect, it } from "vitest";
import { mapWithConcurrency } from "@/features/experience-library/parallel-upload";

it("limits concurrent uploads and returns results in selection order even when they finish out of order", async () => {
  let active = 0, peak = 0;
  const releases: Record<number, () => void> = {};
  const operation = mapWithConcurrency([0, 1, 2, 3, 4, 5], 3, async (item) => {
    active += 1; peak = Math.max(peak, active);
    await new Promise<void>((resolve) => { releases[item] = resolve; });
    active -= 1;
    return `image-${item}`;
  });
  expect(Object.keys(releases)).toHaveLength(3);
  releases[2](); releases[1](); releases[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(Object.keys(releases)).toHaveLength(6);
  releases[5](); releases[4](); releases[3]();
  expect(await operation).toEqual(["image-0", "image-1", "image-2", "image-3", "image-4", "image-5"]);
  expect(peak).toBe(3);
});
