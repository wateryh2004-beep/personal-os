# 目标岗位与岗位详情候选验收

日期：2026-10-19。状态：桌面personalOS工作区本地候选，未推送、未发布。
基线：5aca8905c2baf5568867bb79c1cf45bea8fb2471；分支：feat/career-target-workspace。
范围与规则见[Career信息架构](../career/INFORMATION_ARCHITECTURE.md)、[设计](../design-system.md)、[交互](../design/interaction-clarity.md)、[动效](../design/motion.md)、[质量](../quality-standards.md)。

## 改动

- 保留首页行动和最多三个本人关注，新增全部岗位多词搜索与状态筛选；从列表和近期关注进入岗位详情，URL返回保留条件。
- 详情集中岗位信息、准备状态和题目；完整备注可展开，学习/练习/复盘按岗位传递context。未安排不标逾期；暂停/结束不静默重启。
- 四类岗位任务复用原Server Actions、CareerForm和现有Dialog保护，失败核对指向当前岗位；题库加入可检索超过原前八条的候选。
- 时间使用服务端本人时区，保留原精度，拒绝新输入的夏令时歧义/不存在时刻。关联类型和ID不被编辑表单清空。
- 元信息稳定分页，详情只读取当前岗位的准备字段和题目目录，无整库答案或准备私密正文；读取失败和不存在分开。

## 实际检查

- `env TMPDIR=/private/tmp npm test`：311个文件、2076项通过。首次默认临时目录运行中3项备份恢复因macOS符号链接父路径被安全检查拒绝；指定真实临时路径后两份备份套件16项及全仓重跑均通过，未降低恢复保护。
- `npm run typecheck`：通过；`npm run lint`：通过。
- `npm run build`：通过（Next16.3.8）。首次沙箱构建长时间无输出且期间代码仍在调整，主动停止；最终在允许必要子进程的环境对最终源代码重建成功。
- `node scripts/check-runtime-closure.mjs`：125份trace、26692路径，已知CLI告警链未加载/未追踪。此项不是全依赖安全审计。
- `node scripts/system-standards-audit.mjs --check`：错误门禁通过；仍有6条需人工追踪的名称提示，基线HEAD检查同为6条；不代表全部无障碍已证明。
- CUA操作loopback4193合成预览，使用真实页面/组件，读取与写入均是fixture替身，不连接数据库：多词组合搜索、0结果/清除、详情返回和刷新保留条件、空库与部分读取失败提示；完整备注末尾与唯一h1；岗位编辑Esc、继续、失败保留、放弃及焦点恢复；新建岗位失败保留；搜索第16题并验证加入失败保留选择；新建题目失败和手机返回未保存确认。
- 360/390/768/1440宽度列表与详情未发现横向溢出。390×600短屏表单内部可滚动；输入文字16px、单行字段和主要按钮44px。
- 共用Dialog已有自动化覆盖重复提交、忙碌关闭限制与成功后才关闭；新增表单测试检查关联ID、完整备注、时区字段、失败焦点和核对地址。时区自动化覆盖上海转换、保留秒数、纽约DST空缺与重叠拒绝。

截图和操作预览为合成内容，证据保存在本地聊天工作区outputs：target-library-candidate-desktop.png、target-library-candidate-list.png、target-detail-candidate-desktop.png、target-detail-candidate-mobile.png、target-form-candidate-mobile.png及target-browser-verification.json。可操作预览为本机loopback4193，不是部署链接。

## 限制和运行影响

无真实数据库写入、生产读取或RLS跨账号测试；未验证真实生产RSC保存读回、创建成功跳转、网络性能、物理设备/Safari、200%字体和独立减少动态效果。未因fixture操作失败而声称真实服务失败；fixture失败为主动的恢复路径测试。本轮无独立录屏，动效仅提供可操作预览及既有组件自动化证据，不声称已测量真实流畅度。

无migration、依赖、权限或环境配置变化。发布时按原PR流程核对head与CI；如需回退，可回到基线代码，无需删除数据或回退schema。此记录不授权推送、合并或生产发布。
