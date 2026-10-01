export type WorkspaceAnswer = {
  id: string;
  preparation_id: string;
  answer_mode: string;
  target_seconds: number | null;
  language: string;
  body_markdown: string;
  version_number: number;
  status: string;
  source: string;
  confirmed_at: string | null;
  updated_at: string;
  archived_at?: string | null;
};

export type WorkspaceAnswerMetadata = Pick<WorkspaceAnswer,
  "status" | "source" | "language" | "confirmed_at" | "version_number"
>;

/** Adopted answers win; otherwise expose the newest usable reference draft. */
export function selectWorkspaceAnswer<T extends WorkspaceAnswer>(answers: T[], language = "zh"): T | null {
  return answers.filter((answer) =>
    answer.answer_mode === "spoken"
    && (answer.status === "current" || answer.status === "draft")
    && !answer.archived_at
    && Boolean(answer.body_markdown?.trim()),
  ).sort((a, b) => {
    const status = Number(b.status === "current") - Number(a.status === "current");
    const languageRank = (value: string) => value === language ? 0 : value === "bilingual" ? 1 : 2;
    const preferredLanguage = languageRank(a.language) - languageRank(b.language);
    if (status || preferredLanguage) return status || preferredLanguage;
    // Keep the existing untimed / short spoken-answer preference for adopted answers.
    if (a.status === "current") {
      const duration = (a.target_seconds ?? 0) - (b.target_seconds ?? 0);
      if (duration) return duration;
    }
    return b.updated_at.localeCompare(a.updated_at)
      || b.version_number - a.version_number
      || (a.target_seconds ?? 0) - (b.target_seconds ?? 0)
      || a.id.localeCompare(b.id);
  })[0] ?? null;
}

export function workspaceAnswerMetadata(answer: WorkspaceAnswer | null): WorkspaceAnswerMetadata | null {
  if (!answer) return null;
  return {
    status: answer.status,
    source: answer.source,
    language: answer.language,
    confirmed_at: answer.confirmed_at,
    version_number: answer.version_number,
  };
}
