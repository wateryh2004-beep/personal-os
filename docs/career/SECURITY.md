# Career 安全与隐私

Career 含履历、投递、面试和证书等敏感数据。所有表启用 RLS 并以 `auth.uid()` 隔离；Server Actions 从会话取得用户，使用 Zod 校验且校验关联对象所有权。普通 CRUD 不使用 service role。

证书编号默认遮罩，联系人、完整 JD、Fact、Note、面试回答和简历正文不进入普通搜索摘要或 Audit。文件保存在现有私有 `private-files` bucket，不生成永久公开 URL。导出默认脱敏证书编号、Token、Signed URL 与敏感联系人信息。
