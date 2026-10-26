import { describe, expect, it } from "vitest";
import { parseWorkbenchCommand } from "@/features/workbench/operation-command-parser";
import { metadataCommandSchema } from "@/features/workbench/operation-contracts";
const now="2026-10-25T04:00:00.000Z";
const id="10000000-0000-4000-8000-000000000001";
describe("deterministic workbench parameter commands",()=>{
 it("resolves a Friday interview in the profile timezone, preserving its requested duration",()=>{
  expect(parseWorkbenchCommand("周五15点模拟面试45分钟","Asia/Shanghai",now)).toEqual({kind:"calendar",subject:"模拟面试",startsAt:"2026-10-30T07:00:00.000Z",endsAt:"2026-10-30T07:45:00.000Z",timezone:"Asia/Shanghai"});
 });
 it("resolves tomorrow with calendar DATE semantics",()=>{
  expect(parseWorkbenchCommand("明天9:30复盘30分钟","America/New_York",now)).toMatchObject({startsAt:"2026-10-26T13:30:00.000Z",endsAt:"2026-10-26T14:00:00.000Z"});
 });
 it("does not infer a mutation from ordinary search or unsupported grammar",()=>{
  for(const text of ["模拟面试","周五25点模拟面试45分钟","今天15点模拟面试0分钟","把任务都处理掉"])expect(parseWorkbenchCommand(text,"Asia/Shanghai",now)).toBeNull();
  expect(parseWorkbenchCommand("把选中任务移到明天","Asia/Shanghai",now)).toEqual({kind:"tasks_tomorrow"});
 });
 it("fails closed on a DST overlap rather than moving the requested wall time",()=>{
  expect(()=>parseWorkbenchCommand("周日1:30练习45分钟","America/New_York","2026-10-31T12:00:00Z")).toThrow("calendar_wall_time_ambiguous");
 });
});
describe("local operation input",()=>{
 it("refuses duplicate targets, unknown inverse/table/owner and missing snapshots",()=>{
  const value={requestId:id,operation:"note_move",items:[{id,expectedRevision:0,folderId:null}]};
  expect(metadataCommandSchema.safeParse(value).success).toBe(true);
  expect(metadataCommandSchema.safeParse({...value,user_id:id}).success).toBe(false);
  expect(metadataCommandSchema.safeParse({...value,items:[value.items[0],value.items[0]]}).success).toBe(false);
  expect(metadataCommandSchema.safeParse({...value,items:[{id,folderId:null}]}).success).toBe(false);
  expect(metadataCommandSchema.safeParse({...value,items:[{...value.items[0],table:"notes"}]}).success).toBe(false);
 });
});
