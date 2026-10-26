import {apiAuthenticationFailure,requireOwnerApi} from "@/lib/auth/require-owner";
import {readOperationTimezone} from "@/features/workbench/operation-read-queries";
const headers={"Cache-Control":"private, no-store, max-age=0",Vary:"Cookie"};
export async function GET(request:Request){try{const owner=await requireOwnerApi();if(new URL(request.url).searchParams.size)return Response.json({error:"参数无效。"},{status:400,headers});return Response.json(await readOperationTimezone(owner),{headers});}catch(error){return apiAuthenticationFailure(error)??Response.json({error:"时区暂时不可读取。"},{status:503,headers});}}
