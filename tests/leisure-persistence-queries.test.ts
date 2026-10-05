import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
import { getLeisureExperience, getLeisureExperiences } from "@/features/leisure/queries";
const id = "c0000000-0000-4000-8000-000000000001";
const noteId = "d0000000-0000-4000-8000-000000000001";
const date = "2026-10-04T10:00:00Z";
const content = {
  id, title: "A quiet afternoon", kind: "book", why: "An accessible first chapter", body_markdown: "## Start\nRead a chapter",
  how_to_start: null, duration_minutes: 30, platform: null, location: null, starts_at: null,
  cost_text: null, setting: "home", company: "solo", budget: "unknown", sources: [], ratings: [],
  content_revision: 1, created_at: date, updated_at: date,
};
const summary = Object.fromEntries(Object.entries(content).filter(([key]) => !["body_markdown", "sources", "ratings"].includes(key)));
const feedback = { experience_id: id, status: null, reaction: "liked", personal_note: "My view", linked_note_id: null, revision: 1, updated_at: date };
function chain(data: unknown, error: unknown = null) {
  const result = { data, error };
  const builder = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const key of ["select", "eq", "is", "in", "order", "limit"] as const) builder[key].mockReturnValue(builder);
  return builder;
}
beforeEach(() => { vi.resetAllMocks(); mocks.owner.mockResolvedValue({ userId: "session-owner", supabase: { from: mocks.from } }); });

describe("shared leisure read model", () => {
  it("does not infer feedback or interested status from an editorial record", async () => {
    const experiences = chain([content]);
    const personal = chain([]);
    mocks.from.mockImplementation((table) => table === "leisure_experiences" ? experiences : personal);
    expect(await getLeisureExperiences()).toEqual({ experiences: [{ ...summary, feedback: null }], unavailable: false, hasMore: false });
    expect(experiences.eq).toHaveBeenCalledWith("user_id", "session-owner");
    expect(experiences.is).toHaveBeenCalledWith("archived_at", null);
    expect(experiences.limit).toHaveBeenCalledWith(101);
    expect(experiences.select.mock.calls[0][0]).not.toMatch(/body_markdown|sources|ratings/);
    expect(personal.eq).toHaveBeenCalledWith("user_id", "session-owner");
  });

  it("uses identical content and feedback on home and detail", async () => {
    mocks.from.mockImplementation((table) => table === "leisure_experiences" ? chain([content]) : chain([feedback]));
    const home = await getLeisureExperiences();
    mocks.from.mockImplementation((table) => table === "leisure_experiences" ? chain(content) : chain([feedback]));
    const detail = await getLeisureExperience(id);
    expect(detail.experience).toMatchObject(home.experiences[0]);
    expect(home.experiences[0]).not.toHaveProperty("body_markdown");
    expect(home.experiences[0]).not.toHaveProperty("sources");
    expect(home.experiences[0]).not.toHaveProperty("ratings");
    expect(detail.experience?.feedback?.status).toBeNull();
  });

  it("exposes a bounded result rather than silently calling 100 rows all records", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({ ...content, id: `c0000000-0000-4000-8000-${String(index).padStart(12, "0")}` }));
    mocks.from.mockImplementation((table) => table === "leisure_experiences" ? chain(rows) : chain([]));
    const result = await getLeisureExperiences();
    expect(result.hasMore).toBe(true);
    expect(result.experiences).toHaveLength(100);
  });

  it("fails closed if feedback is unavailable rather than implying a fresh personal state", async () => {
    mocks.from.mockImplementation((table) => table === "leisure_experiences" ? chain([content]) : chain(null, { message: "offline" }));
    expect(await getLeisureExperiences()).toEqual({ experiences: [], unavailable: true, hasMore: false });
  });

  it("only returns linked notes that remain owned and active", async () => {
    const notes = chain([{ id: noteId, title: "My owned note" }]);
    mocks.from.mockImplementation((table) => table === "leisure_experiences" ? chain(content) : table === "leisure_feedback" ? chain([{ ...feedback, linked_note_id: noteId }]) : notes);
    expect((await getLeisureExperience(id)).experience?.feedback).toMatchObject({ linked_note_id: noteId, linked_note_title: "My owned note", linked_note_available: true });
    expect(notes.eq).toHaveBeenCalledWith("user_id", "session-owner");
    expect(notes.eq).toHaveBeenCalledWith("status", "active");
    expect(notes.is).toHaveBeenCalledWith("archived_at", null);
    mocks.from.mockImplementation((table) => table === "leisure_experiences" ? chain(content) : table === "leisure_feedback" ? chain([{ ...feedback, linked_note_id: noteId }]) : chain([]));
    expect((await getLeisureExperience(id)).experience?.feedback).toMatchObject({ linked_note_id: noteId, linked_note_title: null, linked_note_available: false });
  });

  it("distinguishes not-found from missing migration, malformed data or transport failure", async () => {
    mocks.from.mockReturnValue(chain(null));
    expect(await getLeisureExperience(id)).toEqual({ experience: null, unavailable: false });
    mocks.from.mockReturnValue(chain(null, { message: "relation does not exist" }));
    expect(await getLeisureExperience(id)).toEqual({ experience: null, unavailable: true });
    mocks.from.mockReturnValue(chain({ ...content, sources: [{ url: "javascript:alert(1)" }] }));
    expect(await getLeisureExperience(id)).toEqual({ experience: null, unavailable: true });
    mocks.from.mockImplementation(() => { throw new Error("offline"); });
    expect(await getLeisureExperiences()).toMatchObject({ experiences: [], unavailable: true });
  });
});
