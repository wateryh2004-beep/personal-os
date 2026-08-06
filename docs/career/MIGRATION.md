# Career Migration

远端项目审计于 2026-08-06 完成：本仓库的 Career Foundation migration 存在，但未在链接的 Supabase 项目迁移历史中出现，生产尚无 Career 相关表。实施顺序是先应用该既有、未修改的 migration，再应用本版本新增的 forward migration；绝不编辑已应用历史 migration。

每次 schema 变更需先审查 SQL、RLS、索引和 append-only 限制，之后在正确 Project Reference 上应用并验证 migration history、RLS 和第二用户隔离。Production 与 Preview migration 状态必须分别确认。
