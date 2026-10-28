# 经验资料库 V1 本地验收

类型：候选验收记录。状态：本地部分通过，未发布。日期：2026-10-28。

## 对象与范围

- 发布候选基线：`a5803dda30457ec3b3b712e80b885a8552353a3d`（本地记录和远端查询一致的 `main`）；仅移植经验资料库相关改动。
- 环境：macOS、本仓本地工作树、合成测试数据。
- 正式 Supabase 只应用并核对了新增 migration；未上传真实私人图片，未调用真实 DeepSeek/Qwen。
- 规范和契约：根 `AGENTS.md`、文档索引、项目治理、Agent 工作规范、产品、设计、交互、动效、架构、工程、数据、安全、AI、质量、性能、发布与备份。

## 实际执行

| 检查 | 命令或操作 | 结果 |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | 通过 |
| 生产构建 | `npm run build -- --webpack` | 通过；基于 main 候选，路由清单包含 `/experience-library`、详情和三个 API |
| 全量测试 | `npm test` | 基于远端 main 候选，367 文件、2,350 测试通过；随后新增的封存文件头行为测试单独通过 2 项 |
| 定向测试 | domain、migration、upload route、UI、query、Files 封存与导航 | 合成测试通过；上传失败重试必须重新 PUT、核验封存后才关联 |
| PostgreSQL 17.11 | 干净数据库重放 main 全部 migration 后应用经验 migration | 通过；使用本机 socket 与合成数据 |
| 正式数据库 | Supabase migration `20261028073144` | 新增四表；RLS 强制启用，匿名 SELECT 与普通用户 DELETE 不可用；安全顾问没有新增经验领域提示 |
| 数据库权限与一致性 | `tests/experience-library-postgres.sql` | owner/匿名 RLS、跨用户引用、密钥列权限、原文不可改写、emoji 选区、5 万字符及重试幂等通过；事务回滚 |
| 备份回归 | `tests/experience-library-backup.test.ts` | 合成系统快照与 Files 原件包恢复，原文、选区关系和原图字节一致 |
| 上传与下载边界 | 6 组定向测试 | 23 项通过，覆盖失败后使用同一 document 重传、封存后关联、文件头伪装拒绝与匿名下载拒绝 |
| 受影响 lint | 经验功能、组件、路由、测试与预览脚本 | 通过 |
| 备份 inventory | PostgreSQL 实际表列与系统快照清单比对 | 一致，无未分类表 |
| 构建闭包与文档 | `node scripts/check-runtime-closure.mjs`、`node scripts/check-project-docs.mjs` | 141 traces / 4,412 paths；116 文档 / 477 本地链接通过 |
| 长文本 | 合成 50,000 字符，正文与评论同次保存 | 字符数、raw 拼接、分段边界与标签通过 |
| 混合剪贴板 | 文字＋图片同时进入 paste 处理 | 文字默认事件未阻止，图片进入队列 |
| 纯图片 | 图片粘贴 | 阻止默认文本插入，生成待保存预览 |
| HTML 链接 | 只有 `<img>` HTML、无文件字节 | 明确提示不冒充原图 |
| 图片失败 | 文字 save 成功、上传准备返回 503 | 页面保留失败图片并明确报告文字已保存，不写媒体关联 |
| 上传边界 | 文件头、扩展名和 MIME 校验、15MB 上限 | owner-scoped pending document；拒绝 SVG/HTML 伪装的图片 |
| 备份分类 | system backup schema 与 migration | 三张持久表纳入，AI 凭据表排除 |
| 格式 | `git diff --check`、schema JSON parse | 通过 |

视觉复核入口由 `node scripts/experience-library-visual-preview.mjs` 生成，使用实际 React 组件和合成内容；当前没有已检查的浏览器截图或完整动效录屏。

## 未执行

- 未在独立 Supabase 验证项目应用 migration；正式项目已应用上述 migration。
- 未注入 R2 测试凭据，未验证真实浏览器 PUT、封存、重新显示和未授权下载。
- 未配置模型 Key，未验证真实 Provider 连接或整理结果。
- 未执行 Playwright 浏览器回归、截图、录屏、减少动态效果和 200% 字体实际检查。
- 合成包恢复不等于生产备份恢复或真实 R2 对象回传。

## 发布状态

本记录只证明本地候选和隔离数据库结果；提交、合并、迁移、部署和正式域名验证按实际完成情况分别记录。
