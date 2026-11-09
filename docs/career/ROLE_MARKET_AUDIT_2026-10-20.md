# PersonalOS 现有岗位真实性、届次和个人匹配度审计
> 2026-10-20｜审计对象：Interview Lab 92个 `interview_contexts`；只读市场核查，不修改生产业务表。

## 一、结论和证据界限
- 生产数据库共有 **92** 个岗位情境：Active **31**、Paused **53**、Closed **8**。正式 `career_opportunities` **0** 条、`career_applications` **0** 条；92条面试情境全部没有关联机会、申请或职业方向。**Active只能说明启用准备，不能表示已经开放、毕业资格已确认或薪酬达标。**
- **30/31** 个Active记录在标题中仍标注“2028届目标占位”，剩余一条是2027渣打北京实习；“历史岗位真实”不能推出“2028届有对应HC”。现有内容里还混有招聘项目、工作职责条目、行业研究方向、实习和全职目标。
- 针对个人约束采用 **2028年6月硕士毕业、北京全职优先、税前年稳定现金≥35万元的预期、非强销售与非长期极端996、岗位判断与收入增长空间**；2027暑期地点如上海/香港仅按用户逐一授权的具体例外处理。薪酬/实际加班缺数据时标“未知”，不猜测达到也不推定低于。
- 这是对**已有92条记录的证据级别和行动优先级审计**，不是逐家公司HR确认“2028是否招聘”的保证。每行“来源”优先复用该条既有历史材料，并不代表我当天逐一验证了全部92个页面；本次官方独立复核着重于渣打、南方基金、中联、招商银行、建投控股、百度、美团、太古、港交所、万事达、美国银行与中邮投资等代表样本。
- 分类只是下一步是否继续投入时间，**不是对机构或岗位好坏的断言**。已保留状态和原始题库，不进行自动归档。

## 二、分组统计
- A｜明确当前北京实习：1条
- B｜有历史证据的重点职业目标：10条
- C｜产品与技术备选：23条
- C｜历史岗位／适配待核：27条
- C｜咨询备选：8条
- D｜移出当前主列表：21条
- D｜历史或不明确岗位：1条
- A｜明确当前港区实习：1条

