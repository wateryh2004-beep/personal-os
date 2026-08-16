import { describe, expect, it } from "vitest";
import { decideContextGate } from "@/features/assistant/kernel/context-gate";

const gate = (message: string, extra = {}) => decideContextGate({ message, surface: "global", hasCurrentSurface: false, ...extra });
describe("Assistant Context Gate", () => {
  it("普通知识和问候不读取 Personal OS", () => {
    expect(gate("什么是久期？")).toMatchObject({ mode:"none", needsPersonalData:false, needsTools:false, complexity:"simple" });
    expect(gate("你好").mode).toBe("none");
  });
  it("当前笔记改写只使用当前 surface", () => expect(decideContextGate({ message:"帮我把这段话写得更专业", surface:"notes", hasCurrentSurface:true })).toMatchObject({ mode:"local", needsPersonalData:false, needsCurrentSurface:true }));
  it("职业、回顾和观点变化各自使用最小模块", () => {
    expect(gate("我现在的职业方向是什么？")).toMatchObject({ mode:"cross_module", likelyModules:["career","memory"] });
    expect(gate("我最近主要在思考什么？")).toMatchObject({ mode:"cross_module", complexity:"deep", suggestedSkills:["retrospective-thinking"] });
    expect(gate("我最近是不是改变了对量化的看法？")).toMatchObject({ suggestedSkills:["belief-change"], likelyModules:["memory","notes"] });
  });
  it("时间查询和日程操作不扩大到无关模块", () => {
    expect(gate("明天下午有时间吗？")).toMatchObject({ mode:"targeted", likelyModules:["calendar"] });
    expect(gate("明天下午三点帮我安排 CFA 学习。")).toMatchObject({ mode:"action", likelyModules:["calendar"] });
  });
  it("明确查找笔记时只打开 Notes", () => expect(gate("找到我之前关于银行总行的笔记。")).toMatchObject({ mode:"targeted", likelyModules:["notes"] }));
  it("自我画像类问题路由到个人分析并读取 Personal OS", () => {
    expect(gate("你觉得我是一个什么样的人？")).toMatchObject({ mode:"cross_module", complexity:"deep", likelyModules:["memory","notes","reviews"], suggestedSkills:["retrospective-thinking"], needsPersonalData:true, needsTools:true, reasonCode:"self_profile" });
    expect(gate("我的性格特点是什么？")).toMatchObject({ mode:"cross_module", needsPersonalData:true });
    expect(gate("我是谁")).toMatchObject({ mode:"cross_module", needsPersonalData:true });
    expect(gate("你好")).toMatchObject({ mode:"none", needsPersonalData:false });
  });
});
