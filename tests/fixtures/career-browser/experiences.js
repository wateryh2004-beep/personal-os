// Synthetic content only. No personal records, environment or database clients.
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12,"0")}`;
const base = {id:id(1),organization:"示例研究团队",role:"数据分析实习生",department:"研究与产品",location:"北京",experience_type:"internship",is_current:true,start_date:"2026-06-01",end_date:null,status:"confirmed",confidentiality_level:"private",background_markdown:"# 研究背景\n\n把分散的调研资料整理为可复核的研究流程。\n\n| 项目 | 状态 |\n| --- | --- |\n| 示例研究 | 已整理 |",raw_description_markdown:"原始记录完整保留，不由概括替代。",archived_at:null};
export const experienceRows = [base,{...base,id:id(2),organization:"示例技术团队",role:"系统开发与协作负责人".repeat(8),experience_type:"project",is_current:false,start_date:null,end_date:null,status:"draft",department:"工具实验室"},{...base,id:id(3),organization:"示例大学",role:"研究生",experience_type:"education",location:"上海",is_current:false,start_date:"2021-09-01",end_date:"2025-06-30"}];
export function experienceListFixture() {
  const mode=new URLSearchParams(location.search).get("fixture");
  return {experiences:mode==="empty"?[]:mode==="error"?[]:experienceRows.map(row=>({id:row.id,organization:row.organization,role:row.role,department:row.department,location:row.location,experience_type:row.experience_type,is_current:row.is_current,start_date:row.start_date,end_date:row.end_date,status:row.status,confidentiality_level:row.confidentiality_level})),unavailable:mode==="error"};
}
export function experienceDetailFixture() {
  const mode=new URLSearchParams(location.search).get("fixture");
  const fact={id:id(11),experience_id:base.id,content:"建立字段口径、核对样本来源，再形成可复核的分析。".repeat(12)+"事实完整尾文。",fact_type:"action",verification_status:"self_confirmed",metric_value:0,metric_unit:"条差异",occurred_at:"2026-08-01",notes_markdown:"## 核对过程\n\n补充说明原文。\n\n```sql\nSELECT example_long_column_name FROM synthetic_table;\n```",source_document_id:null};
  const sparse=mode==="sparse";
  return {experience:sparse?{...base,background_markdown:"",raw_description_markdown:"",department:null}:base,
    facts:sparse?[]:[fact],versions:sparse?[]:[{...fact,id:id(21),fact_id:fact.id,version_number:1,content:"历史事实原文。",created_at:"2026-08-01T08:00:00Z"}],
    outputs:sparse?[]:[{id:id(31),name:"示例研究报告",output_type:"report",confidentiality_level:"private",occurred_at:"2026-08-02",description_markdown:"成果描述全文。".repeat(30)+"描述完整尾文。",result_markdown:"形成可复核的样本与结论。结果完整尾文。",public_url:"https://example.com/research"}],
    bullets:sparse?[]:[{id:id(41),content:"把研究口径整理为团队可复用流程。",status:"draft",source:"human",language:"zh-CN",career_direction_id:id(51)}],
    documents:sparse?[]:[{id:id(61),title:"研究佐证",original_filename:"示例研究与复核材料".repeat(10)+".pdf",file_size:2048,document_type:"report",confidentiality_level:"private"}],
    links:[],audit:[],timezone:"Asia/Shanghai",directions:[{id:id(51),name:"示例分析方向"}],unavailable:mode==="error"};
}
