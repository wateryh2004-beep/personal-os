import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { continuousFixtureState } from "@/features/testing/continuous-fixture-state";
import { applySyntheticLife, undoSyntheticLife, readSyntheticLife } from "@/features/testing/continuous-life-fixture";
import { syntheticDomainOperation } from "@/features/testing/continuous-domain-fixture";
import { fixtureMaterials, fixtureShopping } from "@/features/testing/continuous-domain-fixture-data";
import { fixtureProject } from "@/features/testing/continuous-fixture-data";
const fresh = () => continuousFixtureState(`personal-os-fixture-session=${crypto.randomUUID()}`);
afterEach(() => vi.unstubAllEnvs());

it("serves only the finite tasks.create proposal set for matching global/tasks runs and never executes it on stream completion", async () => {
  vi.stubEnv("CONTINUOUS_FIXTURE_COMPILED", "1"); vi.stubEnv("CONTINUOUS_WORKFLOWS_E2E_RUNTIME", "1"); vi.stubEnv("CI", "true"); vi.stubEnv("VERCEL", ""); vi.stubEnv("VERCEL_ENV", "");
  const { POST, GET } = await import("@/app/api/continuous-workflows-fixture/[...path]/route");
  const cookie = `personal-os-continuous-fixture=synthetic-v3; personal-os-fixture-session=${crypto.randomUUID()}`;
  const state = continuousFixtureState(cookie); state.delay = 1;
  const post = (path: string[], body: unknown) => POST(new Request(`http://127.0.0.1:3000/api/continuous-workflows-fixture/${path.join("/")}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ path }) });
  for (const surface of ["tasks", "global", "calendar", "notes-library", "career", "notes", "reviews", "inbox"]) {
    const created = await post(["api", "assistant", "runs"], { surface });
    expect(created.status).toBe(200); const { runId } = await created.json() as { runId: string };
    const stream = await post(["api", "assistant"], { surface, runId });
    expect(stream.status).toBe(200); expect(await stream.text()).toContain("data: [DONE]");
    const actions = [...state.actions.values()].filter(action => action.runId === runId);
    expect(actions).toHaveLength(surface === "global" || surface === "tasks" ? 5 : 0);
    expect(actions.every(action => action.domain === "tasks" && action.actionType === "tasks.create" && action.status === "proposed")).toBe(true);
    expect(state.runs.get(runId)?.status).toBe("completed");
    const path = ["api", "assistant", "runs", runId];
    const read = await GET(new Request(`http://127.0.0.1:3000/api/continuous-workflows-fixture/${path.join("/")}`, { headers: { cookie } }), { params: Promise.resolve({ path }) });
    expect((await read.json()).actions).toEqual(actions);
    const repeat = await post(["api", "assistant"], { surface, runId }); await repeat.text();
    expect([...state.actions.values()].filter(action => action.runId === runId)).toEqual(actions);
  }
  const created = await post(["api", "assistant", "runs"], { surface: "tasks" }); const { runId } = await created.json() as { runId: string };
  const mismatched = await post(["api", "assistant"], { surface: "calendar", runId });
  expect(mismatched.status).toBe(409); expect(state.runs.get(runId)?.status).toBe("pending");
  expect([...state.actions.values()].some(action => action.runId === runId)).toBe(false);
  expect((await post(["api", "assistant", "runs"], { surface: "arbitrary-tool-surface" })).status).toBe(400);
  expect((await post(["api", "assistant"], { surface: "arbitrary-tool-surface" })).status).toBe(400);
  expect(Object.keys(state.writes)).toEqual(["agent-run-create"]);
});
it("keeps synthetic Life batch writes atomic, exact-intent idempotent, and receipt-only undo checks current revisions", () => {
  const state=fresh(), id=fixtureShopping[0].id, bad=fixtureShopping[1].id, requestId=crypto.randomUUID();
  expect(applySyntheticLife(state,{requestId,operation:"shopping_purchased",items:[{id,expected_revision:1},{id:bad,expected_revision:1}]})).toMatchObject({ok:false,error:"not_ready"});expect(state.writes.shopping_purchased).toBeUndefined();expect(state.lifeRows.get(id)?.status).toBe("ready");
  const input={requestId,operation:"shopping_purchased",items:[{id,expected_revision:1}]};const result=applySyntheticLife(state,input);expect(result.ok).toBe(true);if(!result.ok)throw Error("fixture failed");
  expect(applySyntheticLife(state,input)).toMatchObject({ok:true,replayed:true,receiptId:result.receiptId});expect(state.writes.shopping_purchased).toBe(1);
  expect(applySyntheticLife(state,{...input,items:[{id:bad,expected_revision:1}]})).toMatchObject({ok:false,error:"conflict"});
  expect(readSyntheticLife(state,crypto.randomUUID())).toBeNull();
  expect(undoSyntheticLife(state,result.receiptId)).toMatchObject({status:"success"});expect(state.lifeRows.get(id)).toMatchObject({status:"ready",mutation_revision:3});expect(state.writes["life-undo"]).toBe(1);
  expect(undoSyntheticLife(state,result.receiptId)).toMatchObject({status:"success"});expect(state.writes["life-undo"]).toBe(1);
});
it("refuses synthetic undo after a later writer rather than silently overwrite",()=>{const state=fresh(),id=fixtureShopping[0].id;const result=applySyntheticLife(state,{requestId:crypto.randomUUID(),operation:"shopping_quantity",items:[{id,expected_revision:1,quantity:"3",quantity_unit:"份"}]});if(!result.ok)throw Error("fixture failed");state.lifeRows.set(id,{...state.lifeRows.get(id)!,mutation_revision:3,quantity:"4"});expect(undoSyntheticLife(state,result.receiptId)).toMatchObject({status:"conflict"});expect(state.lifeRows.get(id)?.quantity).toBe("4");});
it("validates synthetic Project ownership references and performs CAS with an immutable submitted snapshot",()=>{const state=fresh(),input={id:fixtureProject.id,revision:1,goal:"提交A",blocker:"原阻塞",nextTask:null};expect(syntheticDomainOperation(state,"project-save",input)).toMatchObject({description:"提交A",mutation_revision:2});input.goal="后输B";expect(syntheticDomainOperation(state,"project-read",fixtureProject.id)).toMatchObject({description:"提交A"});expect(()=>syntheticDomainOperation(state,"project-save",input)).toThrow("synthetic_conflict");expect(state.writes["project-save"]).toBe(1);});
it("does not renew a manual material verification when only the note was saved",()=>{const state=fresh(),row=fixtureMaterials.checks[0];const saved=syntheticDomainOperation(state,"material-save",{id:row.id,opportunityId:row.opportunity_id,revision:1,label:row.label,required:row.required,documentId:row.document_id,resumeId:row.resume_version_id,note:"新备注",verificationIntent:"keep",verificationObjectRevision:null,verificationDocumentRevision:null,verificationResumeUpdatedAt:null});expect(saved).toMatchObject({verified_at:row.verified_at,verified_object_revision:row.verified_object_revision,note:"新备注",revision:2});});
it("preserves DATE values and never infers a purchase day in the synthetic aftercare read",()=>{const state=fresh(),id=fixtureShopping[1].id;expect(syntheticDomainOperation(state,"aftercare-read",id)).toMatchObject({item:{purchased_on:null,return_until:null,warranty_until:null}});expect(syntheticDomainOperation(state,"aftercare-save",{id,revision:1,purchasedOn:"2026-10-27",returnUntil:"2026-11-01",warrantyUntil:null,orderReference:"合成订单",note:"合成购后说明",documentId:null,documentKind:"receipt"})).toMatchObject({purchased_on:"2026-10-27",mutation_revision:2});expect(syntheticDomainOperation(state,"aftercare-read",id)).toMatchObject({item:{purchased_on:"2026-10-27",mutation_revision:2}});});

it("keeps the synthetic practice intent immutable, replayed once, and rejects an invalid parent", async()=>{
  const { syntheticPracticeOperation } = await import("@/features/testing/continuous-practice-fixture"), { fixturePracticeIds } = await import("@/features/testing/continuous-domain-fixture-data");
  const state=fresh(), intentId=crypto.randomUUID(), entries=Object.entries({preparation_id:fixturePracticeIds.preparation,parent_attempt_id:fixturePracticeIds.parent,answer_version_id:"",story_id:"",input_mode:"text",language:"zh",prompt_snapshot:"合成原题",response_transcript_markdown:"  原始回答A  ",duration_seconds:"90",self_review_markdown:"原复盘",strength_tags:"",issue_tags:"answer_not_direct",next_focus:"先给结论",confidence_before:"",confidence_after:""});
  const input={mode:"solo",intentId,entries}; expect(syntheticPracticeOperation(state,input,true)).toEqual({status:"missing"});expect(syntheticPracticeOperation(state,input,false)).toMatchObject({status:"saved",receipt:{attempt_id:intentId,preparation_id:fixturePracticeIds.preparation}});expect(syntheticPracticeOperation(state,input,false)).toMatchObject({status:"saved"});expect(state.writes["practice-save"]).toBe(1);
  const modified={...input,entries:entries.map(([k,v])=>[k,k==="response_transcript_markdown"?"新回答B":v])};expect(syntheticPracticeOperation(state,modified,false)).toMatchObject({status:"conflict"});expect(state.domainObjects.get(`attempt:${intentId}`)).toMatchObject({response_transcript_markdown:"  原始回答A  ",parent_attempt_id:fixturePracticeIds.parent});
  const invalid={...input,intentId:crypto.randomUUID(),entries:entries.map(([k,v])=>[k,k==="parent_attempt_id"?crypto.randomUUID():v])};expect(syntheticPracticeOperation(state,invalid,false)).toMatchObject({status:"rejected"});expect(state.writes["practice-save"]).toBe(1);
});
