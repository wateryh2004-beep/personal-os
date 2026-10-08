// @vitest-environment jsdom
import { Children, createElement, isValidElement, Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), skills: vi.fn(), certifications: vi.fn(), capital: vi.fn(), home: vi.fn(),
  projects: vi.fn(), reviews: vi.fn(), submit: vi.fn(), completeDecision: vi.fn(),
  redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }),
  owner: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, unstable_rethrow: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("@/features/career/queries", () => ({
  getCareerProfile: mocks.profile, getSkills: mocks.skills,
  getCertifications: mocks.certifications, getCareerCapitalSummary: mocks.capital, getCareerHome: mocks.home,
}));
vi.mock("@/features/career/form-actions", () => ({ submitCareerForm: mocks.submit }));
vi.mock("@/features/projects/queries", () => ({ getProjects: mocks.projects }));
vi.mock("@/features/reviews/queries", () => ({ getReviewsDashboard: mocks.reviews }));
vi.mock("@/features/reviews/actions", () => ({ completeDecisionReview: mocks.completeDecision }));
vi.mock("@/components/projects/projects-workspace", () => ({ ProjectsWorkspace: () => null }));

import LegacyProjectsPage from "@/app/(app)/projects/page";
import ProjectsPage from "@/app/(app)/tasks/projects/page";
import MaterialsPage from "@/app/(app)/career/materials/page";
import FilesMaterialsPage from "@/app/(app)/files/materials/page";
import CapitalPage from "@/app/(app)/career/capital/page";
import CareerPage from "@/app/(app)/career/page";
import ProfilePage from "@/app/(app)/career/profile/page";
import SkillsPage from "@/app/(app)/career/skills/page";
import CertificationsPage from "@/app/(app)/career/certifications/page";
import ReviewsPage from "@/app/(app)/reviews/page";
import { CareerCapitalSummary } from "@/components/career/career-capital-summary";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}
function disclosureFor(element: Element) {
  const details = element.closest<HTMLDetailsElement>("details");
  expect(details, "manual controls must be inside a closed disclosure").not.toBeNull();
  expect(details!.open).toBe(false);
  return details!;
}
function assertFormsFolded(host: HTMLElement) {
  expect(host.querySelectorAll("form").length).toBeGreaterThan(0);
  for (const form of host.querySelectorAll("form")) disclosureFor(form);
  expect(mocks.submit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue(null);
  mocks.home.mockResolvedValue({});
  mocks.skills.mockResolvedValue([]);
  mocks.certifications.mockResolvedValue({ certifications: [], documents: [] });
  mocks.capital.mockResolvedValue({ facts: 12, verifiedFacts: 7, approvedBullets: 4, outputs: 2, skills: 3, certifications: 1, gaps: [], unavailable: false });
  mocks.projects.mockResolvedValue({ projects: [], unavailable: false });
  mocks.reviews.mockResolvedValue({ daily: { key: "daily-fixture" }, weekly: { key: "weekly-fixture" }, reviews: [], dueDecisions: [] });
});

