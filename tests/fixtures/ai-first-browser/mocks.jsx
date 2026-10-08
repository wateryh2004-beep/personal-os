import React from "react";
export default function Link({children, href, ...props}) {return <a {...props} href={href}>{children}</a>;}
export const useRouter=()=>({refresh(){}});
export const unstable_rethrow=()=>{};
export const getCareerProfile=async()=>({professional_headline:"示例职业档案",current_stage:"学习阶段",career_summary:"仅用于界面测试的虚构资料",preferred_locations:["示例城市"],preferred_work_types:[]});
export const getSkills=async()=>[{id:"synthetic-skill",name:"示例分析能力",category:"analytical",proficiency:"working",evidence_markdown:"虚构的练习与证据记录"}];
export const getCertifications=async()=>({certifications:[{id:"synthetic-cert",name:"示例证书",status:"issued",issuer:"虚构机构",expiry_date:"2027-01-01"}],documents:[]});
export const getCareerCapitalSummary=async()=>({facts:5,verifiedFacts:3,approvedBullets:2,outputs:2,skills:1,certifications:1,gaps:[],unavailable:false});
export const getReviewsDashboard=async()=>({daily:{key:"daily"},weekly:{key:"weekly"},reviews:[{id:"synthetic-review",title:"示例 AI 复盘",status:"draft",content_markdown:"基于虚构记录生成，等待查看",generated_with_ai:true,review_sources:[{count:2}]}],dueDecisions:[{id:"synthetic-decision",title:"示例待复核决定",review_at:"2026-10-01"}]});
const blocked=async()=>({status:"error",message:"这是隔离测试，未写入任何数据。"});
export const submitCareerForm=blocked;
export const captureInboxItem=blocked, archiveInboxItem=blocked, restoreInboxItem=blocked, convertInboxToDailyNote=blocked, convertInboxToNote=blocked, dismissInboxProposal=blocked, reclassifyInboxItem=blocked, createCalendarEvent=blocked, createMicrosoftTodoTaskAction=blocked, completeDecisionReview=blocked;
