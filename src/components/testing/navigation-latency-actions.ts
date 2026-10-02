"use server";

import { revalidatePath } from "@/lib/workspace-revalidation";

/** Fixture-only acknowledgement exercises the real Server Action cookie bridge. */
export async function acknowledgeLatencyFixtureMutation() {
  if (process.env.E2E_MOBILE_HARNESS !== "1") throw new Error("fixture_unavailable");
  await revalidatePath("/tasks");
}
