export const noteAutosaveDebounceMs = 650;
export const noteAutosaveMaxWaitMs = 4_000;
// Recovery snapshots use synchronous sessionStorage. Keep them frequent enough
// for crash recovery without serializing a long Markdown document on every key.
export const noteDraftRecoveryDebounceMs = 450;
export const noteDraftRecoveryTtlMs = 24 * 60 * 60 * 1_000;
