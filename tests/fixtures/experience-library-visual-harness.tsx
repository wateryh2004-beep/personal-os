import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ExperienceLibraryWorkspace } from "@/components/experience-library/experience-library-workspace";
import type { ExperienceEntrySummary } from "@/features/experience-library/types";

const entryId = "11111111-1111-4111-8111-111111111111";
const data = {
  available: true,
  query: "",
  total: 2,
  captureTotal: 4,
  mediaTotal: 7,
  entries: [
    {
      id: entryId,
      sourceUrl: "https://www.xiaohongshu.com/explore/synthetic",
      title: "港大金融面试：从群面到二面的完整复盘",
      tags: ["留学申请", "面试", "港大"],
      summary: "网友记录了群面分工、技术问题和二面追问；个人判断与经历原文保持区分。",
      aiStatus: "completed",
      aiErrorCode: null,
      aiProvider: "deepseek",
      aiModel: "deepseek-chat",
      aiAnalyzedAt: "2026-10-28T05:50:00.000Z",
      updatedAt: "2026-10-28T06:00:00.000Z",
      createdAt: "2026-10-27T08:30:00.000Z",
      captureCount: 3,
      mediaCount: 5,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      sourceUrl: null,
      title: "咨询实习第一周：研究任务和交付节奏",
      tags: ["咨询实习", "周记"],
      summary: null,
      aiStatus: "not_requested",
      aiErrorCode: null,
      aiProvider: null,
      aiModel: null,
      aiAnalyzedAt: null,
      updatedAt: "2026-10-26T09:20:00.000Z",
      createdAt: "2026-10-26T09:20:00.000Z",
      captureCount: 1,
      mediaCount: 2,
    },
  ],
} satisfies {
  available: boolean;
  query: string;
  total: number;
  captureTotal: number;
  mediaTotal: number;
  entries: ExperienceEntrySummary[];
};

const root = createRoot(document.getElementById("root")!);
root.render(createElement("div", { className: "experience-preview-shell" },
  createElement(ExperienceLibraryWorkspace, {
    data,
    aiConfig: {
      configured: true,
      provider: "deepseek",
      modelId: "deepseek-chat",
      lastTestedAt: "2026-10-28T05:20:00.000Z",
    },
    initialEntry: null,
  }),
));

function setValue(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

const png = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
), (character) => character.charCodeAt(0));

window.setTimeout(() => {
  const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) return;
  const content = [
    "港大金融面试：从群面到二面",
    "1. 群面案例是新能源汽车出海，先拆分市场规模和进入路径。",
    "2. 二面追问了估值假设、为什么香港、最近关注的一家公司。",
    "3. 面试官会顺着简历深挖，实习里的数字最好准备到口径。",
    "",
    "评论 1：补充一个 GPA 材料细节，成绩单和我提交的版本需要完全一致。",
    "评论 2：二面全程中文，但自我介绍允许英文。",
  ].join("\n");
  setValue(textarea, content);
  textarea.setSelectionRange(content.indexOf("GPA 材料细节"), content.indexOf("GPA 材料细节") + "GPA 材料细节".length);
  const files = ["gpa-proof.png", "case-notes.png", "interview-room.png"].map((name, index) =>
    new File([png], name, { type: "image/png", lastModified: 1_700_000_000_000 + index }));
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", {
    value: { files, getData: () => "" },
  });
  textarea.dispatchEvent(paste);
  document.documentElement.dataset.previewReady = "true";
}, 250);
