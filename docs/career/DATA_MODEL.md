# Career 数据模型与保留计划

现有 `career_profiles`、`career_directions`、`experiences`、`experience_facts`、`experience_fact_versions`、`experience_outputs`、`experience_bullets`、`bullet_fact_links`、`skills`、`experience_skills`、`certifications`、`documents`、`entity_links` 均保留，不删除、不覆盖、不伪造历史。

前向演进将新增 `career_direction_reviews`、`career_tracks`、`career_milestones`、`resume_versions`、`resume_items`、`companies`、`job_positions`、`applications`、`application_events`、`interviews` 及必要的明确关联表。每张公开 schema 业务表有 `user_id`、时间戳、归档字段和 RLS；跨实体关联必须在服务端验证双方属于当前用户。

`experience_fact_versions`、`career_direction_reviews`、`application_events` 均为 append-only。多表状态更新采用受审查的原子 RPC 或事务语义，而非让页面分别写两张表。
