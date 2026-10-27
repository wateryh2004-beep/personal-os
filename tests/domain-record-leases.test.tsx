// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  project: vi.fn(),
  readProject: vi.fn(),
  material: vi.fn(),
  readMaterial: vi.fn(),
  briefing: vi.fn(),
  readBriefing: vi.fn(),
  aftercare: vi.fn(),
  readAftercare: vi.fn(),
}));
vi.mock("@/features/projects/actions", () => ({
  saveProjectWorkflow: calls.project,
  readProjectWorkflow: calls.readProject,
}));
vi.mock("@/features/career/material-checks", () => ({
  saveCareerMaterialCheck: calls.material,
  readCareerMaterialCheck: calls.readMaterial,
}));
vi.mock("@/features/briefing/events", () => ({
  saveBriefingEventSource: calls.briefing,
  readBriefingEvent: calls.readBriefing,
}));
vi.mock("@/features/shopping/aftercare", () => ({
  savePurchaseAftercare: calls.aftercare,
  readPurchaseAftercare: calls.readAftercare,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/workflow-continuity/provider", () => ({
  SourceLink: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => createElement("a", { href }, children),
}));
import { ProjectProgress } from "@/components/projects/project-progress";
import { CareerMaterialChecklist } from "@/components/career/material-checklist";
import { BriefingEvents } from "@/components/briefing/briefing-events";
import { PurchaseAftercare } from "@/components/shopping/purchase-aftercare";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import {
  getWorkflowDrafts,
  useWorkflowDraft,
} from "@/features/workflow-continuity/drafts";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  C = "33333333-3333-4333-8333-333333333333",
  D = "44444444-4444-4444-8444-444444444444",
  E = "55555555-5555-4555-8555-555555555555";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearWorkspaceResources();
  Object.values(calls).forEach((call) => call.mockReset());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearWorkspaceResources();
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
};
const button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) =>
    node.textContent?.includes(text),
  )!;
