import { getDateKeyInTimeZone } from "@/lib/date-keys";
import { isOpenCareerMilestone } from "@/features/career/milestone-temporal";

export type CareerTarget = { id: string; title: string; organization_snapshot: string | null; role_title_snapshot: string | null; next_interview_at: string | null; status: string };
export type CareerPreparation = { context_id: string | null; status: string; next_practice_at: string | null };
type Milestone = { id: string; title: string; target_date: string; status: string };
export type CareerNextAction = { key: string; href: string; title: string; meta: string; dueAt: string | null; kind: "interview" | "practice" | "preparation" | "milestone" };

/** An unscheduled preparation is not an overdue practice appointment. */
export function getCareerPreparationCounts(preparations: readonly CareerPreparation[], now: number) {
  return {
    ready: preparations.filter((prep) => prep.status === "ready").length,
    due: preparations.filter((prep) => prep.status !== "paused" && prep.next_practice_at && Date.parse(prep.next_practice_at) <= now).length,
    unscheduled: preparations.filter((prep) => !["paused", "ready"].includes(prep.status) && !prep.next_practice_at).length,
  };
}

/** Build the displayed list once; empty states must describe this list, not its input arrays. */
export function getCareerNextActions(targets: readonly CareerTarget[], preparations: readonly CareerPreparation[], milestones: readonly Milestone[], now = Date.now(), timezone = "Asia/Shanghai", focusIds?: ReadonlySet<string>): CareerNextAction[] {
  const today = getDateKeyInTimeZone(new Date(now), timezone)!;
  const actions: CareerNextAction[] = [];
  for (const target of targets) {
    if (target.status !== "active") continue;
    const { due, unscheduled } = getCareerPreparationCounts(preparations.filter((prep) => prep.context_id === target.id), now);
    const upcoming = target.next_interview_at && Date.parse(target.next_interview_at) >= now;
    if (!due && !upcoming && (!unscheduled || (focusIds && !focusIds.has(target.id)))) continue;
    const practiceDate = preparations.filter((prep) => prep.context_id === target.id && prep.status !== "paused" && prep.next_practice_at && Date.parse(prep.next_practice_at) <= now).map((prep) => prep.next_practice_at!).sort()[0];
    const showInterview = upcoming && (!due || Date.parse(target.next_interview_at!) <= now + 7 * 86400000);
    actions.push({ key: `target-${target.id}`, href: `/career/interview?context=${target.id}`, title: [target.organization_snapshot, target.role_title_snapshot || target.title].filter(Boolean).join(" · "), meta: showInterview ? "准备面试" : due ? `${due} 道题到期练习` : `${unscheduled} 道题待安排练习`, dueAt: showInterview ? target.next_interview_at : practiceDate ?? null, kind: showInterview ? "interview" : due ? "practice" : "preparation" });
  }
  for (const milestone of milestones) {
    // Historical unresolved plans have a separate review entry on the workbench.
    if (!isOpenCareerMilestone(milestone) || milestone.target_date < today) continue;
    actions.push({ key: `milestone-${milestone.id}`, href: "/career/roadmap", title: milestone.title, meta: "路线事项", dueAt: milestone.target_date, kind: "milestone" });
  }
  const priority = (item: CareerNextAction) => item.kind === "interview" ? (Date.parse(item.dueAt!) <= now + 7 * 86400000 ? 0 : 3) : { practice: 1, preparation: 2, milestone: 4 }[item.kind];
  return actions.sort((a, b) => {
    if (priority(a) !== priority(b)) return priority(a) - priority(b);
    if (!a.dueAt || !b.dueAt) return a.dueAt ? -1 : b.dueAt ? 1 : 0;
    // A DATE is a whole local day, not midnight UTC. Keep its order stable
    // beside timed interviews even when the profile day differs from UTC.
    const dayOrder = getDateKeyInTimeZone(a.dueAt, timezone)!.localeCompare(getDateKeyInTimeZone(b.dueAt, timezone)!);
    if (dayOrder) return dayOrder;
    if (a.dueAt.length === 10 || b.dueAt.length === 10) return a.dueAt.length - b.dueAt.length;
    return Date.parse(a.dueAt) - Date.parse(b.dueAt);
  }).slice(0, 4);
}
