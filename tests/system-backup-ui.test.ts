import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SystemBackupPanel } from "@/components/settings/system-backup-panel";

describe("Discoverable private snapshot controls", () => {
  it("uses an explicit acknowledged POST and never labels initiation as verified", () => {
    const html = renderToStaticMarkup(createElement(SystemBackupPanel));
    expect(html).toContain('aria-labelledby="system-backup-title"');
    expect(html).toContain('action="/api/exports/system"');
    expect(html).toContain('method="post"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('href="/files"');
    expect(html).toContain('快照未加密');
    expect(html).toContain('下载完成不等于校验通过');
    expect(html).toContain('Files 原文件需另下载恢复包');
    expect(html).toContain("rehearse-system-backup-postgres.py");
    expect(html).toContain("休闲私有图片原件与变体一并保存");
    expect(html).not.toContain('role="status"');
  });
});
