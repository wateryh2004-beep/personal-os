const modules = ["会计与财务", "SQL与数据分析", "估值与投资判断", "产品设计", "行为与经历", "待分类的新模块"];
export const interviewTargets = [{id:"synthetic-target",title:"模拟研究岗位",organization:"示例机构",role:"研究分析"}];
export const interviewItems = Array.from({length:49},(_,index)=>({
  preparationId:`synthetic-preparation-${index}`,questionId:`synthetic-question-${index}`,contextId:index===48?"synthetic-target":null,
  prompt:index===0?"如果利润增长但经营现金流持续下降，你会先检查哪些因素？请说明结论依赖的条件，并区分已经观察到的事实和仍需验证的推测。":`第 ${index+1} 道模拟题：面对资料不完整、口径不一致的情况，怎样形成可以核对的判断，并说明下一步验证方式？`,
  shortTitle:index===0?"利润与现金流背离":index===1?"从一张表解释 SQL 窗口函数、分组与去重的差异":`模拟问题 ${index+1}`,
  category:index%3===0?"behavioral":"knowledge",categoryLabel:index%3===0?"行为":"专业",style:index%4===0?"stress":"standard",subcategory:index===47?null:modules[index%modules.length],competencies:[],
  thoughts:"## 准备笔记\n\n仅用于界面测试，不代表个人经历。",answerId:`synthetic-answer-${index}`,
  answerMeta:{status:"draft",source:"ai_draft",language:"zh",version_number:2,confirmed_at:null},
  answer:"## 标准答案\n\n这是合成测试内容。我的第一步是核对两项指标的期间、范围与计算口径；随后拆解应收、存货等现金占用变化，区分增长带来的短期占用和持续回款风险。\n\n目前资料不足以判断具体原因。需要结合附注、回款记录及同行变化验证，不能把相关性直接当成因果。\n\n## 思路拆解讲解\n\n### 先确认比较基础\n\n比较前保留期间与范围，不把不同口径的数据直接相减。\n\n### 再判断证据\n\n对每个解释写出可验证的证据；资料不足时说明限制。\n\n## 来源与适用边界\n\n合成场景，不是实际研究结论。"
}));
export const catalogRows = interviewItems.map((item,index)=>({id:item.questionId,prompt:item.prompt,shortTitle:item.shortTitle,category:item.category,style:item.style,subcategory:item.subcategory,preparationCount:index%4}));