describe("AI-first compatibility routes", () => {
  it.each([[undefined, "/tasks/projects"], ["1", "/tasks/projects?create=1"], ["0", "/tasks/projects"]])("preserves supported legacy Projects intents (%s)", async (create, destination) => {
    await expect(LegacyProjectsPage({ searchParams: Promise.resolve({ create }) })).rejects.toThrow(`redirect:${destination}`);
    expect(mocks.projects).not.toHaveBeenCalled();
  });

  it("renders Projects at the canonical task subroute and passes its one-shot create intent", async () => {
    const projects = [{ id: "project-fixture", name: "Synthetic project" }];
    mocks.projects.mockResolvedValue({ projects, unavailable: false });
    const page = await ProjectsPage({ searchParams: Promise.resolve({ create: "1" }) });
    expect(page.type).toBe(ProjectsWorkspace);
    expect(page.props).toMatchObject({ projects, initialCreateOpen: true });
    expect(mocks.projects).toHaveBeenCalledOnce();
  });

  it("keeps a failed Projects read distinct from an empty list", async () => {
    mocks.projects.mockResolvedValue({ projects: [], unavailable: true });
    const host = render(await ProjectsPage({ searchParams: Promise.resolve({}) }));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("项目数据暂时无法读取");
    expect(host.querySelector("form")).toBeNull();
  });

  it("routes materials to Files and capital to the home summary", () => {
    expect(() => MaterialsPage()).toThrow("redirect:/files/materials");
    expect(() => CapitalPage()).toThrow("redirect:/career#capital");
  });

  it("provides a stable capital anchor before its streamed summary resolves", async () => {
    const page = await CareerPage();
    const anchor = Children.toArray(page.props.children).find((child) => isValidElement<{ id?: string }>(child) && child.props.id === "capital") as ReactElement<{ children: ReactElement }>;
    expect(anchor, "legacy #capital hash needs an anchor before deferred data arrives").toBeDefined();
    expect(anchor.props.children.type).toBe(Suspense);
    expect(mocks.capital).not.toHaveBeenCalled();
  });

  it("removes duplicate Career destinations while retaining Files and reader routes", () => {
    const host = render(createElement(CareerNav, { current: "/career/profile" }));
    expect(host.querySelector('a[href="/career/capital"]')).toBeNull();
    expect(host.querySelector('a[href="/career/materials"]')).toBeNull();
    for (const href of ["/files", "/career/profile", "/career/skills", "/career/certifications"]) {
      expect(host.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
});

describe("reader-first Career pages", () => {
  it("shows all saved profile fields before a folded, prefilled correction form", async () => {
    mocks.profile.mockResolvedValue({
      professional_headline: "Synthetic headline", current_stage: "Fixture stage",
      target_graduation_date: "2027-06-01", target_recruitment_cycle: "Fixture cycle",
      career_summary: "Fixture summary", preferred_locations: ["Fixture city A", "Fixture city B"],
      preferred_work_types: ["Fixture preference"], risk_preferences: "Fixture risk",
      constraints_markdown: "Fixture constraint", goals_markdown: "Fixture goal",
    });
    const host = render(await ProfilePage());
    const summary = host.querySelector('[aria-label="职业档案摘要"]')!;
    expect(summary.closest("details")).toBeNull();
    expect(summary.querySelectorAll("h2")).toHaveLength(10);
    for (const text of ["Synthetic headline", "Fixture stage", "2027-06-01", "Fixture cycle", "Fixture summary", "Fixture city A · Fixture city B", "Fixture preference", "Fixture risk", "Fixture constraint", "Fixture goal"]) {
      expect(summary.textContent).toContain(text);
    }
    assertFormsFolded(host);
    expect(host.querySelector<HTMLTextAreaElement>('[name="preferred_locations"]')?.value).toBe("Fixture city A\nFixture city B");
    expect(host.querySelector<HTMLTextAreaElement>('[name="goals_markdown"]')?.value).toBe("Fixture goal");
    expect(summary.compareDocumentPosition(host.querySelector("form")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows missing profile data honestly without making the form primary", async () => {
    const host = render(await ProfilePage());
    expect(host.querySelector('[aria-label="职业档案摘要"]')?.textContent?.match(/尚未记录/g)).toHaveLength(10);
    assertFormsFolded(host);
  });

  it("shows Skills evidence before correction and keeps supplemental creation after the records", async () => {
    mocks.skills.mockResolvedValue([{ id: "skill-fixture", name: "Fixture analysis", category: "analytical", proficiency: "working", evidence_markdown: "Synthetic evidence", last_used_at: "2026-10-01" }]);
    const host = render(await SkillsPage());
    const record = host.querySelector("article")!;
    expect(record.textContent).toContain("Fixture analysis");
    expect(record.textContent).toContain("Synthetic evidence");
    expect(record.textContent).toContain("分析 · 可工作使用");
    assertFormsFolded(host);
    const create = [...host.querySelectorAll("details")].find((details) => details.querySelector("summary")?.textContent?.includes("补充能力"))!;
    expect(record.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector<HTMLInputElement>('[name="skill_id"]')?.value).toBe("skill-fixture");
    expect(record.querySelector<HTMLInputElement>('[name="last_used_at"]')?.value).toBe("2026-10-01");
  });

  it("shows Certifications before correction and retains evidence links in the form", async () => {
    mocks.certifications.mockResolvedValue({ certifications: [{ id: "cert-fixture", name: "Fixture certification", issuer: "Fixture issuer", status: "issued", expiry_date: "2028-01-01", document_id: "doc-fixture", notes_markdown: "Fixture notes" }], documents: [{ id: "doc-fixture", title: "Fixture evidence", original_filename: "fixture.pdf" }] });
    const host = render(await CertificationsPage());
    const record = host.querySelector("article")!;
    expect(record.textContent).toContain("Fixture certification");
    expect(record.textContent).toContain("已获得");
    expect(record.textContent).toContain("到期 2028-01-01");
    assertFormsFolded(host);
    expect(record.querySelector<HTMLSelectElement>('[name="document_id"]')?.value).toBe("doc-fixture");
    const create = [...host.querySelectorAll("details")].find((details) => details.querySelector("summary")?.textContent?.includes("补充证书"))!;
    expect(record.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps zero, unknown counts and secondary gap detail distinct", async () => {
    mocks.capital.mockResolvedValue({ facts: null, verifiedFacts: 0, approvedBullets: 4, outputs: 2, skills: 3, certifications: 1, gaps: [{ id: "gap-fixture", summary: "Synthetic gap evidence" }], unavailable: true });
    const host = render(await CareerCapitalSummary());
    const summary = host.querySelector('[aria-labelledby="capital-title"]')!;
    expect(summary.querySelector('[role="status"]')?.textContent).toContain("未知");
    expect([...summary.querySelectorAll("dd")].map((node) => node.textContent)).toEqual(["—", "0", "4", "2", "3", "1"]);
    disclosureFor(summary.querySelector("article")!);
    expect(summary.querySelector('a[href="/files"]')).not.toBeNull();
  });
});

describe("secondary reviews and interview management", () => {
  it("keeps existing history and decision confirmation ahead of optional review creation", async () => {
    mocks.reviews.mockResolvedValue({ daily: { key: "daily-fixture" }, weekly: { key: "weekly-fixture" }, reviews: [{ id: "review-fixture", review_key: "daily-fixture", title: "Synthetic history", status: "completed", content_markdown: "Fixture review body", review_sources: [{ count: 2 }], generated_with_ai: false }], dueDecisions: [{ id: "decision-fixture", title: "Fixture decision", review_at: "2026-10-01" }] });
    const host = render(await ReviewsPage());
    const history = host.querySelector('a[href="/reviews/review-fixture"]')!;
    expect(history.closest("details")).toBeNull();
    const daily = host.querySelector('a[href="/reviews/daily"]')!;
    const optional = disclosureFor(daily);
    expect(optional.textContent).toContain("已有记录，可查看");
    expect(optional.textContent).toContain("按需开始");
    expect(host.textContent).not.toContain("尚未完成");
    expect(history.compareDocumentPosition(optional) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.textContent).toContain("Fixture decision");
    expect([...host.querySelectorAll("form button")].map((node) => node.textContent)).toEqual(["确认维持", "确认反转"]);
    expect(mocks.completeDecision).not.toHaveBeenCalled();
  });

  it("keeps reading and practice visible with context, while manual management is folded", () => {
    const host = render(createElement(InterviewNav, { current: "/career/interview", context: "fixture target" }));
    const primary = [...host.querySelectorAll("a")].filter((link) => !link.closest("details"));
    expect(primary.map((link) => link.textContent)).toEqual(["学习库", "练习", "复盘"]);
    expect(primary.map((link) => link.getAttribute("href"))).toEqual(["/career/interview?context=fixture%20target", "/career/interview/practice?context=fixture%20target", "/career/interview/insights?context=fixture%20target"]);
    for (const href of ["/career/interview/questions", "/career/interview/sessions"]) disclosureFor(host.querySelector(`a[href="${href}"]`)!);
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it.each([["/career/interview/questions/question-fixture", "题目管理"], ["/career/interview/sessions/session-fixture", "面试记录"]])("retains exactly one active destination on %s", (current, label) => {
    const host = render(createElement(InterviewNav, { current }));
    const active = host.querySelectorAll('[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe(label);
    expect(disclosureFor(active[0]).querySelector("summary")?.textContent).toBe(label);
  });
});


describe("count-only Career capital query", () => {
  type Read = { table: string; steps: Array<{ method: string; args: unknown[] }> };
  function queryHarness(failure?: string) {
    const reads: Read[] = [];
    const from = vi.fn((table: string) => {
      const read: Read = { table, steps: [] };
      reads.push(read);
      const query: Record<string, unknown> = {};
      for (const method of ["select", "is", "eq", "or", "order", "limit"]) {
        query[method] = (...args: unknown[]) => { read.steps.push({ method, args }); return query; };
      }
      const response = { data: table === "gap_analysis_runs" ? [{ id: "gap-fixture", summary: "Synthetic gap" }] : null, count: table === "skills" ? 0 : 7, error: table === failure ? { message: "Fixture unavailable" } : null };
      query.then = (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve);
      return query;
    });
    mocks.owner.mockResolvedValue({ supabase: { from } });
    return { reads, from };
  }

  it("counts active records without reading fact bodies and bounds recent gap summaries", async () => {
    const { getCareerCapitalSummary } = await vi.importActual<typeof import("@/features/career/queries")>("@/features/career/queries");
    const { reads } = queryHarness();
    const data = await getCareerCapitalSummary();
    expect(data).toMatchObject({ facts: 7, verifiedFacts: 7, approvedBullets: 7, outputs: 7, skills: 0, certifications: 7, unavailable: false });
    expect(mocks.owner).toHaveBeenCalledOnce();
    expect(reads).toHaveLength(7);
    for (const read of reads) {
      expect(read.steps).toContainEqual({ method: "is", args: ["archived_at", null] });
      if (read.table !== "gap_analysis_runs") expect(read.steps[0]).toEqual({ method: "select", args: ["id", { count: "exact", head: true }] });
    }
    const facts = reads.filter((read) => read.table === "experience_facts");
    expect(facts[1].steps).toContainEqual({ method: "or", args: ["source_document_id.not.is.null,verification_status.neq.unverified"] });
    expect(reads.find((read) => read.table === "experience_bullets")?.steps).toContainEqual({ method: "eq", args: ["status", "approved"] });
    const gaps = reads.find((read) => read.table === "gap_analysis_runs")!;
    expect(gaps.steps[0]).toEqual({ method: "select", args: ["id,summary"] });
    expect(gaps.steps).toContainEqual({ method: "order", args: ["created_at", { ascending: false }] });
    expect(gaps.steps).toContainEqual({ method: "limit", args: [3] });
  });

  it("preserves failed counts as unknown while keeping successful zero counts", async () => {
    const { getCareerCapitalSummary } = await vi.importActual<typeof import("@/features/career/queries")>("@/features/career/queries");
    queryHarness("experience_facts");
    expect(await getCareerCapitalSummary()).toMatchObject({ facts: null, verifiedFacts: null, skills: 0, unavailable: true });
  });

  it("does not read capital before owner authentication succeeds", async () => {
    const { getCareerCapitalSummary } = await vi.importActual<typeof import("@/features/career/queries")>("@/features/career/queries");
    const { from } = queryHarness();
    mocks.owner.mockRejectedValueOnce(new Error("Fixture unauthenticated"));
    await expect(getCareerCapitalSummary()).rejects.toThrow("Fixture unauthenticated");
    expect(from).not.toHaveBeenCalled();
  });
});


describe("Files-owned evidence compatibility", () => {
  type DocumentRow = { id: string; title: string; document_type: string; uploaded_at: string; confidentiality_level: string; storage_provider: string; archived_at: string | null };
  type Read = { table: string; steps: Array<{ method: string; args: unknown[] }> };
  const document = (id: string, extra: Partial<DocumentRow> = {}): DocumentRow => ({ id, title: `Synthetic material ${id}`, document_type: "project_evidence", uploaded_at: "2026-10-01T00:00:00Z", confidentiality_level: "private", storage_provider: "supabase_storage", archived_at: null, ...extra });
  function queryHarness(rows: DocumentRow[], failurePage = -1) {
    const reads: Read[] = [];
    const from = vi.fn((table: string) => {
      const read: Read = { table, steps: [] };
      const page = reads.push(read) - 1;
      const query: Record<string, unknown> = {};
      for (const method of ["select", "is", "neq", "order", "limit", "gt"]) {
        query[method] = (...args: unknown[]) => { read.steps.push({ method, args }); return query; };
      }
      query.then = (resolve: (value: { data: DocumentRow[] | null; error: unknown }) => unknown) => {
        let selected = [...rows];
        for (const { method, args } of read.steps) {
          const column = args[0] as keyof DocumentRow;
          if (method === "is") selected = selected.filter((row) => row[column] === args[1]);
          if (method === "neq") selected = selected.filter((row) => row[column] !== args[1]);
          if (method === "gt") selected = selected.filter((row) => String(row[column]) > String(args[1]));
        }
        selected.sort((a, b) => a.id.localeCompare(b.id));
        // Simulate a deployment API cap below the requested limit. The route
        // must continue after short pages, rather than silently lose evidence.
        return Promise.resolve(page === failurePage ? { data: null, error: { message: "Fixture materials unavailable" } } : { data: selected.slice(0, 1), error: null }).then(resolve);
      };
      return query;
    });
    mocks.owner.mockResolvedValue({ supabase: { from } });
    return { from, reads };
  }

  it("authenticates and pages all active non-R2 metadata without inventing download links", async () => {
    const { reads } = queryHarness([
      document("a", { title: "Synthetic older evidence" }),
      document("b", { title: "Synthetic recent evidence", uploaded_at: "2026-10-07T00:00:00Z" }),
      document("c", { storage_provider: "cloudflare_r2" }),
      document("d", { archived_at: "2026-10-07T00:00:00Z" }),
    ]);
    const host = render(await FilesMaterialsPage());
    expect(mocks.owner).toHaveBeenCalledOnce();
    expect([...host.querySelectorAll("article h2")].map((node) => node.textContent)).toEqual(["Synthetic recent evidence", "Synthetic older evidence"]);
    expect(reads).toHaveLength(3);
    for (const read of reads) {
      expect(read.table).toBe("documents");
      expect(read.steps).toContainEqual({ method: "select", args: ["id,title,document_type,uploaded_at,confidentiality_level"] });
      expect(read.steps).toContainEqual({ method: "neq", args: ["storage_provider", "cloudflare_r2"] });
      expect(read.steps).toContainEqual({ method: "is", args: ["archived_at", null] });
      expect(read.steps).toContainEqual({ method: "order", args: ["id"] });
      expect(read.steps).toContainEqual({ method: "limit", args: [200] });
    }
    expect(reads[1].steps).toContainEqual({ method: "gt", args: ["id", "a"] });
    expect(reads[2].steps).toContainEqual({ method: "gt", args: ["id", "b"] });
    expect([...host.querySelectorAll("a")].map((node) => node.getAttribute("href"))).toEqual(["/files", "/career/experiences"]);
    expect(host.querySelector("form")).toBeNull();
  });

  it("reports even a later-page read failure without presenting an incomplete or empty directory", async () => {
    queryHarness([document("a"), document("b")], 1);
    const host = render(await FilesMaterialsPage());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("暂时无法读取");
    expect(host.querySelector("article")).toBeNull();
    expect(host.textContent).not.toContain("没有这类");
    expect(host.querySelector('a[href="/files"]')).not.toBeNull();
  });

  it("shows an honest successful empty state with a return to ordinary Files", async () => {
    queryHarness([]);
    const host = render(await FilesMaterialsPage());
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("没有这类私有存储中的证明材料");
    expect(host.querySelector('a[href="/files"]')).not.toBeNull();
  });

  it("does not downgrade authentication failure into an empty materials directory", async () => {
    const { from } = queryHarness([]);
    mocks.owner.mockRejectedValueOnce(new Error("Fixture materials owner required"));
    await expect(FilesMaterialsPage()).rejects.toThrow("Fixture materials owner required");
    expect(from).not.toHaveBeenCalled();
  });
});
