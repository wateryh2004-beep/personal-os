import "server-only";
import { z } from "zod";
import { experienceSchema, skillSchema } from "@/features/career/schemas";
import type { FixtureState } from "./continuous-fixture-state";
import { fixtureProject, fixtureFiles, fixtureOwner, fixtureTimestamp, fixtureTask } from "./continuous-fixture-data";
import { fixtureMaterials } from "./continuous-domain-fixture-data";
import { fixtureProjectSchema, fixtureProjectInput, fixtureAftercareInput, fixtureAftercareReadSchema, fixturePurchaseRowSchema, fixtureMaterialRowSchema, fixtureMaterialReadSchema, fixtureMaterialInput } from "./continuous-domain-wire";
const storedSkillSchema = skillSchema.omit({ evidence_markdown: true, last_used_at: true }).extend({
  evidence_markdown: z.string().max(12000).nullable(),
  last_used_at: z.string().date().nullable(),
}).strict();
/** Bounded synthetic readback for the A-save/B-edit scenario, never the generic
 * domain registry or a real Career read model. */
export function syntheticSkillSnapshots(state: FixtureState) {
  return [...state.domainObjects].flatMap(([id, value]) => {
    const skill = storedSkillSchema.safeParse(value);
    return z.uuid().safeParse(id).success && skill.success ? [{ id, name: skill.data.name }] : [];
  }).slice(0, 100);
}
export function syntheticDomainOperation(state: FixtureState, path: string, body: unknown): unknown {
  if (path === "career-form") {
    const input = z.object({ operation: z.enum(["createExperience", "createSkill"]), entries: z.array(z.tuple([z.string().max(100), z.string().max(20000)])).max(40) }).strict().parse(body), raw = Object.fromEntries(input.entries);
    const parsed = input.operation === "createExperience" ? experienceSchema.safeParse({ ...raw, is_current: raw.is_current === "on" || raw.is_current === "true" }) : skillSchema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: "请检查字段，输入已保留。", fieldErrors: Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])) };
    if (state.mode === "save-conflict") return { status: "error", message: "合成保存被拒绝，输入已保留。" };
    const id = crypto.randomUUID(); state.domainObjects.set(id, parsed.data); state.writes[input.operation] = (state.writes[input.operation] ?? 0) + 1;
    return { status: "success", message: "已保存合成资料。", recordId: id };
  }
  if (path === "project-read" || path === "project-save") {
    const row = fixtureProjectSchema.parse(state.domainObjects.get("project") ?? fixtureProject);
    if (path === "project-read") { if (z.uuid().parse(body) !== row.id) throw Error("synthetic_missing"); return row; }
    const input = fixtureProjectInput.parse(body);
    if (input.id !== row.id || input.revision !== row.mutation_revision || input.nextTask && input.nextTask !== fixtureTask.id) throw Error("synthetic_conflict");
    const saved = { ...row, description: input.goal, blocker_text: input.blocker, next_todo_task_id: input.nextTask, mutation_revision: row.mutation_revision + 1, updated_at: new Date().toISOString() };
    state.domainObjects.set("project", saved); state.writes[path] = (state.writes[path] ?? 0) + 1; return saved;
  }
  if (path === "material-read" || path === "material-save") {
    const row = fixtureMaterialRowSchema.parse(state.domainObjects.get("material") ?? fixtureMaterials.checks[0]), documentRevision=z.number().int().parse(state.domainObjects.get("material-document-revision")??1);
    if (path === "material-read") { const input = z.object({ id: z.uuid(), opportunityId: z.uuid(), documentId: z.uuid().nullable(), resumeId: z.uuid().nullable(), expectedExists: z.boolean() }).strict().parse(body); if (input.opportunityId !== row.opportunity_id) throw Error("synthetic_missing"); return fixtureMaterialReadSchema.parse({ row: input.id === row.id ? row : null, documents: fixtureMaterials.documents.map(doc=>({...doc,mutation_revision:documentRevision})), resumes: fixtureMaterials.resumes, documentIds: [...new Set([row.document_id, input.documentId].filter(Boolean))], resumeIds: [...new Set([row.resume_version_id, input.resumeId].filter(Boolean))] }); }
    const input = fixtureMaterialInput.parse(body), exists = input.id === row.id;
    if (input.opportunityId !== row.opportunity_id || input.revision !== (exists ? row.revision : 0)) throw Error("synthetic_conflict");
    if (input.documentId && input.documentId !== fixtureFiles[0].id || input.resumeId && input.resumeId !== fixtureMaterials.resumes[0].id) throw Error("synthetic_missing");
    const objectRevision = (input.documentId ? `document:${input.documentId}:${documentRevision}` : "manual") + (input.resumeId ? `|resume:${input.resumeId}:${fixtureTimestamp}` : "");
    if (input.verificationIntent === "verify" && (input.verificationObjectRevision !== objectRevision || input.documentId && input.verificationDocumentRevision !== documentRevision || input.resumeId && input.verificationResumeUpdatedAt !== fixtureTimestamp)) throw Error("synthetic_source_conflict");
    const clear = input.verificationIntent === "clear" || input.documentId !== row.document_id || input.resumeId !== row.resume_version_id;
    const saved = { ...row, id: input.id, label: input.label, required: input.required, document_id: input.documentId, resume_version_id: input.resumeId, note: input.note, revision: input.revision + 1, updated_at: new Date().toISOString(), verified_at: input.verificationIntent === "verify" ? new Date().toISOString() : clear ? null : row.verified_at, verified_object_revision: input.verificationIntent === "verify" ? objectRevision : clear ? null : row.verified_object_revision };
    state.domainObjects.set("material", saved); state.writes[path] = (state.writes[path] ?? 0) + 1; return fixtureMaterialRowSchema.parse(saved);
  }
  if (path === "aftercare-read" || path === "aftercare-save") {
    const item = state.lifeRows.get("ea000000-0000-4000-8000-000000000002")!;
    const row = fixturePurchaseRowSchema.parse(state.domainObjects.has("aftercare") ? { ...fixturePurchaseRowSchema.parse(state.domainObjects.get("aftercare")), mutation_revision: item.mutation_revision, status: item.status } : { ...item, purchased_on: null, return_until: null, warranty_until: null, order_reference: "", aftercare_note: "", abandoned_at: null, ai_metadata: {}, archived_at: null, created_at: fixtureTimestamp, created_via: "manual", decided_at: null, existing_alternative: null, expected_usage: null, image_url: null, necessity_confirmed: false, notes_markdown: "", purchased_at: null, reason_to_buy: null, source_url: null, updated_at: fixtureTimestamp, user_id: fixtureOwner });
    if (path === "aftercare-read") { if (z.uuid().parse(body) !== row.id) throw Error("synthetic_missing"); return fixtureAftercareReadSchema.parse({ item: { id: row.id, status: row.status, mutation_revision: row.mutation_revision, purchased_on: row.purchased_on, return_until: row.return_until, warranty_until: row.warranty_until, order_reference: row.order_reference, aftercare_note: row.aftercare_note }, links: state.domainObjects.get("aftercare-links") ?? [], documents: fixtureMaterials.documents.map(({ id, title, storage_state }) => ({ id, title, storage_state })), truncated: false, timezone: "UTC" }); }
    const input = fixtureAftercareInput.parse(body); if (input.id !== row.id || input.revision !== row.mutation_revision) throw Error("synthetic_conflict");
    if (input.documentId && input.documentId !== fixtureFiles[0].id) throw Error("synthetic_missing");
    const saved = { ...row, purchased_on: input.purchasedOn, return_until: input.returnUntil, warranty_until: input.warrantyUntil, order_reference: input.orderReference, aftercare_note: input.note, mutation_revision: row.mutation_revision + 1 };
    state.domainObjects.set("aftercare", saved); state.lifeRows.set(saved.id, { ...item, mutation_revision: saved.mutation_revision }); if (input.documentId) state.domainObjects.set("aftercare-links", [{ id: crypto.randomUUID(), document_id: input.documentId, kind: input.documentKind, label: "合成票据" }]); state.writes[path] = (state.writes[path] ?? 0) + 1; return saved;
  }
  throw Error("unhandled_synthetic_domain");
}
