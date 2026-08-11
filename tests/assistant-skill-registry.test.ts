import { describe, expect, it } from "vitest";
import { getSkills, searchSkills } from "@/features/assistant/skills/registry";
describe("Assistant skills", () => {
  it("按需返回职业和决策 Skill", () => expect(searchSkills("下一段实习怎么选", 5).map((item)=>item.id)).toContain("career-strategy"));
  it("只在选中后加载完整指令", () => { const skill=getSkills(["belief-change"])[0]; expect(skill.instructions).toContain("历史位置"); });
});
