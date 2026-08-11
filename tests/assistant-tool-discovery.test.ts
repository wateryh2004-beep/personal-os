import { describe, expect, it } from "vitest";
import { searchToolCapabilities } from "@/features/assistant/kernel/capability-index";
import { initialToolNames } from "@/features/assistant/kernel/prepare-step";
import { decideContextGate } from "@/features/assistant/kernel/context-gate";
describe("Assistant tool discovery", () => {
  it("任务查询优先发现 To Do 工具", async () => expect((await searchToolCapabilities("读取最近未完成和逾期事项", 5)).some((item)=>item.module==="tasks")).toBe(true));
  it("笔记查询优先发现 Notes 工具", async () => expect((await searchToolCapabilities("找我之前写的关于量化的内容", 5)).some((item)=>item.name==="searchNotes")).toBe(true));
  it("初始工具包含 meta 但绝不包含 execute", () => { const names=initialToolNames(decideContextGate({message:"明天下午安排会议",surface:"global",hasCurrentSurface:false})); expect(names).toContain("searchTools"); expect(names.some((name)=>/execute/i.test(name))).toBe(false); });
});