## 三、存在但没有在机会表中记录的真实机会
1. **Standard Chartered Global Banking Intern Beijing 2027（Req 59082）**：2027年6月开始，2028年7月全职预期，官网当前截止2026-12-31。已有30题但缺具体机会和投递状态：[官方JD](https://jobs.standardchartered.com/job/Global-Banking-Intern-China-Beijing-2027/59082-en_GB)。
2. **Swire Summer Internship Programme 2027**：与系统已有的2027**全职**SMP是两个项目；2026-12-28至2027-01-31开放申请，实习2027-07-02至2027-08-20，面向2028毕业生；大陆身份安排中国内地项目，**不保证北京**：[官方](https://careers.swire.com/en/careers/swire-summer-internship-programme)。
3. **HKEX 2027 Summer Internship**：2026-10-25截止；毕业时间匹配，需先核GPA≥3.5或等值、连续10周、香港住宿预算及用户是否愿意为香港岗位破例：[官方](https://www.hkexgroup.com/About-HKEX/Careers-at-HKEX/Early-Careers?sc_lang=en)。
4. **Bank of America Global Corporate Banking Summer Analyst 2027 Shanghai（JR-14388）**：2026-11-01截止，用户已明确要求上海申请并在Outlook建日历，但尚未在PersonalOS机会表同步；有客户管理/KYC/融资支持工作，长期职责可能偏对公客户覆盖，非独立纯投研：[官方](https://careers.bankofamerica.com/en-us/students/job-detail/14388/global-corporate-banking-summer-analyst-2027-shanghai-shanghai-china)。
5. **Mastercard Associate Consultant Intern Beijing 2027（R-287578）**：真实，截止2026-10-12，2026-10-20已过期；只保留历史，下年度再核：[官方](https://mastercard.wd1.myworkdayjobs.com/en-US/Campus/job/Associate-Consultant-Intern--Summer-2027---Beijing--China_R-287578)。

## 四、逐项清单：92条
> 状态“active / paused / closed”为当前数据库原值；“建议分组”不代表我已更改状态。保留上下文记录和历史答案，避免删除证据。每个旧招聘链接必须核对是否对应正确届次。

| # | 数据库原名称 | 当前状态 / 准备量 | 建议分组 | 核心核查与判断 | 推荐动作 | 原记录的来源 |
|---:|---|---|---|---|---|---|
| 1 | Standard Chartered · Global Banking Intern China Beijing 2027 · Req 59082 | active / 30题 | A｜明确当前北京实习 | 北京真实 2027 实习 JD，Req 59082；应进入 career_opportunities 而非仅题库。 | 优先推进 | [记录来源](https://jobs.standardchartered.com/job/Global-Banking-Intern-China-Beijing-2027/59082-en_GB) |
| 2 | 南方基金 · REITs研究岗 · 2028届目标占位 | active / 16题 | B｜有历史证据的重点职业目标 | 2027 届真实 REITs 研究（北京），2028 届未发布；专业最接近现有实习。 | 核2028届正式JD | [记录来源](https://aeo.uibe.edu.cn/front/zpxx.jspa?tid=2042138624199229441) |
| 3 | 百度 · 产品经理 · 2028届目标占位 | active / 13题 | C｜产品与技术备选 | 百度 2027 校招确有产品岗，非 2028 职位；与策略产品岗位要去重管理。 | 能力匹配后再启动 | [记录来源](https://talent.baidu.com/jobs/detail/GRADUATE/31e3795e-d5fd-4573-854b-960ab1fcf46a) |
| 4 | 美团 · AI产品经理岗 · 2028届目标占位 | active / 13题 | C｜产品与技术备选 | 美团 2027 校招确有 AI 产品岗；工程、算法和产品指标能力需证明。 | 能力匹配后再启动 | [记录来源](https://zhaopin.meituan.com/web/position/detail?jobUnionId=4697309845&highlightType=campus) |
| 5 | 南方基金 · REITs承做业务岗 · 2028届目标占位 | active / 15题 | B｜有历史证据的重点职业目标 | 2027 届真实 REITs 承做（北京），与研究不同；承揽、加班、岗位内容待查。 | 核2028届正式JD | [记录来源](https://aeo.uibe.edu.cn/front/zpxx.jspa?tid=2042138624199229441) |
| 6 | 中国诚通资产管理有限公司 · 项目管理岗 · 2028届目标占位 | active / 10题 | C｜历史岗位／适配待核 | 来自诚通集团 2026 历史招聘，项目管理职责需确认是项目投资还是行政执行。 | 低投入观察 | [记录来源](https://www.cctgroup.com.cn/cctgroup/2025-10/23/article_2025102313590510322.html) |
| 7 | 中联基金 · 资产管理岗 · 2028届目标占位 | active / 10题 | B｜有历史证据的重点职业目标 | 2026 中联资管有资产运营、财务税务、REITs 存续职责；历史岗位，不等于2028 HC。 | 核2028届正式JD | [记录来源](https://career.cuhk.edu.cn/attachment/careercuhk/ueditor/file/20251106/8199_55_13_%E4%B8%AD%E8%81%94%E5%9F%BA%E9%87%912026%E6%A0%A1%E5%9B%AD%E6%8B%9B%E8%81%98%E5%B2%97%E4%BD%8D%E4%BB%8B%E7%BB%8D.pdf) |
| 8 | 中邮投资 · 投资业务岗 · 2028届目标占位 | active / 10题 | C｜历史岗位／适配待核 | 中邮金融资产投资 2027 校招列投资业务（北京）；非用户的2028届。 | 低投入观察 | [记录来源](https://psbc2027.zhaopin.com/jobs/index.html?id=10138582) |
| 9 | 中邮投资 · 风险合规岗 · 2028届目标占位 | active / 10题 | C｜历史岗位／适配待核 | 中邮金融资产投资 2027 校招列风险合规（北京）；与投资业务必须区分。 | 低投入观察 | [记录来源](https://psbc2027.zhaopin.com/jobs/index.html?id=10138582) |
| 10 | 国新盛康 · 管理培训生（前台方向） · 2028届目标占位 | active / 10题 | B｜有历史证据的重点职业目标 | 国新盛康与国新资产是不同法律主体，2027 招聘记录；不混为一个公司。 | 核2028届正式JD | [记录来源](https://zp.crhc.cn/recportal/recruit_02?title=recruit_02&recruitType=02&recordId=30646438-3733-3334-2D31-3937632D3131&isCanDelete=2) |
| 11 | 国新资产 · 管理培训生（前台方向） · 2028届目标占位 | active / 10题 | B｜有历史证据的重点职业目标 | 国新资产与国新盛康是不同主体，但文案近似；确认实际分工、薪酬。 | 核2028届正式JD | [记录来源](https://zp.crhc.cn/recportal/recruit_02?title=recruit_02&recruitType=02&recordId=30646438-3733-3334-2D31-3937632D3131&isCanDelete=2) |
| 12 | 建投投资／建投华文 · 股权投资岗 · 2028届目标占位 | active / 10题 | C｜历史岗位／适配待核 | 标题把建投投资和建投华文合并为一个岗位，招聘主体需拆开核验。 | 低投入观察 | [记录来源](https://xiaoyuan.zhaopin.com/company/KA0532773725D90000001000?refcode=4440) |
| 13 | 建投控股 · 管理培训生（战略研究方向） · 2028届目标占位 | active / 10题 | B｜有历史证据的重点职业目标 | 建投控股 2026 校招确有战略研究方向；2028未发布，职责可能偏报告。 | 核2028届正式JD | [记录来源](https://career.uibe.edu.cn/front/zpxx.jspa?tid=1982635494562922497) |
| 14 | 建投控股 · 管理培训生（特殊资产投资方向） · 2028届目标占位 | active / 10题 | B｜有历史证据的重点职业目标 | 建投控股 2026 校招确有特殊资产投资方向，北京；更贴近资产判断。 | 核2028届正式JD | [记录来源](https://career.uibe.edu.cn/front/zpxx.jspa?tid=1982635494562922497) |
| 15 | 百度 · 策略产品经理（J100784参考入口） · 2028届目标占位 | active / 10题 | C｜产品与技术备选 | 百度策略产品经理 J100784 有实际 2027 北京 JD，优先于泛产品岗作目标模板。 | 能力匹配后再启动 | [记录来源](https://talent.baidu.com/jobs/detail/GRADUATE/0f336f8e-a440-4ebb-a45a-5554b493e527) |
| 16 | 阿里巴巴 · 产品经理（统招；优先核验高德业务） · 2028届目标占位 | active / 10题 | C｜产品与技术备选 | 阿里统一产品经理不等于确定分到高德；实岗和北京席位须单独确认。 | 能力匹配后再启动 | [记录来源](https://campus-talent.alibaba.com/campus/position/199907700039) |
| 17 | BCG 波士顿咨询 · Associate（大中华区咨询顾问入口） · 2028届目标占位 | active / 12题 | C｜咨询备选 | BCG Associate 是真实职业，但 2028 大中华区校招/北京席位尚非当前明确JD。 | 仅择一赛道准备 | [记录来源](https://careers.bcg.com/global/en/locations/greater-china) |
| 18 | McKinsey 麦肯锡 · Business Analyst（大中华区入口待确认） · 2028届目标占位 | active / 12题 | C｜咨询备选 | McKinsey BA 全职与 BA Intern 不能混用；2028届目前对应实习赛道须核当届。 | 仅择一赛道准备 | [记录来源](https://www.mckinsey.com/careers/search-jobs/jobs/businessanalyst-15136) |
| 19 | 北京诚旸投资有限公司 · 研究岗（投资四部） · 2028届目标占位 | active / 12题 | C｜历史岗位／适配待核 | 诚旸历史 2026 行业/上市公司研究，非 REITs 专项，覆盖行业与建模门槛较高。 | 低投入观察 | [记录来源](https://www.cctgroup.com.cn/cctgroup/2025-10/23/article_2025102313590510322.html) |
| 20 | 中信金资致远企业管理有限公司 · 资产评估岗 · 2028届目标占位 | active / 11题 | B｜有历史证据的重点职业目标 | 中信金资致远资产评估历史岗位；符合资产背景但现金薪酬及工作内容未知。 | 核2028届正式JD | [记录来源](https://www.famc.citic/big5/m/rczp/zpxx/96180.shtml) |
| 21 | 诚通基金管理有限公司 · 投资部主办岗 · 2028届目标占位 | active / 11题 | C｜历史岗位／适配待核 | 诚通基金投资部'主办'历史岗位，需核应届层级是否真适用于2028届。 | 低投入观察 | [记录来源](https://www.cctgroup.com.cn/cctgroup/2025-10/23/article_2025102313590510322.html) |
| 22 | Bain & Company 贝恩 · Associate Consultant（General Consulting） · 2028届目标占位 | active / 10题 | C｜咨询备选 | Bain Associate Consultant 真实职业，未来北京/2028 HC未证，需独立较重Case准备。 | 仅择一赛道准备 | [记录来源](https://www.bain.com/careers/find-a-role/position/?jobid=10397) |
| 23 | Siemens Advanta Consulting 西门子艾闻达 · Associate Management Consultant · 2028届目标占位 | active / 10题 | C｜咨询备选 | 西门子艾闻达咨询真实方向，但2028北京空缺、工作强度及具体咨询业务待核。 | 仅择一赛道准备 | [记录来源](https://jobs.siemens.com.cn/siemens/position/detail?positionId=6a9fde117280da28da0796c2&recruitmentType=CAMPUSRECRUITMENT&currentLang=zh_CN) |
| 24 | 商汤科技 · AI产品经理-大装置（A78046北京参考入口） · 2028届目标占位 | active / 10题 | C｜产品与技术备选 | 商汤 AI 产品经理需要 AI 产品/算法能力证据；2027岗位不代表2028匹配。 | 能力匹配后再启动 | [记录来源](https://hr-jobs.sensetime.com/edu/position/7659345581768935716/detail) |
| 25 | 国新基金 · 投资培训生（投后运营职责条目） · 2028届目标占位 | active / 10题 | C｜历史岗位／适配待核 | 国新基金正式岗位名同为'投资培训生'，括号是本站按职责划分，不是正式部门名。 | 低投入观察 | [记录来源](https://zp.crhc.cn/recportal/recruit_02?title=recruit_02&recruitType=02&recordId=30646438-3733-3334-2D31-3937632D3131&isCanDelete=2) |
| 26 | 国新基金 · 投资培训生（风险管理职责条目） · 2028届目标占位 | active / 10题 | C｜历史岗位／适配待核 | 国新基金另一条同名投资培训生，按不同职责保留题目变式，不重复当两种正式岗位。 | 低投入观察 | [记录来源](https://zp.crhc.cn/recportal/recruit_02?title=recruit_02&recruitType=02&recordId=30646438-3733-3334-2D31-3937632D3131&isCanDelete=2) |
| 27 | 昆仑万维 · AI产品经理（北京参考入口） · 2028届目标占位 | active / 10题 | C｜产品与技术备选 | 昆仑万维链接是第三方牛客页，需核验官网岗位ID和北京校招届次。 | 能力匹配后再启动 | [记录来源](https://www.nowcoder.com/jobs/detail/464800) |
| 28 | 美团 · 商业分析（BA/DS北京参考入口） · 2028届目标占位 | active / 10题 | C｜产品与技术备选 | 美团 BA/DS 有实际北京校招方向，但统计/SQL/实验设计短板明显。 | 能力匹配后再启动 | [记录来源](https://zhaopin.meituan.com/web/position/detail?jobUnionId=4697298860&highlightType=campus) |
| 29 | 银河投资 · 投资业务（北京新苗计划参考入口） · 2028届目标占位 | active / 10题 | C｜历史岗位／适配待核 | 银河投资新苗投资业务属潜在真实入口；主体、细分工作与2028届招聘待验证。 | 低投入观察 | [记录来源](https://ideal.51job.com/galaxy/campus.html) |
| 30 | 招商银行总行 · 管理培训生（投行与金融市场方向） · 2028届目标占位 | active / 16题 | B｜有历史证据的重点职业目标 | 招行总行 2027 真实投行与金融市场方向，北京/沪/深；2028专业、定岗及销售强度未知。 | 核2028届正式JD | [记录来源](https://cmb-recruitment-mobile.paas.cmbchina.com/positionDetail/school?publishId=3EC71792-7F11-4348-9BF5-D80B53BFF061&recruitmentTypeId=96574F8D-C7ED-4772-AE7C-BAC896D190C1) |
| 31 | 招商银行总行 · 管理培训生（授信审批方向） · 2028届目标占位 | active / 15题 | B｜有历史证据的重点职业目标 | 招行总行 2027 授信审批培养方向，北京/沪/深；2028未开放，轮岗不等于即刻审批。 | 核2028届正式JD | [记录来源](https://cmb-recruitment-mobile.paas.cmbchina.com/positionDetail/school?publishId=DB327AB2-185F-4154-AAC1-54695B3992CC&recruitmentTypeId=96574F8D-C7ED-4772-AE7C-BAC896D190C1) |
| 32 | Oliver Wyman 奥纬咨询 · Entry-level Consultant（Shanghai） · 2028届目标占位 | closed / 0题 | D｜移出当前主列表 | 历史职位明确上海、已关闭；不符合北京固定base。 | 保留历史记录 | [记录来源](https://careers.marsh.com/global/en/job/MAMCGLOBALR359609EXTERNALENGLOBAL/oliver-wyman-entry-level-consultant-2027-shanghai) |
| 33 | Siemens Healthineers 西门子医疗 · 商务/财务培训生 · 2028届目标占位 | closed / 0题 | D｜移出当前主列表 | 西门子医疗商财培训偏泛业务，且已关闭；不额外建面试库。 | 保留历史记录 | [记录来源](https://www.siemens-healthineers.cn/careers/finance-trainee) |
| 34 | Unilever 联合利华中国 · UFLP 管理培训生—Consumer & Market Insights 消费者与市场洞察 · 2028届目标占位 | closed / 0题 | D｜移出当前主列表 | 联合利华 CMI 非金融主线，已关闭且地点待核。 | 保留历史记录 | [记录来源](https://wasserman.nyu.edu/jobs/51job-2027-unilever-future-leader-programme/) |
| 35 | 中建电子商务有限责任公司（云筑） · 产品经理管培生（商城） · 2028届目标占位 | closed / 0题 | D｜移出当前主列表 | 云筑商城产品管理非优先金融路径，已关闭。 | 保留历史记录 | [记录来源](https://jdjyw.jlu.edu.cn/portal/recruit/details?id=d7cbcda90ab543f394d5d6794c124334) |
| 36 | 哔哩哔哩 · 增长策略产品经理 · 2028届目标占位 | closed / 0题 | D｜移出当前主列表 | 哔哩哔哩增长产品方向，已关闭，留作为能力参照。 | 保留历史记录 | [记录来源](https://jobs.bilibili.com/campus/positions/30712) |
| 37 | 国金证券资产管理有限公司 · REITs/ABS产品承做岗 · 2028届目标占位 | closed / 0题 | D｜移出当前主列表 | 国金证券资管 REITs/ABS承做历史条目已关闭；保留行业线索，勿当有效招聘。 | 保留历史记录 | [记录来源](https://gjzq.zhiye.com/jobs?queryId=e0a07b62-f4fb-4594-b678-ab815d803dfa) |
| 38 | 汇添富基金管理股份有限公司 · 助理行业分析师 · 2028届目标占位 | closed / 0题 | D｜移出当前主列表 | 汇添富研究职位已关闭，具体行业/北京所在地不明。 | 保留历史记录 | [记录来源](https://career.ecnu.edu.cn/commonpage/JobInfDetail.aspx?oid=1PvEkYIjnoBFdeN+GE0hvQ%3D%3D&sn=2020027841) |
| 39 | 网易有道 · 产品经理（B端SaaS方向） · 2028届目标占位 | closed / 0题 | D｜移出当前主列表 | 网易有道 B端SaaS 产品已关闭，非优先。 | 保留历史记录 | [记录来源](https://job.henu.edu.cn/module/position_brief_detail/id-110123/nid-10822) |
| 40 | Mastercard 万事达卡 · Associate Consultant Intern（北京，2027暑期） · 2028届可用实习·待核实 | paused / 0题 | D｜移出当前主列表 | Mastercard 北京2027顾问实习 Req R-287578 真实，但2026-10-12已截止。 | 保留历史记录 | [记录来源](https://mastercard.wd1.myworkdayjobs.com/en-US/Campus/job/Associate-Consultant-Intern--Summer-2027---Beijing--China_R-287578) |
| 41 | MiniMax · 大模型产品经理-实习-Top Talent · 2028届可用实习·待核实 | paused / 0题 | C｜产品与技术备选 | MiniMax AI 产品实习是真实方向线索；Top Talent 与产品经验要求需逐条核对。 | 能力匹配后再启动 | [记录来源](https://vrfi1sk8a0.jobs.feishu.cn/379481/position/7604792657089366323/detail) |
| 42 | 百川智能 · 【源点顶尖人才计划】AI 产品经理实习生 · 2028届可用实习·待核实 | paused / 0题 | C｜产品与技术备选 | 百川AI PM实习是真实方向线索；技术和Top Talent门槛高，核当前JD。 | 能力匹配后再启动 | [记录来源](https://cq6qe6bvfr6.jobs.feishu.cn/646926/position/7676400571813103881/detail) |
| 43 | Swire Management Programme · Management Trainee 2027 | paused / 20题 | D｜移出当前主列表 | Swire Management Programme 2027是2027年8月全职，不是2027暑期；本人硕士2028毕业，应改看SIP。 | 保留历史记录 | [记录来源](https://careers.swire.com/en/careers/swire-management-programme) |
| 44 | 中国长江三峡集团 · 基石计划 · 2028届条件观察 | paused / 15题 | D｜历史或不明确岗位 | 三峡基石计划的具体北京岗位、专业和是否做核心投资业务有待逐岗核验。 | 不占用备考优先级 | [记录来源](https://www.jcglt.tsinghua.edu.cn/recruit/recruit-7.html) |
| 45 | 中国银行总行 · 管理培训生（金融市场方向） · 2028届目标占位 | paused / 6题 | C｜历史岗位／适配待核 | 中国银行总行2027全职金融市场方向历史岗位，2028届不可现投；可复用知识。 | 低投入观察 | [记录来源](https://www.boc.cn/big5/aboutboc/bi4/202609/t20260903_25689311.html) |
| 46 | 香港交易所 HKEX · Graduate Associate — Business Advancement · 2028届目标占位 | paused / 5题 | D｜移出当前主列表 | HKEX Graduate Associate 2027全职毕业资格截至2027-07，不适用2028硕士；不混暑期。 | 保留历史记录 | [记录来源](https://www.hkexgroup.com/About-HKEX/Careers-at-HKEX/Early-Careers?sc_lang=en) |
| 47 | 腾讯 · 产品策划 · 2028届目标占位 | paused / 4题 | C｜产品与技术备选 | 腾讯产品策划使用招聘通用入口，尚无2028的具体北京JD。 | 能力匹配后再启动 | [记录来源](https://join.qq.com/post.html) |
| 48 | 香港交易所 HKEX · Summer Internship — Data Business / Markets 产品方向 · 2027暑期提前入口 | paused / 4题 | A｜明确当前港区实习 | HKEX 2027 Summer Internship 真实且匹配2028届；2026-10-25截止，须核GPA3.5等值与香港例外。 | 仅香港例外 | [记录来源](https://www.hkexgroup.com/About-HKEX/Careers-at-HKEX/Early-Careers?sc_lang=en) |
| 49 | 字节跳动 · B端产品经理（商业变现方向） · 2028届目标占位 | paused / 3题 | C｜产品与技术备选 | 字节 B 端商业化产品为历史职位，须核当届和北京团队；技术/增长门槛需验证。 | 能力匹配后再启动 | [记录来源](https://jobs.bytedance.com/campus/position/6994772462076561701/detail) |
| 50 | 快手 · 产品经理（产品方向占位） · 2028届目标占位 | paused / 3题 | D｜移出当前主列表 | 快手本记录来源为IR新闻而非岗位详情；不能视作有来源可证的具体PM招聘。 | 保留历史记录 | [记录来源](https://ir.kuaishou.com/zh-hans/news-releases/news-release-details-49) |
| 51 | CapitaLand Investment 凯德投资 · Global Early Career Investment Management Programme · 2028届目标占位 | paused / 2题 | D｜移出当前主列表 | 凯德全球投资培养计划偏跨地安排，北京固定base没有证据。 | 保留历史记录 | [记录来源](https://www.capitaland.com/en/investment/careers/global-early-career-investment-management-programme.html) |
| 52 | 南方基金 · AI产品经理 · 2028届目标占位 | paused / 2题 | D｜移出当前主列表 | 南方基金 2027 AI产品经理 JD地点为深圳，与北京硬约束冲突。 | 保留历史记录 | [记录来源](https://aeo.uibe.edu.cn/front/zpxx.jspa?tid=2042138624199229441) |
| 53 | J.P. Morgan 摩根大通 · China Seasonal Internship Program — Payments · 2027半年实习提前入口 | paused / 0题 | D｜移出当前主列表 | JPM Payments Seasonal Internship 项目入口≠2027北京特定开放JD，须查岗位号和期限。 | 保留历史记录 | [记录来源](https://www.jpmorganchase.com/careers/explore-opportunities/programs/china-apprenticeship) |
| 54 | Kearney 科尔尼 · Business Analyst（General Practice/Campus） · 2028届目标占位 | paused / 0题 | C｜咨询备选 | 科尔尼历史咨询岗位，实际北京地点/2028空缺未证；准备成本高。 | 仅择一赛道准备 | [记录来源](https://career.cuhk.edu.cn/job/view/id/468961) |
| 55 | L.E.K. Consulting 艾意凯 · Associate（中国/上海） · 2028届目标占位 | paused / 0题 | C｜咨询备选 | L.E.K.历史上海岗位，与北京长期地点偏好冲突。 | 仅择一赛道准备 | [记录来源](https://career.cuhk.edu.cn/en/job/view/id/469014) |
| 56 | Procter & Gamble 宝洁中国 · Finance & Accounting 全职管理岗 · 2028届目标占位 | paused / 0题 | D｜移出当前主列表 | 宝洁F&A不是REITs/金融投资主线，且真实北京HC未证。 | 保留历史记录 | [记录来源](https://jdjywpt.jlu.edu.cn/portal/recruit/details?id=ec00649e61ec48f0b9daa7aeddc5c993) |
| 57 | Roland Berger 罗兰贝格 · Junior Consultant 初级咨询顾问 · 2028届目标占位 | paused / 0题 | C｜咨询备选 | 罗兰贝格历史泛职业入口，未证明2028北京新职位。 | 仅择一赛道准备 | [记录来源](https://www.rolandberger.com/en/Locations/Greater-China/Join/Your-Opportunity/Career-Starter/) |
| 58 | 中信银行总行 · 管理培训生 · 2028届目标占位 | paused / 0题 | D｜移出当前主列表 | 中信银行总行管培现实职业，尚无目标届次/最终分配核实。 | 保留历史记录 | [记录来源](https://job.citicbank.com/static/gggs1_209.html) |
| 59 | 中再资产管理股份有限公司 · 行业研究岗（未来实习入口） · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 中再资管行业研究历史岗/实习线索，需核2028实际岗位、北京。 | 低投入观察 | [记录来源](https://aeo.uibe.edu.cn/front/zpxx.jspa?tid=2045035199741296641) |
| 60 | 中国人寿资产管理有限公司 · 行业研究岗 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 国寿资管行业研究历史JD，行业可能非REITs；关注实习/2028是否招。 | 低投入观察 | [记录来源](https://chinalife.zhiye.com/custom/zwxq?hideMenu=1&jobAdId=e0b8674c-660d-43a9-abb3-254542c148b9&activityGuid=&jc=2&ClassificationTwo=%E5%9B%BD%E5%AF%BF%E8%B5%84%E4%BA%A7%E6%80%BB%E5%85%AC%E5%8F%B8&ClassificationOne=%E6%8A%95%E8%B5%84%E7%AE%A1%E7%90%86%E7%B1%BB) |
| 61 | 中国国际金融股份有限公司 · 资产管理部研究岗（J19639） · 2028全职研究目标·待核实 | paused / 0题 | C｜历史岗位／适配待核 | 中金资管部研究岗有历史编号J19639，但当前届次北京 HC 未核。 | 低投入观察 | [记录来源](https://cicc.zhiye.com/custom/campusxq?jc=2&hideMenu=1&jobAdId=1dbdd032-5adb-4701-a07c-9fa6d2c51b3d) |
| 62 | 中国工商银行总行 · 总行管理培训生 · 2028届目标占位 | paused / 0题 | D｜移出当前主列表 | 工行总行管理培训生历史招录，2028届准入和分配待核。 | 保留历史记录 | [记录来源](https://career.nankai.edu.cn/correcruit/content/id/118013.html) |
| 63 | 中建电子商务有限责任公司（云筑） · 产品经理管培生（数科） · 2028届目标占位 | paused / 0题 | C｜产品与技术备选 | 云筑产品经理数科历史JD，非金融投资主线，岗位技术深度待查。 | 能力匹配后再启动 | [记录来源](https://www.career.zju.edu.cn/jyxt/sczp/zpztgl/ckZpgwXq.zf?zpxxbh=5B6E7424BB1218A4E0653A68DD0E9B18) |
| 64 | 中联基金 · REITs研究岗 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 中联基金REITs研究历史岗位确为北京，但内容含研究活动、培训与知识库管理。 | 低投入观察 | [记录来源](https://career.cuhk.edu.cn/attachment/careercuhk/ueditor/file/20251106/8199_55_13_%E4%B8%AD%E8%81%94%E5%9F%BA%E9%87%912026%E6%A0%A1%E5%9B%AD%E6%8B%9B%E8%81%98%E5%B2%97%E4%BD%8D%E4%BB%8B%E7%BB%8D.pdf) |
| 65 | 中联基金 · 不动产金融岗 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 中联基金不动产金融历史JD含客户开发维护、高强度要求；需严筛承揽和工时。 | 低投入观察 | [记录来源](https://career.cuhk.edu.cn/attachment/careercuhk/ueditor/file/20251106/8199_55_13_%E4%B8%AD%E8%81%94%E5%9F%BA%E9%87%912026%E6%A0%A1%E5%9B%AD%E6%8B%9B%E8%81%98%E5%B2%97%E4%BD%8D%E4%BB%8B%E7%BB%8D.pdf) |
| 66 | 京东集团 · JD STAR新星计划－产品方向 · 2028届目标占位 | paused / 0题 | C｜产品与技术备选 | 京东JD STAR产品方向是培养项目不等于北京特定产品岗位。 | 能力匹配后再启动 | [记录来源](https://jdjyw.jlu.edu.cn/portal/jyzp/recruit/details?id=9883a420b4cb4aed99faa46100b306bd) |
| 67 | 京东集团 · TET管理培训生－产品方向 · 2028届目标占位 | paused / 0题 | C｜产品与技术备选 | 京东TET产品方向是培养项目不等于已确认未来团队。 | 能力匹配后再启动 | [记录来源](https://jdjyw.jlu.edu.cn/portal/jyzp/recruit/details?id=9883a420b4cb4aed99faa46100b306bd) |
| 68 | 人保再保险股份有限公司 · 投资研究岗（J78822） · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 人保再保险投资研究（J78822）历史岗位，有真实岗位号，核目标届次/城市。 | 低投入观察 | [记录来源](https://picc.zhiye.com/campus/detail?jobAdId=0897fc41-1b15-440d-9191-27988b69a481) |
| 69 | 北京产权交易所有限公司 · 业务岗位管培生 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 北京产权交易所业务管培历史岗位；业务可能是产权交易服务而非投资岗位。 | 低投入观察 | [记录来源](https://scc.pku.edu.cn/frontpage/pku/html/recruitmentinfoForm.html?positionDetailId=332b88a173bd4d0f9a7fa647b8ec7580) |
| 70 | 北京京国瑞股权投资基金管理有限公司 · 投资助理岗（日常实习入口） · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 北京京国瑞投资助理是日常实习，不代表正式全职HC/转正保证。 | 低投入观察 | [记录来源](https://aeo.uibe.edu.cn/front/zpxx.jspa?tid=1966023520798392321) |
| 71 | 北京博达克咨询有限公司（BDA） · Analyst—Investment Advisory · 2028全职研究目标·待核实 | paused / 0题 | C｜咨询备选 | BDA Investment Advisory 属泛岗位信息页面；真实2028北京招聘未证。 | 仅择一赛道准备 | [记录来源](https://bda.com/Career/cn_index.php) |
| 72 | 北京市国有资产经营有限责任公司 · 投资及股权管理岗（总部暑期实习入口） · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 北京市国有资产经营历史投资股权岗位/实习线索；核在京具体部门。 | 低投入观察 | [记录来源](https://aeo.uibe.edu.cn/front/zpxx.jspa?tid=2049296406295977986) |
| 73 | 北京市国通资产管理有限责任公司 · 不良资产管理与处置岗 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 国通AMC不良资产管理与处置历史岗位，北京，对不动产金融有一定迁移。 | 低投入观察 | [记录来源](https://career.uibe.edu.cn/front/zpxx.jspa?tid=2097531950590902274) |
| 74 | 北京资产管理有限公司 · 对公业务岗 · 2028届目标占位 | paused / 0题 | D｜移出当前主列表 | 北京资产对公业务岗可能偏项目营销/客户拓展，强销售风险待核。 | 保留历史记录 | [记录来源](https://www.bjamc.com.cn/newsInfo_92f8646993014d9bacaf25d5aca78a07.html) |
| 75 | 华夏久盈资产管理有限责任公司 · 另类投资 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 华夏久盈另类投资历史岗位，需核2028北京实际团队和录用要求。 | 低投入观察 | [记录来源](https://career.hebut.edu.cn/home/correcruit/content/id/81114.html) |
| 76 | 嘉实基金管理有限公司 · 策略分析师 · 2028届目标占位 | paused / 0题 | D｜移出当前主列表 | 嘉实基金策略分析师引用通用Join Us页，缺职位ID、当届地点与JD。 | 保留历史记录 | [记录来源](https://www.jsfund.cn/main/AboutHarvest/JoinUs/index.shtml) |
| 77 | 国寿投资保险资产管理有限公司 · 投资支持类 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 国寿投资'投资支持类'过于宽泛，需精确到实际职责和职级。 | 低投入观察 | [记录来源](https://chinalife.zhiye.com/custom/zwxq?hideMenu=1&jobAdId=59f8178e-0bf2-4e1c-b758-b19891caa51b&activityGuid=&jc=2&ClassificationTwo=%E5%9B%BD%E5%AF%BF%E6%8A%95%E8%B5%84%E6%80%BB%E5%85%AC%E5%8F%B8&ClassificationOne=%E6%8A%95%E8%B5%84%E7%AE%A1%E7%90%86%E7%B1%BB) |
| 78 | 天弘基金管理有限公司 · 助理资产配置研究员 · 2028全职研究目标·待核实 | paused / 0题 | C｜历史岗位／适配待核 | 天弘资产配置研究员历史职位，具体覆盖资产、北京岗/2028未证。 | 低投入观察 | [记录来源](https://app.mokahr.com/campus-recruitment/thfund/46219#/job/e16d99c4-ba1a-4a0c-a74d-72c679a24c00) |
| 79 | 小米集团（国际部） · 电商产品经理 · 2028届目标占位 | paused / 0题 | C｜产品与技术备选 | 小米国际部电商PM属于产品/跨境电商支线，与金融主线差距较大。 | 能力匹配后再启动 | [记录来源](https://yibin.cdisu.edu.cn/jyxx/jyxx1/content_3338) |
| 80 | 小红书 · RPT产品培训生—商业产品 · 2028全职研究目标·待核实 | paused / 0题 | C｜产品与技术备选 | 小红书RPT商业产品真实历史校招线索，非当前2028在招。 | 能力匹配后再启动 | [记录来源](https://job.xiaohongshu.com/campus/position/22161) |
| 81 | 小红书 · RPT产品经理培训生—点点产品 · 2028全职研究目标·待核实 | paused / 0题 | C｜产品与技术备选 | 小红书RPT点点产品真实历史校招线索，非当前2028在招。 | 能力匹配后再启动 | [记录来源](https://job.xiaohongshu.com/campus/position/22183) |
| 82 | 度小满 · AI创新产品岗 · 2028全职研究目标·待核实 | paused / 0题 | C｜产品与技术备选 | 度小满AI创新产品是历史岗位线索，需算法与产品成果证据。 | 能力匹配后再启动 | [记录来源](https://duxiaoman.jobs.feishu.cn/051736/position/7673406330568493354/detail) |
| 83 | 度小满 · AI平台产品经理 · 2028全职研究目标·待核实 | paused / 0题 | C｜产品与技术备选 | 度小满AI平台产品经理技术平台要求可能更高，非当然匹配。 | 能力匹配后再启动 | [记录来源](https://duxiaoman.jobs.feishu.cn/051736/position/7673406420741638410/detail) |
| 84 | 建信金融资产投资 · 管理培训生 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 建信金融资产投资AIC管培潜在相关，2028届具体岗位/任职条件待查。 | 低投入观察 | [记录来源](https://job2.ccb.com/cn/job/announcement.html?annoId=20260903102401717133&planType=XY) |
| 85 | 新华资产管理股份有限公司 · 金融产品投资研究岗 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 新华资管金融产品投资研究历史岗位，需核真正研究职责和北京base。 | 低投入观察 | [记录来源](https://aeo.uibe.edu.cn/front/zpxx.jspa?tid=1981258708797161473) |
| 86 | 普洛斯 GLP · 管理培训生（投资方向） · 2028届目标占位 | paused / 0题 | D｜移出当前主列表 | 普洛斯投资管培历史项目是2022年的，未能用来证明2028北京名额。 | 保留历史记录 | [记录来源](https://jdjyw.jlu.edu.cn/portal/recruit/details?id=d5ef8d7e3ba4432e89ea4bbc39b1c6d6) |
| 87 | 泰康资产管理有限责任公司 · 资产配置研究 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 泰康资管资产配置研究历史JD，岗位是否接受非金融专业需核。 | 低投入观察 | [记录来源](https://career.nankai.edu.cn/correcruit/content/id/118595.html) |
| 88 | 滴滴 · 产品助理 · 2028届目标占位 | paused / 0题 | C｜产品与技术备选 | 滴滴产品助理历史线索，无实质金融研究任务保证。 | 能力匹配后再启动 | [记录来源](https://myjob.dlmu.edu.cn/job/view/id/1919402/from_type/4/from_id/867131) |
| 89 | 滴滴 · 商业分析（职类方向，具体岗待发布） · 2028届目标占位 | paused / 0题 | C｜产品与技术备选 | 滴滴商业分析仅职类/具体岗待发布，不能当有精确招聘JD。 | 能力匹配后再启动 | [记录来源](https://ejob.dhu.edu.cn/pros_wjdc/s/cms/DongHua/single/2026/03/05/26030513182980617552) |
| 90 | 网易有道 · 国际广告产品经理 · 2028届目标占位 | paused / 0题 | C｜产品与技术备选 | 网易有道国际广告PM偏商业化营销与海外增长，远离金融主线。 | 能力匹配后再启动 | [记录来源](https://jdjyw.jlu.edu.cn/mportal/recruit/details?id=607a6addf84e405683b7dbba6f36fac3) |
| 91 | 蚂蚁集团 · 产品经理－商业型 · 2028届目标占位 | paused / 0题 | C｜产品与技术备选 | 蚂蚁商业型PM真实业务方向，具体北京2028岗位待核。 | 能力匹配后再启动 | [记录来源](https://www.career.zju.edu.cn/jyxt/sczp/zpztgl/ckZpgwXq.zf?zpxxbh=4A8840A46DF124FCE0653A68DD0E9B18) |
| 92 | 诚通科创私募基金管理（北京）有限公司 · 投后协同部主办 · 2028届目标占位 | paused / 0题 | C｜历史岗位／适配待核 | 诚通科创私募基金投后协同部主办历史岗位，需核应届职级及团队职责。 | 低投入观察 | [记录来源](https://www.cctgroup.com.cn/cctgroup/2025-10/23/article_2025102313590510322.html) |

## 五、最小改造路径
1. **严格分层**：`career_directions` 只保存职业方向；`career_opportunities` 只保存带招聘届次、雇主、具体职位、工作地点、职位ID/官方JD、截止日期和证据核验时间的真实开放机会；`interview_contexts` 只管题目准备，不能再充当岗位存在性证据。历史真实招聘可另设“参考岗位”，不冒充当前机会。
2. **从机会开始**：先把渣打59082、太古2027 SIP、港交所2027 SIP、美国银行JR-14388入机会候选池；真正提交之后再记申请状态。香港/上海须单独标“明确例外”而非放宽全部北京规则。
3. **2028全职职业方向控制规模**：以南方基金REITs研究/承做、招行总行两个方向、中联资管、国新/诚通真实资产投资、建投特殊资产/相关金融机构为候选族群；未有2028实岗时不得标成已开放。Baidu/Meituan科技产品和BCG等咨询作为可选第二支线，各选至多1–2个真实岗位跟踪，不并行维护几十套答案。
4. **合并标签，不删除题库**：国新基金两个同名投资培训生记录改成“单岗位×两职责变式”；百度普通产品与策略岗位区分岗位ID，避免重复通用题；两种建投控股培养方向归入一个招录项目的方向选项；“建投投资／建投华文”混合主体须拆开；快手新闻页、嘉实招聘首页等不足以创建精确岗位机会。
5. **核三个真正不确定的边界**：具体专业学位代码是否接受、稳定税前现金是否满足预期、常态工时及销售KPI。这三项未知时只挂“待核”而不是用AI概率补数字。

## 六、当前引用的公开原始核对点
- [南方基金2027届暑期/2026补招岗位清单，REITs研究与承做均明确北京](https://aeo.uibe.edu.cn/front/zpxx.jspa?tid=2042138624199229441)
- [招商银行2027届校园招聘公告：投行与金融市场培养方向](https://cmb-recruitment-mobile.paas.cmbchina.com/announceDetail/school?noticeId=C0089317-18EE-48D2-867F-B62104AE4139)
- [建投控股2026年历史校招公告：特殊资产、战略研究是明确方向](https://career.uibe.edu.cn/front/zpxx.jspa?tid=1982635494562922497)
- [中联基金校园和岗位介绍](https://www.gsum.cn/campus.html)
- [中国诚通2026校招：集团历史JD不能用来证明2028有开放HC](https://www.cctgroup.com.cn/cctgroup/2025-10/23/article_2025102313590510322.html)
- [百度2027岗位校招列表，说明与2028届资格的差别](https://talent.baidu.com/jobs/list)
- [美团校招岗位页，实际AI产品和BA/DS区别](https://zhaopin.meituan.com/web/campus)
- [太古2027全职SMP](https://careers.swire.com/en/careers/swire-management-programme) 与 [2027暑期SIP](https://careers.swire.com/en/careers/swire-summer-internship-programme) 不能混同。
