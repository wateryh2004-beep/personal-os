export const leisureKinds = ["film", "series", "game", "book", "music", "outing", "other"] as const;
export const leisureStatuses = ["interested", "planned", "current", "completed"] as const;
export const leisureReactions = ["liked", "not_for_me", "none"] as const;

export type LeisureKind = (typeof leisureKinds)[number];
export type LeisureStatus = (typeof leisureStatuses)[number];
export type LeisureReaction = (typeof leisureReactions)[number];

export type LeisureSource = {
  label: string;
  url: string;
  kind: "official" | "rating" | "reference";
  verification: "verified" | "unverified" | "stale";
  checked_at: string | null;
};

/** Preserve the platform's original value/scale; never synthesize a score. */
export type LeisureRating = {
  platform: string;
  value: string;
  scale: string | null;
  checked_at: string;
  source_url: string;
};

export type LeisureContent = {
  title: string;
  kind: LeisureKind;
  why: string;
  body_markdown: string;
  how_to_start: string | null;
  duration_minutes: number | null;
  platform: string | null;
  location: string | null;
  starts_at: string | null;
  cost_text: string | null;
  setting: "home" | "out" | "either" | null;
  company: "solo" | "together" | "either" | null;
  budget: "free" | "paid" | "unknown";
  sources: LeisureSource[];
  ratings: LeisureRating[];
};

export type LeisureFeedback = {
  status: LeisureStatus | null;
  reaction: LeisureReaction;
  personal_note: string;
  linked_note_id: string | null;
  linked_note_title: string | null;
  linked_note_available: boolean;
  revision: number;
  updated_at: string;
};

export type LeisureExperience = LeisureContent & {
  id: string;
  content_revision: number;
  created_at: string;
  updated_at: string;
  feedback: LeisureFeedback | null;
};

/** Home omits long-form editorial payloads; detail keeps the complete record. */
export type LeisureSummary = Omit<LeisureExperience, "body_markdown" | "sources" | "ratings">;

export type LeisureFeedbackInput = {
  experience_id: string;
  /** Zero creates feedback. Every later save must match the last read revision. */
  expected_revision: number;
  status: LeisureStatus | null;
  reaction: LeisureReaction;
  personal_note: string;
  linked_note_id: string | null;
};

export type LeisureFeedbackResult =
  | { ok: true; feedback: LeisureFeedback }
  | { ok: false; error: "invalid" | "conflict" | "unavailable" | "note_unavailable" };
