// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({
  project: vi.fn(),
  readProject: vi.fn(),
  material: vi.fn(),
  readMaterial: vi.fn(),
  briefing: vi.fn(),
  readBriefing: vi.fn(),
  availability: vi.fn(),
  readAvailability: vi.fn(),
  task: vi.fn(),
  readTask: vi.fn(),
  aftercare: vi.fn(),
  readAftercare: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/features/projects/actions", () => ({
  saveProjectWorkflow: actions.project,
  readProjectWorkflow: actions.readProject,
}));
vi.mock("@/features/career/material-checks", () => ({
  saveCareerMaterialCheck: actions.material,
  readCareerMaterialCheck: actions.readMaterial,
}));
vi.mock("@/features/briefing/events", () => ({
  saveBriefingEventSource: actions.briefing,
  readBriefingEvent: actions.readBriefing,
}));
vi.mock("@/features/planning/actions", () => ({
  saveTaskPlanning: actions.task,
  readTaskPlanning: actions.readTask,
  saveAvailability: actions.availability,
  readAvailability: actions.readAvailability,
}));
vi.mock("@/features/shopping/aftercare", () => ({
  savePurchaseAftercare: actions.aftercare,
  readPurchaseAftercare: actions.readAftercare,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}));
vi.mock("@/components/workflow-continuity/provider", () => ({
  SourceLink: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
import {
  ProjectProgress,
  type ProjectPresentation,
} from "@/components/projects/project-progress";
import { CareerMaterialChecklist } from "@/components/career/material-checklist";
import { BriefingEvents } from "@/components/briefing/briefing-events";
import { DayCapacity } from "@/components/planning/day-capacity";
import { PurchaseAftercare } from "@/components/shopping/purchase-aftercare";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { getWorkflowDrafts } from "@/features/workflow-continuity/drafts";
const projectId = "11111111-1111-4111-8111-111111111111",
  opportunityId = "22222222-2222-4222-8222-222222222222",
  materialId = "33333333-3333-4333-8333-333333333333",
  ownerId = "44444444-4444-4444-8444-444444444444",
  documentId = "55555555-5555-4555-8555-555555555555",
  itemId = "66666666-6666-4666-8666-666666666666",
  linkId = "77777777-7777-4777-8777-777777777777";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearWorkspaceResources();
  for (const action of Object.values(actions)) action.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearWorkspaceResources();
  vi.unstubAllGlobals();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
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
async function select(node: HTMLSelectElement, value: string) {
  await act(async () => {
    node.value = value;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function click(text: string, container: ParentNode = host) {
  const button = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((node) => node.textContent?.includes(text));
  expect(button, `Missing action ${text}`).toBeDefined();
  await act(async () => button!.click());
}
async function submit(form: HTMLFormElement) {
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
}
const project: ProjectPresentation = {
  id: projectId,
  name: "Synthetic project",
  description: "Original goal",
  status: "active",
  due_date: null,
  updated_at: "2026-10-27T00:00:00Z",
  mutation_revision: 1,
};
it("recovers a real project conflict through reread, visible comparison and explicit rebase, retaining newer input and its recoverable draft", async () => {
  actions.project
    .mockRejectedValueOnce(new Error("workflow_conflict"))
    .mockImplementation(async (value) => ({
      ...project,
      description: value.goal,
      blocker_text: value.blocker,
      next_todo_task_id: value.nextTask,
      mutation_revision: 3,
    }));
  const latest = {
    ...project,
    description: "Other tab goal",
    blocker_text: "Other blocker",
    next_todo_task_id: null,
    mutation_revision: 2,
  };
  const read = deferred<typeof latest>();
  actions.readProject.mockReturnValue(read.promise);
  await act(async () => root.render(<ProjectProgress project={project} />));
  await click("Synthetic project");
  const editor = host.querySelector("textarea")!;
  await input(editor, "My retained edit");
  await submit(editor.closest("form")!);
  await click("读取最新项目并对比");
  await input(editor, "Typed while rereading");
  await act(async () => {
    read.resolve(latest);
    await read.promise;
  });
  expect(editor.value).toBe("Typed while rereading");
  expect(host.textContent).toContain("Other tab goal");
  expect(host.querySelector("textarea")).toBe(editor);
  await click("保留当前输入，按最新版本继续编辑");
  expect(
    getWorkflowDrafts().some((row) => row.key === `task:project:${projectId}`),
  ).toBe(true);
  await act(async () => root.render(null));
  await act(async () => root.render(<ProjectProgress project={latest} />));
  await click("Synthetic project");
  expect(host.querySelector("textarea")!.value).toBe("Typed while rereading");
  await submit(host.querySelector("form")!);
  expect(actions.project.mock.calls.map(([value]) => value.revision)).toEqual([
    1, 2,
  ]);
  expect(actions.project.mock.calls[1][0].goal).toBe("Typed while rereading");
  expect(
    getWorkflowDrafts().some((row) => row.key === `task:project:${projectId}`),
  ).toBe(false);
});
it("adopts a latest project only after the explicit replacement choice without remounting its inputs", async () => {
  actions.readProject.mockResolvedValue({
    ...project,
    description: "Canonical replacement",
    blocker_text: "",
    next_todo_task_id: null,
    mutation_revision: 4,
  });
  await act(async () => root.render(<ProjectProgress project={project} />));
  await click("Synthetic project");
  const editor = host.querySelector("textarea")!;
  await input(editor, "Draft to replace explicitly");
  await click("读取最新项目并对比");
  expect(editor.value).toBe("Draft to replace explicitly");
  await click("采用最新内容，替换当前输入");
  expect(editor.value).toBe("Canonical replacement");
  expect(host.querySelector("textarea")).toBe(editor);
  expect(actions.project).not.toHaveBeenCalled();
  expect(
    getWorkflowDrafts().some((row) => row.key === `task:project:${projectId}`),
  ).toBe(false);
});
const planning = {
  date: "2026-10-27",
  timezone: "UTC",
  availability: {
    periods: [{ start: "09:00", end: "12:00" }],
    revision: 1,
    timezone: "UTC",
  },
  plans: [
    {
      task_id: projectId,
      estimated_minutes: 30,
      planned_on: "2026-10-27",
      revision: 1,
    },
  ],
  tasks: [
    { id: projectId, title: "Synthetic planned task", status: "notStarted" },
  ],
  events: [],
  calendarComplete: true,
  truncated: false,
  lastSyncAt: "2026-10-27T00:00:00Z",
};
function planRead() {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(planning), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
it("recovers task planning by explicit rebase and does not clear typing that continued while reading", async () => {
  planRead();
  actions.task
    .mockRejectedValueOnce(new Error("workflow_conflict"))
    .mockImplementation(async () => ({ revision: 3 }));
  const read = deferred<{
    minutes: string;
    plannedOn: string;
    revision: number;
  }>();
  actions.readTask.mockReturnValue(read.promise);
  await act(async () =>
    root.render(<DayCapacity date={planning.date} taskId={projectId} />),
  );
  const editor = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  await input(editor, "40");
  await submit(editor.closest("form")!);
  await click("读取最新任务计划并对比");
  await input(editor, "55");
  await act(async () => {
    read.resolve({ minutes: "25", plannedOn: "2026-10-28", revision: 2 });
    await read.promise;
  });
  expect(editor.value).toBe("55");
  const panel = host.querySelector('section[aria-label="任务计划版本核对"]')!;
  expect(panel.textContent).toContain("25");
  await click("保留当前输入，按最新版本继续编辑", panel);
  expect(
    getWorkflowDrafts().some((row) => row.key === `task:estimate:${projectId}`),
  ).toBe(true);
  await submit(editor.closest("form")!);
  expect(actions.task.mock.calls.map(([value]) => value.revision)).toEqual([
    1, 2,
  ]);
  expect(actions.task.mock.calls[1][0].minutes).toBe(55);
  expect(host.querySelector('input[type="number"]')).toBe(editor);
});
it("rereads availability and retains both time edits until the user explicitly saves the rebased plan", async () => {
  planRead();
  actions.availability
    .mockRejectedValueOnce(new Error("workflow_conflict"))
    .mockResolvedValue({ revision: 3 });
  const read = deferred<{
    periods: { start: string; end: string }[];
    revision: number;
    timezone: string;
  }>();
  actions.readAvailability.mockReturnValue(read.promise);
  await act(async () => root.render(<DayCapacity date={planning.date} />));
  const summary = host.querySelector("summary")!;
  await act(async () => summary.click());
  const editors = host.querySelectorAll<HTMLInputElement>('input[type="time"]');
  await input(editors[0], "10:00");
  await submit(editors[0].closest("form")!);
  await click("读取最新可用时段并对比");
  await input(editors[1], "13:00");
  await act(async () => {
    read.resolve({
      periods: [{ start: "14:00", end: "17:00" }],
      revision: 2,
      timezone: "UTC",
    });
    await read.promise;
  });
  expect(editors[0].value).toBe("10:00");
  expect(editors[1].value).toBe("13:00");
  await click("保留当前输入，按最新版本继续编辑");
  expect(
    getWorkflowDrafts().some(
      (row) => row.key === `task:availability:${planning.date}`,
    ),
  ).toBe(true);
  await submit(editors[0].closest("form")!);
  expect(actions.availability.mock.calls[1][0]).toMatchObject({
    revision: 2,
    periods: [{ start: "10:00", end: "13:00" }],
  });
  expect(host.querySelector('input[type="time"]')).toBe(editors[0]);
});
const check = {
  id: materialId,
  user_id: ownerId,
  opportunity_id: opportunityId,
  label: "Synthetic material",
  required: true,
  document_id: documentId,
  resume_version_id: null,
  verified_at: "2026-10-01T00:00:00Z",
  verified_object_revision: `document:${documentId}:1`,
  note: "Old manual verification",
  revision: 1,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  archived_at: null,
};
const documents = [
  {
    id: documentId,
    title: "Synthetic changed document",
    mutation_revision: 2,
    storage_state: "available",
  },
];
const materialProps = {
  opportunityId,
  checks: [check],
  documents,
  resumes: [],
} satisfies ComponentProps<typeof CareerMaterialChecklist>;
it("keeps a new material editor and later typing mounted when its first snapshot saves", async () => {
  const saved =
    deferred<
      ComponentProps<typeof CareerMaterialChecklist>["checks"][number]
    >();
  actions.material.mockReturnValue(saved.promise);
  await act(async () =>
    root.render(<CareerMaterialChecklist {...materialProps} checks={[]} />),
  );
  await click("添加需要的材料");
  const label = host.querySelector<HTMLInputElement>(
    'input:not([type="checkbox"])',
  )!;
  const note = host.querySelector<HTMLTextAreaElement>("textarea")!;
  await input(label, "New material");
  await input(note, "Submitted note");
  await submit(host.querySelector("form")!);
  const sent = actions.material.mock.calls[0][0];
  await input(note, "Continued while saving");
  const savedRow = {
    ...check,
    id: sent.id,
    document_id: null,
    label: sent.label,
    note: sent.note,
    verified_at: null,
    verified_object_revision: null,
  };
  await act(async () => saved.resolve(savedRow));
  expect(host.querySelector("textarea")).toBe(note);
  expect(note.value).toBe("Continued while saving");
  expect(host.querySelector("details")!.open).toBe(true);
  expect(
    getWorkflowDrafts().some((row) => row.key === `career:material:${sent.id}`),
  ).toBe(true);
  await act(async () => root.render(null));
  await act(async () =>
    root.render(
      <CareerMaterialChecklist {...materialProps} checks={[savedRow]} />,
    ),
  );
  await act(async () => host.querySelector("summary")!.click());
  expect(host.querySelector("textarea")!.value).toBe("Continued while saving");
  actions.material.mockResolvedValue({ ...savedRow, revision: 2 });
  await submit(host.querySelector("form")!);
  expect(actions.material.mock.calls[1][0]).toMatchObject({
    revision: 1,
    note: "Continued while saving",
  });
});
it("never silently re-verifies a stale material on a note-only save, and retains the original verification intent as keep", async () => {
  actions.material.mockImplementation(async (value) => ({
    ...check,
    note: value.note,
    revision: 2,
  }));
  await act(async () =>
    root.render(<CareerMaterialChecklist {...materialProps} />),
  );
  await act(async () => host.querySelector("summary")!.click());
  const box = host.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )[1];
  expect(host.textContent).toContain("对象已变化，待重新核对");
  expect(box.checked).toBe(false);
  await input(host.querySelector("textarea")!, "Only metadata changed");
  await submit(host.querySelector("form")!);
  expect(actions.material).toHaveBeenCalledWith(
    expect.objectContaining({
      verificationIntent: "keep",
      verificationObjectRevision: null,
      verificationDocumentRevision: null,
      note: "Only metadata changed",
    }),
  );
  expect(host.textContent).toContain(check.verified_at);
  expect(
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
      .checked,
  ).toBe(false);
});
it("binds a newly checked material intent to the displayed exact revision and refuses to renew it after a newer source or stale draft restore", async () => {
  actions.material.mockRejectedValue(new Error("源资料已变化"));
  await act(async () =>
    root.render(<CareerMaterialChecklist {...materialProps} />),
  );
  await act(async () => host.querySelector("summary")!.click());
  await act(async () =>
    host
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
      .click(),
  );
  await input(host.querySelector("textarea")!, "Keep this pending note");
  await act(async () => root.render(null));
  await act(async () =>
    root.render(
      <CareerMaterialChecklist
        {...materialProps}
        documents={[{ ...documents[0], mutation_revision: 3 }]}
      />,
    ),
  );
  await act(async () => host.querySelector("summary")!.click());
  expect(
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
      .checked,
  ).toBe(false);
  expect(host.querySelector("textarea")!.value).toBe("Keep this pending note");
  await submit(host.querySelector("form")!);
  expect(actions.material).toHaveBeenLastCalledWith(
    expect.objectContaining({
      verificationIntent: "verify",
      verificationDocumentRevision: 2,
      verificationObjectRevision: `document:${documentId}:2`,
    }),
  );
  await act(async () =>
    host
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
      .click(),
  );
  await submit(host.querySelector("form")!);
  expect(actions.material).toHaveBeenLastCalledWith(
    expect.objectContaining({
      verificationIntent: "verify",
      verificationDocumentRevision: 3,
      verificationObjectRevision: `document:${documentId}:3`,
    }),
  );
});
it("recovers a material metadata conflict by visible reread and explicit rebase while keeping a note typed during that read", async () => {
  actions.material
    .mockRejectedValueOnce(new Error("workflow_conflict"))
    .mockImplementation(async (value) => ({
      ...check,
      note: value.note,
      revision: 5,
    }));
  const read = deferred<{
    row: typeof check;
    documents: typeof documents;
    resumes: [];
    documentIds: string[];
    resumeIds: string[];
  }>();
  actions.readMaterial.mockReturnValue(read.promise);
  await act(async () =>
    root.render(<CareerMaterialChecklist {...materialProps} />),
  );
  await act(async () => host.querySelector("summary")!.click());
  const editor = host.querySelector("textarea")!;
  await input(editor, "My first note");
  await submit(host.querySelector("form")!);
  await click("读取最新材料核对项并对比");
  await input(editor, "My note typed during reread");
  await act(async () => {
    read.resolve({
      row: { ...check, note: "Other tab note", revision: 4 },
      documents,
      resumes: [],
      documentIds: [documentId],
      resumeIds: [],
    });
    await read.promise;
  });
  expect(host.textContent).toContain("Other tab note");
  expect(editor.value).toBe("My note typed during reread");
  await click("保留当前输入，按最新版本继续编辑");
  expect(
    getWorkflowDrafts().some(
      (row) => row.key === `career:material:${materialId}`,
    ),
  ).toBe(true);
  await submit(host.querySelector("form")!);
  expect(actions.material.mock.calls.map(([value]) => value.revision)).toEqual([
    1, 4,
  ]);
  expect(actions.material.mock.calls[1][0]).toMatchObject({
    note: "My note typed during reread",
    verificationIntent: "keep",
  });
  expect(host.querySelector("textarea")).toBe(editor);
});
const aftercareData = {
  item: {
    id: itemId,
    status: "purchased",
    mutation_revision: 1,
    purchased_on: "2026-10-01",
    return_until: null,
    warranty_until: null,
    order_reference: "Old order",
    aftercare_note: "Old note",
  },
  links: [],
  documents: [],
  truncated: false,
  timezone: "UTC",
};
it("recovers aftercare without losing an in-progress note or attachment choice during reread", async () => {
  const read = deferred<typeof aftercareData>();
  actions.readAftercare
    .mockResolvedValueOnce(aftercareData)
    .mockReturnValueOnce(read.promise)
    .mockResolvedValue(aftercareData);
  actions.aftercare
    .mockRejectedValueOnce(new Error("workflow_conflict"))
    .mockResolvedValue({ ...aftercareData.item, mutation_revision: 3 });
  await act(async () =>
    root.render(<PurchaseAftercare id={itemId} onSaved={vi.fn()} />),
  );
  const editor = host.querySelector("textarea")!;
  await input(editor, "My aftercare note");
  await submit(host.querySelector("form")!);
  await click("读取最新购后档案并对比");
  await input(editor, "Continued aftercare note");
  await act(async () => {
    read.resolve({
      ...aftercareData,
      item: {
        ...aftercareData.item,
        mutation_revision: 2,
        aftercare_note: "Server aftercare note",
      },
    });
    await read.promise;
  });
  expect(host.textContent).toContain("Server aftercare note");
  expect(editor.value).toBe("Continued aftercare note");
  await click("保留当前输入，按最新版本继续编辑");
  expect(
    getWorkflowDrafts().some(
      (row) => row.key === `shopping:aftercare:${itemId}`,
    ),
  ).toBe(true);
  await submit(host.querySelector("form")!);
  expect(actions.aftercare.mock.calls.map(([value]) => value.revision)).toEqual(
    [1, 2],
  );
  expect(actions.aftercare.mock.calls[1][0].note).toBe(
    "Continued aftercare note",
  );
  expect(host.querySelector("textarea")).toBe(editor);
});
const source = {
  id: itemId,
  title: "Synthetic source",
  url: null,
  published_at: null,
  fetched_at: "2026-10-27T00:00:00Z",
};
function event(id: string, title: string, revision = 1) {
  return {
    id,
    user_id: ownerId,
    title,
    revision,
    created_at: "2026-10-27T00:00:00Z",
    updated_at: "2026-10-27T00:00:00Z",
    archived_at: null,
  };
}
function membership(eventId: string) {
  return {
    id: linkId,
    user_id: ownerId,
    event_id: eventId,
    feed_item_id: itemId,
    revision: 1,
    created_at: "2026-10-27T00:00:00Z",
    updated_at: "2026-10-27T00:00:00Z",
    archived_at: null,
  };
}
const emptyBriefing = {
  events: [],
  sources: [],
  items: [source],
  versions: [],
  truncated: false,
  entries: [],
  judgments: [],
} satisfies ComponentProps<typeof BriefingEvents>;
it("finishes one confirmed Briefing creation before assigning the next distinct event ID", async () => {
  actions.briefing.mockImplementation(async (value) => ({
    event: event(value.eventId, value.title),
    source: membership(value.eventId),
  }));
  await act(async () => root.render(<BriefingEvents {...emptyBriefing} />));
  await input(host.querySelector("input")!, "First distinct event");
  await select(host.querySelectorAll("select")[1], itemId);
  await submit(host.querySelector("form")!);
  const firstId = actions.briefing.mock.calls[0][0].eventId;
  const editor = host.querySelector("input")!;
  await select(host.querySelector("select")!, "");
  await input(editor, "Second distinct event");
  await select(host.querySelectorAll("select")[1], itemId);
  await submit(host.querySelector("form")!);
  expect(actions.briefing.mock.calls[1][0]).toMatchObject({
    revision: 0,
    title: "Second distinct event",
  });
  expect(actions.briefing.mock.calls[1][0].eventId).not.toBe(firstId);
  expect(host.querySelector("input")).toBe(editor);
});
it("keeps an unknown Briefing creation ID stable across retries and recovers the confirmed row only after explicit reread/rebase", async () => {
  actions.briefing
    .mockRejectedValueOnce(new Error("Unknown creation outcome"))
    .mockImplementation(async (value) => ({
      event: event(value.eventId, value.title, value.revision + 1),
      source: membership(value.eventId),
    }));
  await act(async () => root.render(<BriefingEvents {...emptyBriefing} />));
  await input(host.querySelector("input")!, "Uncertain event");
  await select(host.querySelectorAll("select")[1], itemId);
  await submit(host.querySelector("form")!);
  const id = actions.briefing.mock.calls[0][0].eventId;
  expect(host.querySelector<HTMLSelectElement>("select")!.disabled).toBe(true);
  const read = deferred<{
    event: ReturnType<typeof event>;
    sources: ReturnType<typeof membership>[];
    truncated: boolean;
  }>();
  actions.readBriefing.mockReturnValue(read.promise);
  await click("读取最新事件并对比");
  const editor = host.querySelector("input")!;
  await input(editor, "My continued event name");
  await act(async () => {
    read.resolve({
      event: event(id, "Confirmed server name", 2),
      sources: [membership(id)],
      truncated: false,
    });
    await read.promise;
  });
  expect(host.textContent).toContain("Confirmed server name");
  expect(editor.value).toBe("My continued event name");
  await click("保留当前输入，按最新版本继续编辑");
  expect(
    getWorkflowDrafts().some((row) => row.key === "review:briefing:event"),
  ).toBe(true);
  await submit(host.querySelector("form")!);
  expect(actions.briefing.mock.calls[1][0]).toMatchObject({
    eventId: id,
    revision: 2,
    title: "My continued event name",
  });
  expect(host.querySelector("input")).toBe(editor);
});
it("absorbs authoritative Briefing refresh revisions without silently rebasing its unsaved selection", async () => {
  const original = event(projectId, "Initial event", 1),
    latest = event(projectId, "Other tab rename", 3);
  actions.briefing
    .mockRejectedValueOnce(new Error("workflow_conflict"))
    .mockImplementation(async (value) => ({
      event: event(value.eventId, value.title, 4),
      source: membership(value.eventId),
    }));
  actions.readBriefing.mockResolvedValue({
    event: latest,
    sources: [],
    truncated: false,
  });
  await act(async () =>
    root.render(<BriefingEvents {...emptyBriefing} events={[original]} />),
  );
  await select(host.querySelector("select")!, projectId);
  await select(host.querySelectorAll("select")[1], itemId);
  await act(async () =>
    root.render(<BriefingEvents {...emptyBriefing} events={[latest]} />),
  );
  expect(host.querySelector("h2")?.textContent).toBe("Other tab rename");
  await submit(host.querySelector("form")!);
  expect(actions.briefing.mock.calls[0][0].revision).toBe(1);
  await click("读取最新事件并对比");
  await click("保留当前输入，按最新版本继续编辑");
  await submit(host.querySelector("form")!);
  expect(actions.briefing.mock.calls[1][0].revision).toBe(3);
});
