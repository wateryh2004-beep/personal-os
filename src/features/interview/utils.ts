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

export type SmartPracticeQueueItem = PracticeQueueItem & {
  variant_kind?: string | null;
  story_count?: number;
  usable_story_count?: number;
  competency_count?: number;
  covered_competency_count?: number;
  attempt_count?: number;
  context_priority?: number | null;
  next_interview_at?: string | null;
};

const smartStatusWeight: Record<string, number> = {
  needs_review: 30,
  unprepared: 22,
  developing: 16,
  practicing: 10,
  ready: 0,
  paused: -100,
};

const smartImportanceWeight: Record<string, number> = {
  critical: 36,
  high: 28,
  normal: 18,
  low: 8,
};

export function rankSmartPracticeQueue<T extends SmartPracticeQueueItem>(items: readonly T[], now = new Date()) {
  const nowMs = now.getTime();
  return items
    .map((item) => {
      let score = smartStatusWeight[item.status] ?? 0;
      score += smartImportanceWeight[item.importance] ?? 0;
      const reasons: string[] = [];
      const attempts = item.attempt_count ?? 0;
      const stories = item.story_count ?? 0;
      const usableStories = item.usable_story_count ?? 0;
      const competencyCount = item.competency_count ?? 0;
      const coveredCompetencies = item.covered_competency_count ?? 0;

      if (attempts === 0) {
        score += 28;
        reasons.push("还没练过");
      } else if (item.last_practiced_at) {
        const staleDays = Math.max(0, Math.floor((nowMs - Date.parse(item.last_practiced_at)) / 86_400_000));
        if (staleDays >= 7) {
          score += Math.min(18, 6 + Math.floor(staleDays / 3));
          reasons.push(`距上次练习 ${staleDays} 天`);
        }
      }

      if (!item.next_practice_at || Date.parse(item.next_practice_at) <= nowMs) {
        score += 12;
        if (attempts > 0 && reasons.length < 2) reasons.push("到期复习");
      }

      if (stories === 0) {
        score += 24;
        reasons.push("缺少可用故事");
      } else if (usableStories === 0) {
        score += 15;
        reasons.push("故事还需完善");
      }

      const missingCompetencies = Math.max(0, competencyCount - coveredCompetencies);
      if (missingCompetencies > 0) {
        score += Math.min(21, missingCompetencies * 7);
        reasons.push("能力证据不足");
      }

      if ((item.context_priority ?? 0) >= 4) {
        score += 8;
        reasons.push("目标岗位优先");
      }

      if (item.next_interview_at) {
        const days = Math.ceil((Date.parse(item.next_interview_at) - nowMs) / 86_400_000);
        if (days >= 0 && days <= 14) {
          score += 26;
          reasons.push(`面试还有 ${days} 天`);
        } else if (days > 14 && days <= 30) {
          score += 12;
        }
      }

      if (item.variant_kind && ["alternate", "follow_up", "pressure"].includes(item.variant_kind)) score -= 50;

      return {
        ...item,
        practice_priority_score: score,
        practice_reasons: [...new Set(reasons)].slice(0, 2),
      };
    })
    .sort((a, b) =>
      b.practice_priority_score - a.practice_priority_score
      || (a.last_practiced_at ? Date.parse(a.last_practiced_at) : 0) - (b.last_practiced_at ? Date.parse(b.last_practiced_at) : 0)
    );
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
