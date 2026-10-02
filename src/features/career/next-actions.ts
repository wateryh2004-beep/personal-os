type Target = { id: string; title: string; organization_snapshot: string | null; role_title_snapshot: string | null; next_interview_at: string | null; status: string };
type Preparation = { context_id: string | null; status: string; next_practice_at: string | null };
type Milestone = { id: string; title: string; target_date: string | null; status: string };
export type CareerNextAction = { key: string; href: string; title: string; meta: string; dueAt: string | null };

/** Build the displayed list once; empty states must describe this list, not its input arrays. */
export function getCareerNextActions(targets: readonly Target[], preparations: readonly Preparation[], milestones: readonly Milestone[], now = Date.now()): CareerNextAction[] {
  const actions: CareerNextAction[] = [];
  for (const target of targets) {
    if (target.status !== "active") continue;
    const due = preparations.filter((prep) => prep.context_id === target.id && prep.status !== "paused" && (!prep.next_practice_at || Date.parse(prep.next_practice_at) <= now)).length;
    const upcoming = target.next_interview_at && Date.parse(target.next_interview_at) >= now;
    if (!due && !upcoming) continue;
    actions.push({ key: `target-${target.id}`, href: `/career/interview?context=${target.id}`, title: [target.organization_snapshot, target.role_title_snapshot || target.title].filter(Boolean).join(" · "), meta: due ? `${due} 道题待练习` : "准备面试", dueAt: upcoming ? target.next_interview_at : null });
  }
  for (const milestone of milestones) {
    if (["completed", "skipped"].includes(milestone.status)) continue;
    actions.push({ key: `milestone-${milestone.id}`, href: "/career/roadmap", title: milestone.title, meta: "路线事项", dueAt: milestone.target_date });
  }
  return actions.sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity)).slice(0, 4);
}
