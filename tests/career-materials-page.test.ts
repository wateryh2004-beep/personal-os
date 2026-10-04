import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ materials: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/components/links/entity-markdown", () => ({ EntityMarkdown: ({ body }: { body: string }) => createElement("div", { "data-reading-body": true }, body) }));
vi.mock("@/features/career/materials", async (importOriginal) => ({ ...await importOriginal<typeof import("@/features/career/materials")>(), getCareerMaterials: mocks.materials }));
import CareerMaterialsPage from "@/app/(app)/career/materials/page";
import { CareerMaterialsView } from "@/components/career/career-materials-view";

const document = { id: "doc", title: "Synthetic evidence", original_filename: "synthetic.pdf", document_type: "other", confidentiality_level: "private", ai_visibility: "never", storage_provider: "cloudflare_r2", storage_state: "available", uploaded_at: "2026-10-01T08:00:00Z" };

describe("Career materials reading page", () => {
  it("renders saved resume Markdown, an authenticated file link, and the original privacy label without write controls", async () => {
    const data = {
      resumes: [{ id: "resume", title: "Synthetic resume", version_label: "v1", status: "draft", content_markdown: "# Synthetic resume body", document_id: "doc", updated_at: "2026-10-01T08:00:00Z" }],
      documents: [document, { ...document, id: "legacy", title: "Synthetic legacy evidence", storage_provider: "supabase_storage" }],
      associations: [{ documentId: "doc", label: "Synthetic resume", href: "#resume-resume" }, { documentId: "legacy", label: "经历", href: "/career/experiences/experience" }], unavailable: false,
    };
    mocks.materials.mockResolvedValue(data);
    const html = renderToStaticMarkup(await CareerMaterialsPage());
    expect(html).toBe(renderToStaticMarkup(createElement(CareerMaterialsView, { data })));
    expect(html).toContain('data-testid="career-materials-view"');
    expect(html).toContain('data-document-id="legacy"');
    expect(html).toContain("# Synthetic resume body");
    expect(html).toContain('href="/api/files/doc/download?inline=1"');
    expect(html).toContain("不供 AI 使用");
    expect(html).toContain("仅自己可见");
    expect(html).toContain("旧版存储附件");
    expect(html).not.toContain('href="/files?file=legacy"');
    expect(html).not.toContain("/api/files/legacy/download");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
  });
  it("distinguishes a failed read from an empty collection", async () => {
    mocks.materials.mockResolvedValue({ resumes: [], documents: [], associations: [], unavailable: true });
    const html = renderToStaticMarkup(await CareerMaterialsPage());
    expect(html).toContain("可能不完整");
    expect(html).toContain("暂时没有可显示的关联文件");
    expect(html).not.toContain("还没有关联文件");
  });
});
