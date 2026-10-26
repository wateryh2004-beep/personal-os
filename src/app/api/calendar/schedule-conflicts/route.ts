import {apiAuthenticationFailure,requireOwnerApi} from "@/lib/auth/require-owner";
import {calendarScheduleRangeSchema} from "@/features/workbench/operation-read-contracts";
import {readCalendarScheduleConflictsQuery} from "@/features/workbench/operation-read-queries";
const headers={"Cache-Control":"private, no-store, max-age=0",Vary:"Cookie"};
export async function GET(request:Request){try{const owner=await requireOwnerApi();const params=new URL(request.url).searchParams;const parsed=calendarScheduleRangeSchema.safeParse(Object.fromEntries(params));if(!parsed.success||[...params.keys()].length!==2)return Response.json({error:"时间范围无效。"},{status:400,headers});return Response.json(await readCalendarScheduleConflictsQuery(owner,parsed.data),{headers});}catch(error){return apiAuthenticationFailure(error)??Response.json({error:"重叠安排暂时不可读取。"},{status:503,headers});}}
