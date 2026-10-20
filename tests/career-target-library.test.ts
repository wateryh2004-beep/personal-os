import { describe, it, expect } from "vitest";
import { emptyTargetFilters, filterTargets, targetFilters, targetQuery, targetDetailHref, targetLibraryHref } from "@/features/career/target-library";
const target={id:"t",title:"研究岗",organization_snapshot:"Example 北京",role_title_snapshot:"Analyst",status:"paused",next_interview_at:null};
describe("target discovery",()=>{
  it("combines normalized terms with actual status without inferring state from titles",()=>{
    const rows=[target,{...target,id:"next",title:"2028 占位",status:"active"}];
    expect(filterTargets(rows,{target_q:"ｅｘａｍｐｌｅ 北京",target_status:"paused"})).toEqual([target]);
    expect(filterTargets(rows,{target_q:"",target_status:"active"}).map(r=>r.id)).toEqual(["next"]);
    expect(filterTargets(rows,{target_q:"北京 不存在",target_status:"all"})).toEqual([]);
    for(const status of ["unknown","constructor","__proto__"]) expect(filterTargets(rows,{target_q:"",target_status:status})).toEqual([]);
  });
  it("keeps multiword input and only builds fixed internal return URLs",()=>{
    const f={target_q:"Example 北京 ",target_status:"paused"};
    expect(targetFilters(new URLSearchParams(targetQuery(f)))).toEqual(f);
    expect(targetLibraryHref(f)).toMatch(/^\/career\/interview\/targets\?/);
    expect(targetDetailHref("a/b",f)).toContain("a%2Fb?");
    expect(targetFilters(new URLSearchParams("return=https://evil.test"))).toEqual(emptyTargetFilters);
  });
});
