import { describe, expect, it } from "vitest";
import { deriveSessionState } from "@/features/assistant/kernel/session-state";
import { decideContextGate } from "@/features/assistant/kernel/context-gate";
describe("Assistant session state", () => {
  it("保留跨轮职业比较和新增约束", () => { const first=deriveSessionState(null,[{id:"1",role:"user",parts:[{type:"text",text:"我下一段实习选北京还是上海？"}]}] as never,decideContextGate({message:"我下一段实习选北京还是上海？",surface:"global",hasCurrentSurface:false})); const second=deriveSessionState(first,[{id:"2",role:"user",parts:[{type:"text",text:"那如果只考虑银行总行呢？"}]}] as never,decideContextGate({message:"那如果只考虑银行总行呢？",surface:"global",hasCurrentSurface:false})); expect(second.activeGoal).toBe(first.activeGoal); expect(second.activeTopic).toBe("银行总行"); expect(second.activeConstraints.join(" ")).toContain("银行总行"); });
});
