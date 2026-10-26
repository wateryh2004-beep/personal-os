import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({owner:vi.fn(),timezone:vi.fn(),tasks:vi.fn(),conflicts:vi.fn(),task:vi.fn()}));
vi.mock("@/lib/auth/require-owner",()=>({requireOwnerApi:mocks.owner,apiAuthenticationFailure:(error:unknown)=>error==="anonymous"?Response.json({error:"auth"},{status:401}):error==="foreign"?Response.json({error:"auth"},{status:403}):null}));
vi.mock("@/features/workbench/operation-read-queries",()=>({readOperationTimezone:mocks.timezone,readPendingCalendarTasksQuery:mocks.tasks,readCalendarScheduleConflictsQuery:mocks.conflicts,readCalendarScheduleTaskQuery:mocks.task}));
import {GET as timezone} from "@/app/api/workbench/timezone/route";
import {GET as tasks} from "@/app/api/calendar/pending-tasks/route";
import {GET as conflicts} from "@/app/api/calendar/schedule-conflicts/route";
import {GET as task} from "@/app/api/calendar/schedule-task/route";
const id="10000000-0000-4000-8000-000000000001",owner={userId:"verified-owner",supabase:{}};
const routes=[{read:timezone,url:"/api/workbench/timezone",query:mocks.timezone},{read:tasks,url:"/api/calendar/pending-tasks",query:mocks.tasks},{read:conflicts,url:"/api/calendar/schedule-conflicts?startsAt=2030-01-01T00:00:00Z&endsAt=2030-01-02T00:00:00Z",query:mocks.conflicts},{read:task,url:`/api/calendar/schedule-task?id=${id}`,query:mocks.task}];
beforeEach(()=>{vi.clearAllMocks();mocks.owner.mockResolvedValue(owner);mocks.timezone.mockResolvedValue({timezone:"Asia/Shanghai"});mocks.tasks.mockResolvedValue({tasks:[],timezone:"Asia/Shanghai"});mocks.conflicts.mockResolvedValue({events:[],truncated:false});mocks.task.mockResolvedValue({id});});
describe("operation GET read boundaries",()=>{
 for(const route of routes){
  it.each([['anonymous',401],['foreign',403]])(`authenticates before parsing ${route.url} (%s)`,async(error,status)=>{mocks.owner.mockRejectedValue(error);const response=await route.read(new Request("https://test/invalid?user_id=attacker"));expect(response.status).toBe(status);expect(route.query).not.toHaveBeenCalled();});
  it(`passes only verified owner and returns private uncached ${route.url}`,async()=>{const response=await route.read(new Request(`https://test${route.url}`));expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");expect(response.headers.get("Vary")).toBe("Cookie");expect(route.query.mock.calls[0][0]).toBe(owner);});
  it(`rejects forged owner parameters in ${route.url}`,async()=>{const response=await route.read(new Request(`https://test${route.url}${route.url.includes('?')?'&':'?'}user_id=attacker`));expect(response.status).toBe(400);expect(route.query).not.toHaveBeenCalled();});
  it(`returns truthful read failure in ${route.url}`,async()=>{route.query.mockRejectedValueOnce(new Error("database"));expect((await route.read(new Request(`https://test${route.url}`))).status).toBe(503);});
 }
 it.each(["startsAt=bad&endsAt=bad","startsAt=2030-01-02T00:00:00Z&endsAt=2030-01-01T00:00:00Z","startsAt=2030-01-01T00:00:00Z&startsAt=2030-01-01T00:00:00Z&endsAt=2030-01-02T00:00:00Z"])("rejects invalid/duplicate range %s",async(query)=>{expect((await conflicts(new Request(`https://test/api/calendar/schedule-conflicts?${query}`))).status).toBe(400);expect(mocks.conflicts).not.toHaveBeenCalled();});
});
