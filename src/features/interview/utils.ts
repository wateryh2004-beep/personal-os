import { interviewImportance, interviewStatuses } from "./constants";

const statusRank: Record<string, number> = {
  needs_review: 0,
  practicing: 1,
  developing: 2,
  unprepared: 3,
  ready: 4,
  paused: 5,
};

const importanceRank: Record<string, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export type PracticeQueueItem = {
  id: string;
  status: string;
  importance: string;
  next_practice_at?: string | null;
  last_practiced_at?: string | null;
  context_id?: string | null;
};

export function sortPracticeQueue<T extends PracticeQueueItem>(items: readonly T[], now = new Date()) {
  const nowMs = now.getTime();
  return [...items].sort((a, b) => {
    const aDue = !a.next_practice_at || Date.parse(a.next_practice_at) <= nowMs ? 0 : 1;
    const bDue = !b.next_practice_at || Date.parse(b.next_practice_at) <= nowMs ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    const s = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
    if (s) return s;
    const i = (importanceRank[a.importance] ?? 99) - (importanceRank[b.importance] ?? 99);
    if (i) return i;
    const aLast = a.last_practiced_at ? Date.parse(a.last_practiced_at) : 0;
    const bLast = b.last_practiced_at ? Date.parse(b.last_practiced_at) : 0;
    return aLast - bLast;
  });
}

export function readinessChecklist({
  keyMessage,
  answerLogic,
  currentAnswerCount,
  attemptCount,
  evidenceCount,
}: {
  keyMessage?: string | null;
  answerLogic?: string | null;
  currentAnswerCount: number;
  attemptCount: number;
  evidenceCount: number;
}) {
  const required = {
    keyMessage: Boolean(keyMessage?.trim()),
    answerLogic: Boolean(answerLogic?.trim()),
    currentAnswer: currentAnswerCount > 0,
    practiced: attemptCount > 0,
  };
  return {
    required,
    evidence: evidenceCount > 0,
    readyEligible: Object.values(required).every(Boolean),
  };
}

export function countTags(rows: readonly { issue_tags?: string[] | null }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.issue_tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function monthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 7);
}

export function buildMonthlyIssueTrend(rows: readonly { practiced_at: string; issue_tags?: string[] | null }[]) {
  const months = new Map<string, { attempts: number; issueCount: number }>();
  for (const row of rows) {
    const key = monthKey(row.practiced_at);
    const current = months.get(key) ?? { attempts: 0, issueCount: 0 };
    current.attempts += 1;
    current.issueCount += (row.issue_tags ?? []).length;
    months.set(key, current);
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      attempts: value.attempts,
      issueCount: value.issueCount,
      issuesPerAttempt: value.attempts ? value.issueCount / value.attempts : 0,
    }));
}

export function isInterviewStatus(value: string): value is typeof interviewStatuses[number] {
  return (interviewStatuses as readonly string[]).includes(value);
}

export function isInterviewImportance(value: string): value is typeof interviewImportance[number] {
  return (interviewImportance as readonly string[]).includes(value);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}
