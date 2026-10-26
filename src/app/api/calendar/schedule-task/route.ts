import {z} from "zod";
import {apiAuthenticationFailure,requireOwnerApi} from "@/lib/auth/require-owner";
import {readCalendarScheduleTaskQuery} from "@/features/workbench/operation-read-queries";
const headers={"Cache-Control":"private, no-store, max-age=0",Vary:"Cookie"};
export async function GET(request:Request){try{const owner=await requireOwnerApi();const params=new URL(request.url).searchParams;const parsed=z.object({id:z.string().uuid()}).strict().safeParse(Object.fromEntries(params));if(!parsed.success||[...params.keys()].length!==1)return Response.json({error:"任务引用无效。"},{status:400,headers});return Response.json(await readCalendarScheduleTaskQuery(owner,parsed.data.id),{headers});}catch(error){return apiAuthenticationFailure(error)??Response.json({error:"任务暂时不可读取。"},{status:503,headers});}}
