import { z } from "zod";

export const captureIntentSchema = z.object({ intentId: z.string().uuid(), content: z.string().max(10_000) }).strict();
export type CaptureIntent = z.infer<typeof captureIntentSchema>;
export type CaptureOutcome =
  | { status: "saved"; intentId: string; inboxId: string; classification: "ready" | "failed" | "unclassified" | "needs-check" }
  | { status: "needs-check"; intentId: string; message: string }
  | { status: "rejected"; intentId: string; code: "invalid" | "conflict" | "unavailable"; message: string };
