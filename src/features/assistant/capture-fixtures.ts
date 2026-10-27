import type { captureInboxIntent, reconcileInboxCaptureIntent } from "@/features/inbox/actions";
export type CaptureFixtureTransport = { submit: typeof captureInboxIntent; reconcile: typeof reconcileInboxCaptureIntent };