async function click(text: string) {
  await act(async () => button(text).click());
}
async function input(
  node: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
const project = {
  id: A,
  name: "Independent project",
  description: "Saved goal",
  status: "active",
  due_date: null,
  updated_at: "2026-10-27T00:00:00Z",
  blocker_text: "",
  next_todo_task_id: null,
  mutation_revision: 1,
};
it("Project explicit keep retains concurrent typing and a recoverable dirty payload across route reentry before successful retry", async () => {
  calls.project
    .mockRejectedValueOnce(new Error("workflow_conflict"))
    .mockImplementation(async (value) => ({
      ...project,
      description: value.goal,
      mutation_revision: 5,
    }));
  const read = deferred<typeof project>();
  calls.readProject.mockReturnValue(read.promise);
  await act(async () => root.render(<ProjectProgress project={project} />));
  await click("Independent project");
  const editor = host.querySelector("textarea")!;
  await input(editor, "Mine");
  await submit();
  await click("读取最新项目并对比");
  editor.focus();
  await input(editor, "Mine while reading");
  await act(async () =>
    read.resolve({
      ...project,
      description: "Other tab saved",
      mutation_revision: 4,
    }),
  );
  expect(document.activeElement).toBe(editor);
  expect(editor.value).toBe("Mine while reading");
  expect(host.textContent).toContain("Other tab saved");
  expect(calls.project).toHaveBeenCalledTimes(1);
  await click("保留当前输入，按最新版本继续编辑");
  expect(
    getWorkflowDrafts().some((row) => row.key === `task:project:${A}`),
  ).toBe(true);
  await act(async () => root.render(null));
  await act(async () =>
    root.render(
      <ProjectProgress project={{ ...project, mutation_revision: 4 }} />,
    ),
  );
  await click("Independent project");
  expect(host.querySelector("textarea")!.value).toBe("Mine while reading");
  await submit();
  expect(calls.project.mock.calls[1][0]).toMatchObject({
    revision: 4,
    goal: "Mine while reading",
  });
});
const check = {
  id: C,
  user_id: D,
  opportunity_id: B,
  label: "Independent material",
  required: true,
  document_id: null,
  resume_version_id: E,
  verified_at: "2026-10-01T00:00:00Z",
  verified_object_revision: `manual|resume:${E}:2026-10-27T08:00:00.123456+08:00`,
  note: "Saved metadata",
  revision: 1,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  archived_at: null,
};
const resume = {
  id: E,
  title: "Approved resume",
  status: "approved",
  updated_at: "2026-10-27T00:00:00.123456+00:00",
};
it("equivalent persisted resume timestamp representations do not falsely expire verification", async () => {
  await act(async () =>
    root.render(
      <CareerMaterialChecklist
        opportunityId={B}
        checks={[check]}
        documents={[]}
        resumes={[resume]}
      />,
    ),
  );
  expect(host.querySelector("summary")!.textContent).toContain("用户已核验");
});
it("same-microsecond canonical material metadata save keeps old verification intent", async () => {
  const canonical = {
    ...check,
    verified_object_revision: `manual|resume:${E}:${resume.updated_at}`,
  };
  calls.material.mockResolvedValue({ ...canonical, revision: 2 });
  await act(async () =>
    root.render(
      <CareerMaterialChecklist
        opportunityId={B}
        checks={[canonical]}
        documents={[]}
        resumes={[resume]}
      />,
    ),
  );
  await act(async () => host.querySelector("summary")!.click());
  await input(host.querySelector("textarea")!, "Only note edited");
  await submit();
  expect(calls.material.mock.calls[0][0]).toMatchObject({
    verificationIntent: "keep",
    verificationResumeUpdatedAt: null,
    verificationObjectRevision: null,
  });
  expect(host.textContent).toContain(check.verified_at);
});
let seedSet: ReturnType<
  typeof useWorkflowDraft<Record<string, unknown>>
>["setValue"];
function SeedLegacy() {
  const draft = useWorkflowDraft<Record<string, unknown>>({
    kind: "career",
    id: `material:${C}`,
    label: "legacy",
    resumeHref: `/career/opportunities/${B}/materials`,
    initialValue: {},
    parse: (value) => value as Record<string, unknown>,
  });
  useLayoutEffect(() => {
    seedSet = draft.setValue;
  });
  return null;
}
it("legacy boolean draft migrates to keep and never fabricates verify intent", async () => {
  await act(async () => root.render(<SeedLegacy />));
  await act(async () =>
    seedSet({
      label: "Legacy label",
      required: true,
      documentId: "",
      resumeId: E,
      note: "Legacy draft",
      revision: 1,
      verified: true,
    }),
  );
  await act(async () => root.render(null));
  calls.material.mockResolvedValue({ ...check, revision: 2 });
  await act(async () =>
    root.render(
      <CareerMaterialChecklist
        opportunityId={B}
        checks={[check]}
        documents={[]}
        resumes={[resume]}
      />,
    ),
  );
  await act(async () => host.querySelector("summary")!.click());
  await submit();
  expect(calls.material.mock.calls[0][0]).toMatchObject({
    verificationIntent: "keep",
    verificationObjectRevision: null,
    note: "Legacy draft",
  });
  expect(calls.material.mock.calls[0][0]).not.toHaveProperty("verified");
});
const data = (id: string, revision: number, note: string) => ({
  item: {
    id,
    status: "purchased",
    mutation_revision: revision,
    purchased_on: null,
    return_until: null,
    warranty_until: null,
    order_reference: "",
    aftercare_note: note,
  },
  links: [],
  documents: [],
  truncated: false,
  timezone: "UTC",
});
it("pending Aftercare reread from A cannot offer adoption into record B", async () => {
  const read = deferred<ReturnType<typeof data>>(),
    onSaved = vi.fn();
  let aCalls = 0;
  calls.readAftercare.mockImplementation(async (id: string) =>
    id === A
      ? ++aCalls === 1
        ? data(A, 1, "A saved note")
        : read.promise
      : data(B, 2, "B saved note"),
  );
  await act(async () =>
    root.render(<PurchaseAftercare id={A} onSaved={onSaved} />),
  );
  await click("读取最新购后档案并对比");
  await act(async () =>
    root.render(<PurchaseAftercare id={B} onSaved={onSaved} />),
  );
  expect(host.querySelector("textarea")!.value).toBe("B saved note");
  await act(async () => read.resolve(data(A, 8, "A delayed private note")));
  expect.soft(host.textContent).not.toContain("A delayed private note");
  if (button("采用最新内容，替换当前输入"))
    await click("采用最新内容，替换当前输入");
  expect(onSaved).not.toHaveBeenCalled();
});
it("record B pending initial read cannot submit the retained record A form", async () => {
  const nextRead = deferred<ReturnType<typeof data>>(),
    onSaved = vi.fn();
  calls.readAftercare.mockImplementation(async (id: string) =>
    id === A ? data(A, 1, "A saved note") : nextRead.promise,
  );
  calls.aftercare.mockResolvedValue(data(A, 2, "A saved note").item);
  await act(async () =>
    root.render(<PurchaseAftercare id={A} onSaved={onSaved} />),
  );
  await act(async () =>
    root.render(<PurchaseAftercare id={B} onSaved={onSaved} />),
  );
  if (host.querySelector("form")) await submit();
  expect(calls.aftercare).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

it("an old A recovery stays revoked through A to B to A while A's draft survives", async () => {
  const oldRead = deferred<ReturnType<typeof data>>(),
    onSaved = vi.fn();
  let readsA = 0;
  calls.readAftercare.mockImplementation(async (id: string) =>
    id === A
      ? ++readsA === 2
        ? oldRead.promise
        : data(A, readsA === 1 ? 1 : 3, "A canonical note")
      : data(B, 2, "B saved note"),
  );
  await act(async () =>
    root.render(<PurchaseAftercare id={A} onSaved={onSaved} />),
  );
  await input(host.querySelector("textarea")!, "A unfinished draft");
  await click("读取最新购后档案并对比");
  await act(async () =>
    root.render(<PurchaseAftercare id={B} onSaved={onSaved} />),
  );
  await act(async () =>
    root.render(<PurchaseAftercare id={A} onSaved={onSaved} />),
  );
  const editor = host.querySelector("textarea")!;
  expect(editor.value).toBe("A unfinished draft");
  editor.focus();
  await input(editor, "A continued after returning");
  await act(async () =>
    oldRead.resolve(data(A, 99, "Old A comparison must stay revoked")),
  );
  expect(host.querySelector("textarea")).toBe(editor);
  expect(document.activeElement).toBe(editor);
  expect(editor.value).toBe("A continued after returning");
  expect(host.textContent).not.toContain("Old A comparison must stay revoked");
  expect(button("保留当前输入，按最新版本继续编辑")).toBeUndefined();
  expect(onSaved).not.toHaveBeenCalled();
  expect(
    getWorkflowDrafts().some((row) => row.key === `shopping:aftercare:${A}`),
  ).toBe(true);
});

it("an old A save cannot update or steal focus from B", async () => {
  const save = deferred<ReturnType<typeof data>["item"]>(),
    onSaved = vi.fn();
  calls.readAftercare.mockImplementation(async (id: string) =>
    data(id, 1, id === A ? "A saved note" : "B saved note"),
  );
  calls.aftercare.mockReturnValue(save.promise);
  await act(async () =>
    root.render(<PurchaseAftercare id={A} onSaved={onSaved} />),
  );
  await input(host.querySelector("textarea")!, "A submitted draft");
  await submit();
  await act(async () =>
    root.render(<PurchaseAftercare id={B} onSaved={onSaved} />),
  );
  const editor = host.querySelector("textarea")!;
  editor.focus();
  await input(editor, "B current editing");
  await act(async () => save.resolve(data(A, 2, "A submitted draft").item));
  expect(onSaved).not.toHaveBeenCalled();
  expect(host.querySelector("textarea")).toBe(editor);
  expect(document.activeElement).toBe(editor);
  expect(editor.value).toBe("B current editing");
  expect(host.textContent).not.toContain("购后档案已保存");
  expect(
    getWorkflowDrafts().some((row) => row.key === `shopping:aftercare:${A}`),
  ).toBe(true);
});

it("rejects mismatched initial and recovery record identities before offering edits or adoption", async () => {
  const onSaved = vi.fn();
  calls.readAftercare.mockResolvedValueOnce(data(B, 8, "Wrong record"));
  await act(async () =>
    root.render(<PurchaseAftercare id={A} onSaved={onSaved} />),
  );
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).not.toContain("Wrong record");
  calls.readAftercare.mockResolvedValueOnce(data(A, 1, "A saved note"));
  await click("重新读取");
  calls.readAftercare.mockResolvedValueOnce(
    data(B, 9, "Wrong recovery record"),
  );
  await click("读取最新购后档案并对比");
  expect(host.textContent).not.toContain("Wrong recovery record");
  expect(button("采用最新内容，替换当前输入")).toBeUndefined();
  expect(host.querySelector("textarea")!.value).toBe("A saved note");
  expect(onSaved).not.toHaveBeenCalled();
});

it("revokes an in-flight save and loaded private fields at the owner scope boundary", async () => {
  const save = deferred<ReturnType<typeof data>["item"]>(),
    nextRead = deferred<ReturnType<typeof data>>(),
    onSaved = vi.fn();
  calls.readAftercare
    .mockResolvedValueOnce(data(A, 1, "Prior owner note"))
    .mockReturnValue(nextRead.promise);
  calls.aftercare.mockReturnValue(save.promise);
  await act(async () =>
    root.render(<PurchaseAftercare id={A} onSaved={onSaved} />),
  );
  await submit();
  await act(async () => clearWorkspaceResources());
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).not.toContain("Prior owner note");
  await act(async () =>
    save.resolve(data(A, 2, "Prior owner saved response").item),
  );
  expect(onSaved).not.toHaveBeenCalled();
});

it("restores an explicit material intent by the exact instant and still expires a one-microsecond change", async () => {
  await act(async () => root.render(<SeedLegacy />));
  await act(async () =>
    seedSet({
      label: check.label,
      required: true,
      documentId: "",
      resumeId: E,
      note: "Explicit captured draft",
      revision: 1,
      verificationIntent: "verify",
      verificationObjectRevision: check.verified_object_revision,
      verificationDocumentRevision: null,
      verificationResumeUpdatedAt: resume.updated_at,
    }),
  );
  await act(async () => root.render(null));
  await act(async () =>
    root.render(
      <CareerMaterialChecklist
        opportunityId={B}
        checks={[check]}
        documents={[]}
        resumes={[resume]}
      />,
    ),
  );
  expect(
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
      .checked,
  ).toBe(true);
  await act(async () =>
    root.render(
      <CareerMaterialChecklist
        opportunityId={B}
        checks={[check]}
        documents={[]}
        resumes={[
          { ...resume, updated_at: "2026-10-27T00:00:00.123457+00:00" },
        ]}
      />,
    ),
  );
  expect(
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
      .checked,
  ).toBe(false);
  expect(host.textContent).toContain("资料版本已变化，原核验意图过期");
});
const event = (id: string, title: string, revision: number) => ({
  id,
  user_id: D,
  title,
  revision,
  created_at: "2026-10-27T00:00:00Z",
  updated_at: "2026-10-27T00:00:00Z",
  archived_at: null,
});
const empty = {
  events: [],
  sources: [],
  items: [
    {
      id: E,
      title: "Independent source",
      url: null,
      published_at: null,
      fetched_at: "2026-10-27T00:00:00Z",
    },
  ],
  versions: [],
  truncated: false,
  entries: [],
  judgments: [],
};
async function select(node: HTMLSelectElement, value: string) {
  await act(async () => {
    node.value = value;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
it("Briefing unknown creation reads its original UUID without re-creating, and explicit canonical adoption permits a distinct next event", async () => {
  calls.briefing
    .mockRejectedValueOnce(new Error("unknown"))
    .mockImplementation(async (value) => ({
      event: event(value.eventId, value.title, 1),
      source: { id:C,user_id:D,event_id:value.eventId,feed_item_id:E,revision:1,archived_at:null,created_at:"2026-10-27T00:00:00Z",updated_at:"2026-10-27T00:00:00Z" },
    }));
  await act(async () => root.render(<BriefingEvents {...empty} />));
  await input(host.querySelector("input")!, "First event");
  await select(host.querySelectorAll("select")[1], E);
  await submit();
  const id = calls.briefing.mock.calls[0][0].eventId;
  await submit();expect(calls.briefing).toHaveBeenCalledOnce();
  calls.readBriefing.mockResolvedValueOnce({event:null,sources:[],versions:[],truncated:false});
  await click("读取最新事件并对比");
  expect(calls.readBriefing.mock.calls[0][0]).toEqual({id,expectedExists:false});
  await click("保留当前输入，按最新版本继续编辑");await submit();expect(calls.briefing).toHaveBeenCalledOnce();
  const source={ id:C,user_id:D,event_id:id,feed_item_id:E,revision:1,archived_at:null,created_at:"2026-10-27T00:00:00Z",updated_at:"2026-10-27T00:00:00Z" };
  calls.readBriefing.mockResolvedValue({event:event(id,"First event",1),sources:[source],versions:[],truncated:false});
  await click("读取最新事件并对比");expect(calls.readBriefing.mock.calls[1][0]).toEqual({id,expectedExists:false});
  await submit();expect(calls.briefing).toHaveBeenCalledOnce();
  await click("采用最新内容，替换当前输入");expect(calls.briefing).toHaveBeenCalledOnce();
  await select(host.querySelector("select")!, "");
  await input(host.querySelector("input")!, "Second event");
  await select(host.querySelectorAll("select")[1], E);
  await submit();expect(calls.briefing).toHaveBeenCalledTimes(2);
  expect(calls.briefing.mock.calls[1][0]).toMatchObject({revision:0,title:"Second event"});
  expect(calls.briefing.mock.calls[1][0].eventId).not.toBe(id);
});
