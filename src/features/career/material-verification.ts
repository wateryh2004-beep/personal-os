export type MaterialDocument = {
  id: string;
  title: string;
  mutation_revision: number;
  storage_state: string;
};
export type MaterialResume = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
};
export type MaterialObjectSnapshot = {
  token: string;
  documentRevision: number | null;
  resumeUpdatedAt: string | null;
  canVerify: boolean;
};
export function materialObjectSnapshot(
  documentId: string | null,
  resumeId: string | null,
  documents: MaterialDocument[],
  resumes: MaterialResume[],
): MaterialObjectSnapshot {
  const document = documentId
    ? documents.find((row) => row.id === documentId)
    : null;
  const resume = resumeId ? resumes.find((row) => row.id === resumeId) : null;
  const token =
    (documentId
      ? document
        ? `document:${document.id}:${document.mutation_revision}`
        : "unavailable-document"
      : "manual") +
    (resumeId
      ? resume
        ? `|resume:${resume.id}:${resume.updated_at}`
        : "|unavailable-resume"
      : "");
  return {
    token,
    documentRevision: document?.mutation_revision ?? null,
    resumeUpdatedAt: resume?.updated_at ?? null,
    canVerify:
      (!documentId || document?.storage_state === "available") &&
      (!resumeId || resume?.status === "approved"),
  };
}

/** PostgreSQL timestamps carry microseconds. Date.parse is never a version key. */
export function materialTimestampKey(value: string): bigint | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
      value,
    );
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = "", zone] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  if (Number(year) < 100) date.setUTCFullYear(Number(year));
  const epoch = date.getTime();
  if (!Number.isFinite(epoch)) return null;
  const offset =
    zone === "Z"
      ? 0
      : (zone.startsWith("-") ? -1 : 1) *
        (Number(zone.slice(1, 3)) * 60 +
          Number(zone.slice(3).replace(":", "") || 0));
  return (
    BigInt(epoch) * BigInt(1000) +
    BigInt(fraction.padEnd(6, "0")) -
    BigInt(offset) * BigInt(60000000)
  );
}

export function materialTimestampsMatch(
  left: string | null,
  right: string | null,
): boolean {
  if (left === null || right === null) return left === right;
  const leftKey = materialTimestampKey(left),
    rightKey = materialTimestampKey(right);
  return leftKey !== null && rightKey !== null && leftKey === rightKey;
}

/** Finite source identity: exact entity IDs/revision, semantic microsecond instant. */
export function materialObjectRevisionsMatch(
  left: string | null,
  right: string | null,
): boolean {
  const parse = (value: string | null) => {
    if (value === null) return null;
    const parts =
      /^(manual|document:([0-9a-fA-F-]{36}):(0|[1-9]\d*))(?:\|resume:([0-9a-fA-F-]{36}):(.+))?$/.exec(
        value,
      );
    if (!parts || (parts[4] && materialTimestampKey(parts[5]) === null))
      return null;
    return {
      document: parts[2] ?? null,
      revision: parts[3] ?? null,
      resume: parts[4] ?? null,
      updatedAt: parts[5] ?? null,
    };
  };
  const a = parse(left),
    b = parse(right);
  return (
    a !== null &&
    b !== null &&
    a.document === b.document &&
    a.revision === b.revision &&
    a.resume === b.resume &&
    materialTimestampsMatch(a.updatedAt, b.updatedAt)
  );
}
