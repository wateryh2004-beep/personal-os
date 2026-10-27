"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { InterviewInsightsView } from "@/components/career/interview/interview-insights-view";
import { PracticeAttemptForm } from "@/components/career/interview/practice-attempt-form";
import { InterviewPrompt } from "@/components/career/interview/interview-prompt";
import { fixturePracticeAttempts, fixturePracticeIds } from "@/features/testing/continuous-domain-fixture-data";
import { fixturePracticeTransport } from "@/features/testing/continuous-domain-transports";
import { postFixture } from "@/features/testing/continuous-fixture-transports";
import { countTags, buildMonthlyIssueTrend } from "@/features/interview/utils";
const attemptSchema = z.object({ id: z.uuid(), preparation_id: z.uuid().nullable(), story_id: z.uuid().nullable(), issue_tags: z.array(z.string()), strength_tags: z.array(z.string()), practiced_at: z.string(), duration_seconds: z.number().nullable(), next_focus: z.string(), prompt_snapshot: z.string() });
export function ContinuousPracticeWorkspace({ path }: { path: string }) {
  const params = useSearchParams(), [attempts, setAttempts] = useState<z.infer<typeof attemptSchema>[]>(fixturePracticeAttempts);
  useEffect(() => { let current = true; void postFixture("practice-snapshot", null).then(value => { if (current) setAttempts(z.array(attemptSchema).max(100).parse(value)); }); return () => { current = false; }; }, [path]);
  if (path === "/career/interview/insights") return <InterviewInsightsView context={params.get("context") ?? undefined} data={{ contexts: [], attempts, preparations: [{ id: fixturePracticeIds.preparation, question_id: fixturePracticeIds.question, context_id: null, status: "ready", importance: "normal", last_practiced_at: null }], stories: [], issueCounts: countTags(attempts), monthlyTrend: buildMonthlyIssueTrend(attempts), competencyCoverage: [], priorityGaps: [], storyUsage: [], unavailable: false }} />;
  const parent = params.get("parent"), invalidParent = Boolean(parent && parent !== fixturePracticeIds.parent);
  return <section className="p-5"><InterviewPrompt prompt="合成问题：如何核对资料？" />{parent ? <p role="status">{invalidParent ? "原练习不可用，当前输入保留。" : "上次重点：先给结论，再说明核对过程。"}</p> : null}{params.get("saved") ? <p role="status">这次练习已保存</p> : null}<PracticeAttemptForm key={params.get("saved") ?? "unsaved"} transport={fixturePracticeTransport} preparationId={fixturePracticeIds.preparation} parentAttemptId={parent ?? undefined} blocked={invalidParent ? "原练习不可用，请重新选择。" : undefined} historyHref="/career/interview/insights">
    <input type="hidden" name="parent_attempt_id" value={parent ?? ""} /><input type="hidden" name="preparation_id" value={fixturePracticeIds.preparation} /><input type="hidden" name="answer_version_id" value="" /><input type="hidden" name="input_mode" value="text" /><input type="hidden" name="language" value="zh" /><input type="hidden" name="prompt_snapshot" value="合成问题：如何核对资料？" /><input type="hidden" name="strength_tags" value="" /><input type="hidden" name="confidence_before" value="" /><input type="hidden" name="confidence_after" value="" /><input type="hidden" name="story_id" value="" /><label className="block">我的回答<textarea name="response_transcript_markdown" rows={10} maxLength={50000} className="ui-field mt-3 min-h-64 w-full resize-y p-4" /></label>
  </PracticeAttemptForm></section>;
}
