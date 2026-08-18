-- Briefing 从「相关度推荐」转向「信息膳食分配 + 判断价值」。
-- 1) briefing_ai_evaluations 新增判断价值评估维度（旧 personal_relevance/timeliness 列保留，兼容历史缓存行）。
-- 2) decisions 增加 confidence 与 falsification_condition，复用既有决策表承载 Briefing 用户判断
--    （decision_sources 已支持 source_type='briefing_entry' 建立 relation，无需新增表）。

alter table public.briefing_ai_evaluations
  add column if not exists topic_bucket text
    check (topic_bucket is null or topic_bucket in (
      'ai_tech', 'business_startup', 'finance_investing', 'economy_society', 'wildcard'
    )),
  add column if not exists learning_value numeric
    check (learning_value is null or (learning_value between 0 and 100)),
  add column if not exists decision_value numeric
    check (decision_value is null or (decision_value between 0 and 100)),
  add column if not exists source_confidence numeric
    check (source_confidence is null or (source_confidence between 0 and 100)),
  add column if not exists why_worth_reading text,
  add column if not exists key_question text,
  add column if not exists uncertainty text;

alter table public.decisions
  add column if not exists confidence integer
    check (confidence is null or (confidence between 0 and 100)),
  add column if not exists falsification_condition text;
