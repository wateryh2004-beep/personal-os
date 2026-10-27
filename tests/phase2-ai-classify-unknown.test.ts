import {expect,it,vi}from 'vitest';
const boundary=vi.hoisted(()=>({model:vi.fn(),db:undefined as unknown,applied:0}));
vi.mock('ai',async original=>({...await original<typeof import('ai')>(),generateObject:boundary.model}));
vi.mock('@/lib/ai/deepseek',()=>({getDeepSeekModel:async()=>({model:{}})}));
vi.mock('@/lib/auth/require-owner',()=>({requireOwner:async()=>({supabase:boundary.db,userId:'11111111-1111-4111-8111-111111111111'})}));
vi.mock('@/lib/workspace-revalidation',()=>({revalidatePath:async()=>{}}));
import{reclassifyInboxItem}from '@/features/inbox/actions';
const id='22222222-2222-4222-8222-222222222222';
it('a lost commit acknowledgement must remain needs-check rather than a retryable superseded classification',async()=>{
 boundary.model.mockResolvedValue({object:{target:'daily',confidence:1,reason:null}});
 boundary.db={from:(table:string)=>{
  const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:table==='profiles'?{timezone:'Asia/Shanghai'}:{id,content_markdown:'original',processed_at:null},error:null}),order:async()=>({data:[],error:null}),insert:async()=>({data:null,error:null})};return q;
 },rpc:async(name:string)=>{
  if(name==='claim_inbox_classification')return{data:true,error:null};
  if(name==='commit_inbox_classification'){boundary.applied++;return{data:null,error:{code:'FETCH_ERROR',message:'connection lost after commit'}};}
  throw new Error('unexpected RPC');
 }};
 const form=new FormData();form.set('inbox_id',id);
 const result=await reclassifyInboxItem({status:'idle',message:''},form);
 expect(boundary.applied).toBe(1);expect(boundary.model).toHaveBeenCalledTimes(1);
 expect(result).toMatchObject({status:'error',needsCheck:true});
});
