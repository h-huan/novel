# 唯一进度台账（合并自 SUMMARY-ROUND72.md + r150/PLAN.md + r137/REMAINING-WORK.md）

## 2026-09-27 09:35 第 1 章四次真实生成复核：仍未产出正文

- 数据库 `server/data-from-20260917/novel.db`：项目 `3a9a01f5-9625-4803-a791-336841934e30` 为短篇、番茄；第 1、2 章已保存正文字段长度均为 0。四次真实 `/api/v1/chain/stream-generate` 调用均收到 Gate 422，失败 run 为 `2f7e7fc7`（08:17）、`a76d21f1`（08:59）、`ac7565b7`（09:11）、`0c6fa494`（09:24）、`66708823`（09:34），其中本次接手后的完整调用为后四次；不能声称小说已生成。失败稿保留在 generation_runs/矛盾面板用于诊断，不是已保存章节。
- 实证根因：事实问题超过 4 项时原代码跳过局部修补直走整章重写；审稿器提到“正文与大纲/世界观冲突”曾被误归为资料源冲突而提前停止；整批事实补丁中一条新增 26 等长段或破折号，令其余安全补丁一起回滚。章纲原来的“两次进出各扣一户”与“只剩最后一格”也互相诱导，现经项目大纲 API 将章末说法统一为“两次新增两处空白，末格原本空着”。
- 执行标准种子/镜像升至 v50；正文首稿增加本章可计数事件核对；资料源冲突与正文偏差分流；事实补丁按最多 4 项问题分批，逐条用同一硬红线扫描器验收，最后仍做完整语义与硬红线复检。未降低 severity、未换模型、未绕过 Gate。09:34 最后一轮日志显示 6 条锚定补丁中 4 条因硬红线加重被拒，余下补丁复检事实 5→9，整章修订因篇幅保留率 83% 被故事身份守护回滚，最终 Gate 422；该 failed run 的 gate_status 却为 not_evaluated，埋点口径仍需核对。
- 后端 `npm run typecheck` 退出码 0；`npm test` 为 72 文件/709 项通过；`git diff --check` 退出码 0；改动文件 CRLF 行数相等。`restart.ps1` 退出码 0，后端 3100 与前端 5173 各 1 个 listener，启动日志确认 14 个模块同步 v50。真实正文 E2E 仍失败，不能标记完成。下一步需针对首稿输入过长与故事事实账的生成策略继续收敛，并以实际保存章正文为验收，不应继续盲目重复昂贵调用。
## 2026-09-26 20:20 第 1 章反复 Gate 422 的修订链诊断

- 只读核验最新失败稿 `generation_runs.id=842540a2-e01e-47db-9d47-de9d20e3c465`，正文 5366 字符；首轮语言硬红线 35/35b/42/50 共 4 类，事实差异 2 处。旧流程先做整章重写，复检事实 2→1、硬红线命中窗 42→43，因退化回滚并直接停止，段落级语言修订没有执行。章 1、章 2 的已保存正文仍为 0 字，不能称生成成功。
- 机器执行标准及英文镜像升至 v43：大纲缺失/事实冲突先尝试有唯一原文锚及 20% 改动上限的局部补丁，复检要求事实问题减少且硬红线不增加；无法锚定或未改善才走原整章路径，任何退化仍回滚阻断。规则 50 剥离引号内人物对话并将命中映射回正文；最新失败稿只读回放后 50 误报 1→0，真实叙述动作残句仍阻断。
- 35b 在这份失败稿中报告 33 个失败窗口，但原实现只向局部修订器提供首窗段落；现扫描器汇集全章失败窗口真实段落，修订器在有限预算内分散选取。其余 35 共 5 窗、42 仍命中，尚未用真实模型证明全部 Gate 收敛或正文保存。
- `npm run typecheck` 退出码 0；最终全量 `npm test` 为 72 文件/699 项通过；`git diff --check` 退出码 0；本轮涉及文件 `bareLF=0`。局部事实修订遇到模型网络失败时原样抛错，评审不可用时停止改写，均不转为整章重写。真实模型端到端生成尚未执行，因此不能宣称新流程已经通过 Gate 或正文已经保存。
- `restart.ps1` 完整模式退出码 0，后端 3100/前端 5173 各 1 个监听；HTTP 健康 `ok`、前端 200、两份 err 日志均 0 字节。数据库确认 `body` 执行标准 active v43，项目《拆到最后一户》现存第 1、2 章正文长度仍均为 0。
- 独立运维缺陷：`restart.ps1 -Only front` 会把 `-Only back` 刚启动的后端 PID 从 dev-pids 状态文件读出并清理；本轮已用完整模式恢复两端，但 partial restart 的进程筛选仍需另修。不要把这次端口中断误判为小说 Gate 故障。

## 2026-09-26 19:29 正文章节网络中断诊断与修复

- 《拆到最后一户》第 1 章新失败是传输故障，不是 Gate：`generation_runs` 的 `writing_climax` 在 200310ms 后 `status=failed`、`output_text` 为 null、`gate_status=not_evaluated`；`generation_step_metrics` 记录 `network_error`、输出 0 字、内部重试 2 次。日志先显示空正文耗尽输出预算，关闭思考补发时收到 `UND_ERR_SOCKET`，一次网络重试再次断线。项目仍 active，两章正文总长度 0，故不存在可恢复的半章。
- 机器执行标准及镜像升至 v42。修复网络重试与上一失败物理请求模式不一致的问题：若断线发生在同模型关闭思考的空内容补发，唯一网络重试保留该次思考模式及既有模型、温度、输出预算；扩容重试亦保持该模式。仍失败就记录网络错误、保持正文未保存。`UND_ERR_SOCKET` 提示改为重试当前操作，避免把章节失败误导到仅用于项目创建失败的“看板恢复生成”。
- 当前本机到 `api.deepseek.com:443` TCP 探测通过，DeepSeek 官方状态页当时显示服务正常；二者不能倒推失败时连接关闭的责任方。服务 typecheck 退出码 0；定点 1 文件/15 项、全量 72 文件/693 项通过。未再次调用真实模型产出正文，不能宣称网络稳定或章节 Gate 通过。
- `pwsh -NoProfile -File .\restart.ps1` 退出码 0，后端/前端 3100/5173 各 1 个监听，健康检查 ok、前端 HTTP 200、两个 err 日志均 0 字节；启动日志确认 v41→v42 已同步，数据库 body 标准包含新网络重试条款。旧失败记录保留原错误文案用于审计，新的提示只适用于后续请求。

## 2026-09-26 18:50 第 1 章再次 Gate 422：资料源倒计时前置拦截

- 运行日志证实本轮仅调用 `writing_climax` 首稿 1 次和 `review` 1 次，确定性扫描命中 4 类硬红线后，评审发现 1 处资料源冲突并立即停止修订，最终 422；进程未崩溃。矛盾面板数据库核得该失败稿有 1 条资料源冲突、4 条硬红线、5 条大纲/事实阻断项和 10 条建议项；现有 2 章正文长度均为 0。
- 资料源的 `world_system_profiles.era` 写“两天前启动 72 小时倒计时”，此刻应只剩 24 小时，和主世界设定、章纲的“三天后上午十点起爆”相斥。事务留存完整旧档案快照 `version_history` v2，现存档案改为从现在起 72 小时、三天后上午十点起爆，同时删除“装药完成”这一过早断言；旧失败稿审计记录保留。
- 机器执行标准及英文镜像升至 v41；正文首稿模型调用前执行同一事件倒计时算术校验，冲突直接 422，不再先付费生成后才发现资料源不可能同时满足。评审仍完整执行，所有原有阻断性质量门保持。新增正反单测及执行路径测试，定点 2 文件/62 项、全量 72 文件/691 项通过；服务 typecheck 退出码 0。本次尚未再次运行真实模型生成，因此不能宣称 4 类硬红线与 5 条事实问题已通过或正文已保存。
- 沙箱内首次重启因 Vite/esbuild 无权读取父目录配置而失败（前端端口超时、后端被脚本清理）；同一脚本在可读配置的进程权限下退出码 0，端口 3100/5173 各 1 个监听，健康检查 ok，前端 HTTP 200，两个 err 日志均 0 字节。资料源冲突这 1 条面板记录已附修正理由标记 resolved；旧失败稿其余 9 条 blocking 和 10 条 medium 仍 open。数据库再次核验 2 章正文总长度 0。

## 2026-09-26 14:45 第 1 章再次 Gate 422 的根因与修复

- 实际日志：首轮评审后确定性硬红线 5 项；整章事实修订后的复检增至 8 项，并引入七层×三户写二十格、明列多户有名却说只剩一格、未落实一次回拨一小时等问题。自适应修订因 `no_measurable_progress` 停止；这不是后端进程崩溃，是真实 422 质量阻断。`generation_runs` 最近失败记录 1 条，现有两章正文长度均为 0。
- 资料源核验：项目仅 1 条现存 `world_settings`，却有 3 条 `world_system_profiles`；其中 2 条是指向不存在主记录的孤儿档案，仍可能被按项目 `LIMIT 1` 的读路径取到。现存档案简介称“三年前同一雨夜”，规则称“每次回拨一小时”，规则/超自然字段又称未归档私人物证会消失，与已确认的私人礼簿、全家福保留相冲突。数据库事务留 4 条 `version_history` 快照，移除 2 条孤儿档案，统一现存档案三字段及主记录前提，主记录版本 2→3。旧失败稿及历史验收记录保留审计。
- 机器执行标准与英文镜像升至 v40：资料源互相冲突必须先修源并阻断，不再以 high 非阻断挂面板；整章事实修订须经复检证实事实问题减少且硬红线不新增/不加重，否则回滚旧稿。正文/评审上下文读取世界档案不再静默返回空；三个按项目读取档案的路径改为只关联现存主记录。定点 3 文件/74 项通过，完整后端测试 71 文件/686 项通过，typecheck 退出码 0。尚未真实重新生成正文，不能宣称 Gate 通过。
- 世界观删除流程已改为同一事务删除关联档案，并补 1 项防孤儿档案测试；已修资料源的旧面板记录标成 resolved，历史证据仍保留。最终全量后端测试 71 文件/687 项通过、typecheck 退出码 0、`git diff --check` 退出码 0，本轮 11 个代码/文档文件 bareLF=0。
- `restart.ps1` 退出码 0；3100/5173 各 1 个 listener，健康检查 ok、前端 HTTP 200、错误日志各 0 字节，启动日志确认 14 个模块 v39→v40。第 1 章面板当前 19 条记录，其中未解决 blocking 13 条、已解决资料源 1 条；这些仍是失败稿的历史验收，不代表新代码已生成合格正文。
- 最后又将“项目没有世界观主记录”改为明确阻断，避免空世界观静默进入写作；新增 1 项定点测试。最终代码的后端全量测试为 71 文件/688 项通过，typecheck 退出码 0。再次执行 `restart.ps1` 退出码 0，3100/5173 各 1 listener；健康检查 ok、前端 HTTP 200、错误日志各 0 字节。面板旧失败稿仍有 19 条历史记录、13 条未解决阻断项，尚未真实重生成。

## 2026-09-26 第 1 章新一轮正文 Gate 422 与矛盾面板复核

- 13:45–13:51 的真实生成：首稿验收后硬红线 7 条，局部补丁 6 处使规则数 7→6；复检发现白名单外“李成”等事实问题并触发整章修订。随后硬红线仍 6 条；第二轮 6 个补丁消掉等长段却新增破折号密度硬线，规则数 6→6 被回滚，Gate 422 未保存。只读数据库核验本项目 chapters=2、正文总长度=0。矛盾面板另有 6 条中等级建议，其中起爆时间口径和台账核对顺序属于事实/章纲冲突，不应留在建议。
- 机器执行标准 v39 与英文镜像统一：事实问题从首次验收阻断；有追问与权责对抗的对话不因缺少语气词被规则42误判；局部精修可以分批严格减少命中窗，但不得用新硬线交换旧硬线，保存仍须全部清零。英文镜像中一条旧的“硬红线先于大纲事实修复”已删除，现与机器标准及执行器一致。
- 验收器对评审器的 advisories 再核事实：人物白名单、倒计时、名单数量与大纲事件顺序冲突改进 blocking；纯重复措辞仍单独记录。局部精修每条规则先分配证据锚，再把余量给多处残句/密度和连续对话中部；扫描器提供 35/35b 等规则的真实命中窗数量，复检只接受没有新规则且所有同规则命中不增加、总命中严格下降的补丁。规则42新增“追问+权责对抗”正例和登记式问答反例测试。
- 本书世界观 `world_settings` 一处未归档物证规则与章纲冲突，已将 rules/constraints/special_settings 三字段同步到“身份痕迹可空、私人礼簿和全家福实物保留”；记录 version 1→2，`version_history` 留原行快照 1 条。后端 `npm run typecheck` 退出码 0，`npm test` 70 文件/681 项通过。尚未在 v39 下再次调用真实 DeepSeek，不能宣称正文已生成或 Gate 已通过。
- 实时矛盾面板接口检查发现 persisted `hardline.outline_alignment` 没进查询类别：数据库 6 条 blocking 硬线在面板被隐藏。已将冲突列表、统计、清理及自动处理的类别 SQL 收敛到一份判据，并给返回行加 blocking 标志；桌面列表与详情显示“阻断保存”。最终后端 typecheck 退出码 0、71 文件/682 项测试通过；桌面 typecheck 退出码 0、9 文件/82 项通过。
- 复测又发现列表把 33 条 `superseded` 旧记录混入，造成列表 48 条而统计 15 条；列表默认只查 open/resolved。定点测试 1/1 通过，最终服务重启退出码 0，3100/5173 各 1 listener、健康检查 ok、前端 HTTP 200、错误日志均 0 字节；实时接口第 1 章列出 15 条，其中 blocking 6 条，与统计 total=15/p0Pending=6 一致。未再次调用真实 DeepSeek；这 6 条仍是失败稿的待修问题，不能宣称正文已保存。

## 2026-09-26 正文混合 Gate 修复顺序与标点修复口径

- 用户实测《拆到最后一户》第一章再次被 Gate 422 阻断：破折号密度、35、35b、42 四条语言硬红线，加上第二次进门后二楼住户未变空及“林川”同格既刻名又空白两类大纲/事实冲突。只读数据库核验最近一次局部精修仅返回 2 个补丁，全文硬红线计数 4→4 被回滚；当前 2 章正文总长度仍为 0，未把失败生成算作完成。
- 机器执行标准升至 v38，英文镜像同步：大纲事件/事实与语言硬红线并存时先修事件和事实，再重新验收、局部修硬红线；破折号过密时禁止为满足标点窗口继续堆破折号。正文执行器按此顺序分流；段落级精修约束要求本批每条规则得到足以清除的补丁、密度问题修至阈值以下，预算不足必须空补丁并由 Gate 阻断。
- 扫描器对破折号密度提供全部真实命中坐标；35/35b 与密度并存时给出不增破折号的明确修复口径。新增混合 Gate 先后顺序、全局密度坐标与局部补丁契约回归测试。后端 `npm run typecheck` 退出码 0，`npm test` 69 文件/673 项通过；9 个本轮改动文件 bare LF=0，`git diff --check` 退出码 0。
- `pwsh -NoProfile -File .\restart.ps1` 退出码 0，3100/5173 各 1 个 listener；健康检查 `ok`，后端/桌面错误日志各 0 字节，启动日志确认 14 个模块的机器标准 v37→v38。重启后只读数据库核验本项目 status=active、chapters=2、正文总长度 0、generation_runs failed=4/success=49。尚未重新调用 DeepSeek 生成正文，真实性能与成稿 Gate 仍待下一次实际生成核验。

## 2026-09-26 第 1 章正文硬红线阻断修复

- 《拆到最后一户》项目已激活，但数据库有 2 个正文空壳，正文总长度 0。最近失败链为 `refinement` 结构化输出扩至 32768 仍截断，随后 `review` 记录正文硬红线，Gate 422 拒绝保存；没有把空正文报成完成。
- 机器执行标准升至 v37，英文镜像同步。规则 32 删除「段首是姓名且段长≤12」误报判据，只在整段仅姓名/称谓及句末标点时命中；姓名起句的动作/判断句不再判为“姓名独占”。真实均长三段及其它有证据的硬红线仍阻断。
- 段落级精修改为每轮只发送最多 6 个唯一、逐字可锚的命中段，不再附整章正文和整份规则说明；修复结果仍经全文扫描、故事身份守护与严格减少命中数验证，失败仍不保存。后端 typecheck 退出码 0，完整单测 69 文件/670 项通过；定点 56/56 通过。尚未再次调用 DeepSeek 生成本章正文。
- 最终 `pwsh -NoProfile -File .\restart.ps1` 退出码 0，3100/5173 各 1 个 listener；健康检查 ok，后端与桌面当前错误日志均 0 字节。启动日志确认 body 等 12 个模块的标准从 v36→v37 确定性同步。

## 2026-09-26 失败项目重新生成实时进度

- 重写入口改为先启动后台恢复再立即进入 `/generation-progress/:projectId`；页面订阅项目 SSE，显示真实百分比、当前阶段、执行记录，以及完成/失败结果。失败终止事件后等待恢复审计确认，不把尚未恢复完的资料误报为可用。项目列表和书内入口在恢复运行时显示“查看进度”，离开页面后仍可返回同一任务。
- 桌面端 typecheck 退出码 0、9 文件/82 项测试通过；后端 typecheck 退出码 0、68 文件/668 项测试通过。定点测试覆盖启动接口立即返回、重复启动阻断、进度/完成/失败显示。尚未调用真实 DeepSeek 重写；需要实际恢复成功才能验证模型生成和质量门的最终结果。
- `pwsh -NoProfile -File .\restart.ps1` 最终退出码 0；3100/5173 各 1 个 listener，两个错误日志均 0 字节。读接口显示《拆到最后一户》仍为 `generation_failed`、`running=false`、`canResume=true`；前端页面与进度模块 HTTP 均为 200。未点击生产环境的“重新生成”。

## 2026-09-26 失败项目列表状态与直接重试

- 用户明确要求失败项目不能与正常项目混淆，接受最低方案为置灰并提供“重新生成”按钮。项目列表将 `generation_failed` 卡片改为灰色虚线、明确标注“生成失败 · 不可写作”，显示直接重试和删除入口。重试调用现有快照恢复接口，列表与书内入口共用同一客户端函数；失败时卡片显示简短诊断入口，不在卡片堆长报错。未自动删除失败项目或发起真实 DeepSeek 恢复。
- 运行页只读核验：4 个项目中 3 个失败卡片均显示置灰状态及“重新生成”按钮，另 1 个正常项目无此按钮。桌面端 `npm run typecheck` 退出码 0，定点 2/2、全量 8 文件/78 项通过；5 个本轮改动文件 bare LF=0，`git diff --check` 退出码 0。`restart.ps1` 退出码 0，3100/5173 各 1 listener；重启后页面再次显示相同 3/1 状态。未点击“重新生成”，未调用模型。

## 2026-09-26 章纲事实台账前移

- 同一跨模块事实规则在机器执行标准升至 v36，英文镜像同步；新生成的详细章纲写入后，按章序每 4 章核对数量初值、历史变化、逐次变化及时间规则，前批台账必须传递且不得丢项。短篇在角色/伏笔前阻断，长篇综合链在激活前阻断；审查失败记 failed run，短篇激活前的终局 Gate 仍复查全部模块。长篇现有综合链没有在角色生成前落库章纲，无法宣称长篇已实现早期阻断。
- 已完成 server typecheck 退出码 0，完整单测 67 文件/666 项通过，6 个本轮修改文件 bare LF=0，`git diff --check` 退出码 0；最终 `restart.ps1` 退出码 0，3100/5173 各 1 listener，后端/桌面当前错误日志均 0 行，首次 v36 重启日志确认各模块 v35→v36 同步。本轮尚未实际调用 DeepSeek 验证一整部新书，当前失败项目也未恢复或激活；恢复生成 POST 仍受此前自动审批限制。

## 2026-09-26 跨模块一致性失败实测

- 项目 `3a9a01f5-9625-4803-a791-336841934e30`《拆到最后一户》：`status=generation_failed`；正文 2 条空壳、正文总长度 0；跨阶段质量问题 4 条；此前项目的 `generation_runs status=failed` 为 0，最终 Gate 失败漏记。
- 已确认本书时间规则为“每次倒退一小时”，已同步 `projects.idea_seed/confirmed_idea` 1 条。两章 `outlines.content` 曾被截断到 534/504 字符并以省略号结尾，已从对应 `generation_runs.output_text` 恢复至 1934/1722 字符；仍未证明小说生成成功。
- 执行标准 seed 升至 v35；修订改为原文唯一锚点局部替换，不再以审查摘要覆盖全字段；同数矛盾不提前终止第二次修订；题材卡与创建入口对互斥时间说法提前阻断；项目级跨模块 Gate 失败写入 failed run。`QUALITY_EXECUTION.md` 同步。
- `server`：`npm run typecheck` 退出码 0；`npm test` 66 files / 663 tests passed；新增定点 5 tests passed；修改文件 bare LF 均为 0，`git diff --check` 退出码 0。`pwsh -NoProfile -File .\restart.ps1` 退出码 0，3100/5173 各 1 listener；标准 v34→v35 已在启动日志确定性同步。
- 失败当轮日志另有网络断连 1 次并重试成功、结构化输出截断扩容 2 次、章纲结构校验重试 1 次、JSON 语法修复 1 次；当前重启后的 backend.err/desktop.err 均为 0 行。恢复生成 POST 被自动审批拒绝：需要明确授权向 DeepSeek 发送该项目资料并承担本次模型调用费用；审批结果待用户回复，未绕过、未执行恢复生成。

> 2026-09-23 接手复验更新（第 194 轮为下文保留的历史快照）。**本文件是唯一进度台账**：最新状态见第 7 节；任何"还没做/做到了什么"只在这里记一次。
> 旧的 SUMMARY-ROUND72.md、archive/rounds-scratch/r150/PLAN.md、archive/rounds-scratch/r137/REMAINING-WORK.md 已删除，
> 内容（含历史教训）全部并入本文件，防止同一件事散在四份里对不上。

## 0. 用户授权与硬约束（最高优先级）

原话：
> 可以，全部做，旧代码和旧的流程是防止以后还出现一样问题（多份的都要清理），执行标准内容要始终保存最新。
> 记住最终目标，高可用的爆款小说 ai 写作平台（长短篇）。

- **最终目标**：高可用的爆款小说 AI 写作平台，**长篇与短篇都支持**。
- **不降级**（全否决）：advisory、降 severity、降模型、静默兜底、`deferQualityGate` 式绕过。
- **顺序铁律**：先调执行标准 → 统一口径 → 再改代码 → 复测。
- **旧代码要删，防复发注释要留**：删除冗余实现，但把"为什么曾经出错"的注释留在原地。
- 不 commit、不建分支。
- 汇报三件套：**改了哪个文件（文件+行号） + 可自跑命令 + 结果数字**；没做就说没做。

## 1. 唯一事实源（谁是谁的唯一来源）

| 领域 | 唯一来源 | 说明 |
| --- | --- | --- |
| 可执行质量规则（机器权威） | `server/src/modules/module-standards/module-standards.seed.ts` | 启动 ensureSeeded 确定性覆盖；当前 `SEED_BASELINE_VERSION=50` |
| 执行标准全量镜像（英文） | `QUALITY_EXECUTION.md` | 修订顺序：seed（机器）→ 本文件 → 桌面端 `/module-standards` |
| 六维执行标准定义 | `server/shared/src/execution-standard-dimensions.ts` | platform / category / tone / style / genre / pov，**只有这一份** |
| 平台枚举 | `server/shared/src/enums/platform.ts`（`PLATFORM_REGISTRY`） | 旧 `platform-style.ts` 已删除（曾有 7/10/12 三个平台表） |
| 平台分类树 | `server/shared/src/platform-categories.ts` | 8 个平台分类树；实测指标表当前只有 fanqie。与全局题材 taxonomy 是【映射】不是重复（`globalCategory` + `GLOBAL_STORY_CATEGORIES` 只有这一份） |
| 平台爆款基准 | `server/src/chain/platform-benchmarks.ts` | 节奏/受众/文本基准/分发阈值四类，禁止在他处再硬编码第二套数值 |
| 文风宽松关键词 | `server/shared/src/execution-standard-dimensions.ts`（`STYLE_PUNCTUATION_RELAX_KEYWORDS`） | hardline-scanner 与 platform-benchmarks 共用；第 180 轮删掉 platform-benchmarks 内联的第二份，并加守卫 spec |
| 字典标签（视角/文风/基调） | 同上三个 shared 常量 → `story_dict` 种子 | 运行时以字典为准（用户可增删）；常量只是种子初始值，不是白名单 |
| 分类体量判据 | `server/shared/src/category-word-scale.ts` | `categoryWordScaleStanding` / `categoryWordScaleBlocked` |
| 数据目录解析 | `server/src/config/data-dir.ts`（`resolveDataDir()`） | 旧写法 6 处 `process.env.DATA_DIR \|\| cwd/data` 已全部收敛（现存 15 处调用） |
| 测试数据隔离 | `server/vitest.setup.ts` | 测试进程 DATA_DIR 钉到 os.tmpdir()，绝不写进仓库 |
| 章节字数区间 | `server/shared/src/types/story-length.ts`（`CHAPTER_WORD_RANGE`） | prompt/守卫/文案全部插值该常量 |
| Gate 失败分类 | `server/src/modules/writing-quality/gate-failure.ts`（`classifyGateFailure`） | 唯一分类器（旧日志里"一律报本章大纲一致性"是修复前历史） |
| 模型路由/场景名 | `server/src/routing/scenario-taxonomy.ts` | `MODEL_TABS` 与 `STANDARD_ALIASES` 值域不同，**不是重复项**，勿合并 |

## 2. 历史快照：第 194 轮实测状态（命令 + 数字）

- `cd server; npx tsc --noEmit` → **EXIT=0**
- `cd server; npm test` → **63 files / 625 tests passed**（190 轮为 62/621；第 192–194 轮 +章节分工判据唯一化 +短篇故事卡三处同源 spec）
- `cd server; npm run test:acceptance` → **15 files / 35 tests passed**
- `cd desktop; npx tsc --noEmit` → **EXIT=0**；`cd desktop; npx vitest run` → **4 files / 65 tests passed**（本轮未动桌面端，沿用）
- 第 194 轮新增 spec 定点复跑：`node --no-warnings node_modules/vitest/vitest.mjs run src/chain/short-story-card-criteria.spec.ts` → **4 passed**
- 平台旧列收窄后定点复跑：`creative-constitution / project.service / chain.controller.helpers / state-item.service` → **4 files / 100 tests passed**
- `pwsh -NoProfile -File .\restart.ps1`（第 194 轮实测）→ 后端 3100 单 listener（PID 20824）、前端 5173 单 listener（PID 34020，dev.js 父进程 11820）；清理阶段杀 3 个残留进程，断言项目进程 7 父 / 10 含子孙、无残留；后端干净构建 13.1s
- 健康检查 `GET http://127.0.0.1:3100/api/v1/health` → `{"status":"ok",...}`；前端 `GET /` → 200
- `Test-Path server/data` → **False**（死副本已清除）；`Test-Path .appdata/server-data` → **False**
- 日志：`logs/backend.out.log` 第 190 轮重启后实测 **0 ERROR / 1 WARN / `database is locked` 0 次**，且 `字典标准同步 v21` + 各模块 `标准基线代码升级 v20→v21` 已确定性落库。

## 3. 已完成（有证据）

- [x] 分类体量判据守卫化：`server/src/modules/project/category-word-scale.spec.ts`（11 例）
- [x] 项目创建提交字段不再手写第二份清单：`desktop/src/renderer/stores/projectStore.ts`
      （真 bug：旧逐字段清单**漏发 `categoryWordScaleDeviation`** → 作者填了却没过闸门）
- [x] 前端不再有第二套"平台"规则：`ProjectListPage.tsx`（删 `platformStandardProblem` 调用）
- [x] 全项目创建只走 `toExecutionStandardsPayload`：`ProjectStandardsPage.tsx`
- [x] 运行时导入纪律：`server/src/runtime-import-hygiene.spec.ts`
      （历史事故：`require('@novel/shared')` → Node 24 拒绝剥离 node_modules 下 .ts → 后端启动即崩）
- [x] 六维事实源统一、平台枚举唯一化（`platform-style.ts` 已删）
- [x] 数据目录唯一来源 + 测试不写仓库（`data-dir.ts` + `vitest.setup.ts`）
- [x] 死代码 `refineToPlatformBenchmark` 函数体已删，仅留教训注释（`chain.controller.ts:1857-1875`）
- [x] `refinement` 片段精修按"片段"计量：`refinement.controller.ts:114 evaluationUnit: 'segment'`
      （**注意**：不是加 `deferQualityGate` —— 那是降级，已否决）
- [x] **`deferQualityGate` 作用域已核实并写明（第 190 轮）**：它只表示「本次调用不跑**散文**创作宪法 Gate」；
      唯一消费者 `real-llm.service.ts:261`（且仅对 world/character/outline/chapter/refinement 生效）。全仓 8 个 `true` 调用点
      全部是**非散文**载荷：结构化 JSON 大纲/故事卡/审查计划/实体抽取（`chain.controller.ts:4214-4216,6015-6020,6061-6068,6141-6147,6913-6920,9855-9862`）、
      精修补丁 JSON（`:1533-1538`）、章节扩写中间轮（`:861-862`，成品章仍由章节验收 Gate 把关）。
      **红线不变：不得为绕开质量门而新增 `deferQualityGate`。**
- [x] `.appdata/server-data`、`server/data`、`data-from-20260917/app.db` 死副本清除
- [x] W1.3 前端**内联硬编码**副本已删净：`POV_FALLBACK` 现为 `desktop/src/renderer/lib/executionStandards.ts:62` 由 shared `NARRATIVE_POV_SEED_LABELS` **派生**（注释 :59-61 记录历史内联写法），非第二份事实源。第 190 轮核实：仓内 5 处命中全部是这条派生链的引用，不存在重复清单。
- [x] 台账合并为一份（本文件）
- [x] **`platform_style` 旧列收窄（第 180 轮）**：删净 7 处运行时死读 ——
      `writing-quality.service.ts:777,1205`、`outline.service.ts:532`、`state-item.service.ts:349`、
      `chain.controller.ts:1421,2012,7854`、`generation-metrics.service.ts:570-571,587`；
      导出投影改 `target_platform`（`export-engine.service.ts:172`）。
      口径：只允许①写入投影（与 `target_platform` 同值，防旧导出包读到 `fantasy` 脏值）
      ②读取时作【末位历史别名补空】。唯一判据 = `readConstitution().targetPlatform`。
      防复发断言：`creative-constitution.spec.ts` 的 legacy 别名边界 3 例；`project.service.spec.ts`
      与 `chain.controller.helpers.spec.ts` 里的脏值 fixture 已改成真实可能状态。
- [x] **文风宽松关键词唯一来源（第 180 轮）**：`platform-benchmarks.ts` 内联的
      `(白描|朴素|现实|日常|群像叙事)` 删除，改为从 shared `STYLE_PUNCTUATION_RELAX_KEYWORDS` 派生
      （`platform-benchmarks.ts:401-406,437`）；新增守卫
      `server/src/modules/project/style-relax-keywords-single-source.spec.ts`（任何代码行再拼第二张表即红）。
      `resolveNovelStrategy` 里其余节奏信号词袋（含 无敌流/系统流/战神/升级 等非字典词）**故意宽于字典**，
      已在 `platform-benchmarks.ts:426-430` 注明不是重复项、勿合并。
- [x] W4 注释与行为已一致：`repair-strategy-registry.ts:29-33,40-44` 明确 ratio 是【硬改动预算上限】，
      与 `local-repair.ts:16` 的硬抛错一致（原文"只作为偏好而非硬闸门"已不存在，全仓 0 命中）
- [x] **本章大纲一致性 Gate 反复误报的根因已定位并修复（第 190 轮）**：`chain.controller.ts:1134`
      原把【评审器调用失败】原文包上「本章大纲一致性审查调用失败」前缀 → 作者看到的是「大纲不一致」，改大纲/改文风当然无效。
      现改为 `章节验收评审调用失败（评审器故障，不是正文缺陷）：${message}`。
- [x] **大纲前提缺失与评审器故障分流（第 190 轮）**：新增唯一标记
      `gate-failure.ts:75 OUTLINE_PRECONDITION_MARKER=本章详细大纲不足以作为正文验收依据`；`chain.controller.ts:1103` 用它作 `fail([...])`；
      `gate-failure.ts:144-145` 判 `outlinePreconditionOnly` → 归 `outline_alignment`（:177 状态 422、:182 retryable=false），不再与「评审器故障」共用 503；真故障才 503，文案 `gate-failure.ts:209`。
- [x] **AI 痕迹判定去重复（第 190 轮，非降级）**：`module-standards.seed.ts:349` 收窄 —— LLM 只补判确定性扫描覆盖不到的
      (a) 升华式段尾、(c) 空洞反思段；(b)(d) 归唯一清单 `hardline-scanner.ts:47-63 LANGUAGE_HARDLINE_RULE_IDS`，评审不得重复判定同一处。
- [x] **`generation_runs.gate_status` 长期停默认值的成因已收口（第 190 轮）**：INSERT 不带该列、只吃列默认值
      `server/src/database/migrations/001_initial.ts:473 DEFAULT not_evaluated`（全仓唯一：`schema-reconciler.ts` 无该列）；
      未被 `saveRunScore` 打分的 run 就长期是默认值 + NULL payload。**不靠改默认值兜底。**

## 4. 未完成（按优先级，附文件+行号与验证方式）

### W3（最高）长短篇端到端仍未跑通（最新短篇 B2 实测见第 7 节）
- [ ] 长篇端到端：上次跑 `c01a0205` 是 **217,116ms 失败**，outlines/chapters/characters/world 全 0，
      被 Gate 阻断（`constitution.category`、`constitution.logic`、`platform.category_word_scale`、`logic.timeline_conflict`）。
      该项目**本来就该被阻断**（体量 12 万落在番茄男频·都市日常 46.2万–718.97万 之外，真实未达标准）。
- [ ] **短篇端到端已实跑三次但均未通过**（`projectType=short_story`；HTTP 422，见第 7 节）。短篇若走"未知即从严"会按长篇口径阻断，
      本次 B2 的创作宪法已传 `projectType=short_story`；其它入口仍需逐一验证。后续仍需**独立采集番茄短故事分类体量**（真实取数，非降级）。

### W4 修复被自己的约束否掉（重复流程的一种）
- [x] 比例已按策略分级：`repair-strategy-registry.ts:7-15`（voice 0.15 / scene 0.4 / platform 0.2 / local 0.3 / hardline 0.6）
- [x] **注释与行为不一致 → 已一致（第 180 轮核实）**：`repair-strategy-registry.ts:29-33,40-44` 已把 ratio
      写成【硬改动预算上限】，与 `local-repair.ts:16` 的硬抛错同一口径；"偏好而非硬闸门"措辞全仓 0 命中。
      行为未改（仍是硬闸门），改的是措辞 —— 不是降级。
      验证：`rg -n "局部修复范围超过" logs/` → 9/23 无命中（最后一次 9/22 23:08）

### W5 性能 / 减少重复流程（用户问题 1+2）
- [ ] 结构化批量超预算 → 整批作废重来：`llm-tunables.ts:50-51`（32768 上限仍被截断），
      日志实证 `请减小单次结构化批量`。**修法是减小单次批量，不是加 token。**
- [ ] 串行叠加基线：outline avg 76.6s/max 302s、character_design avg 81.3s、idea_generate 61.2s
- [ ] "第一遍少 1000 字、第二遍少 200 字"式重复扩容 → 争取少次内按需补足
- [ ] `generation_runs` 里同一件事反复跑（project 阶段 66 次 success + daily 42 次）
- [ ] **判死机制真相（第 190 轮）**：网络重试分支判死不是 token 硬顶，而是共享计数器
      `truncationExpansions >= MAX_TRUNCATION_EXPANSIONS`（或 `nextExpandedMaxTokens()===null`）
      —— `real-llm.service.ts:719-751`。这解释为何 `refinement` 行 `internal_retries=0`、
      `outline` 行 `internal_retries=1` 仍被判截断。另有「硬顶+零字输出 → `callWithoutThinking` 补发」通道。

### W6 文笔优化（用户问题 4）
- [ ] 标点符号规范、自然度、代入感、**过度换行**
- [ ] 可参考年度爆款做法，但**必须按创建前设定的平台 + 标签执行**（执行标准是前提，不是参考）

### F 分类级阈值缺失（不得伪造）
- [ ] `platform-quality-rules.ts:48,121,122` 用平台级 `avgParaChars`/`longParaRatio`；
      `PLATFORM_CATEGORY_METRICS` **只有 fanqie 且只有字数**，没有分类级段落/对话阈值
      → 除番茄外"按平台分类执行"只能如实写"未核验"；要真正执行需补各平台分类树实测。

### 平台覆盖
- [ ] 分类树 8 个平台，除 fanqie 外全部 `verified:'modeled'`；除番茄外指标口径未核验。

### 模型选择
- [x] 用户已明确暂不把 outline / writing 换成 `deepseek-v4-pro`；保持现有配置。

## 5. 防复发教训（保留，勿删）

1. **平台知识曾散在三处**（`novel-strategy.ts` 节奏画像 / `novel-strategy.service.ts` 复制且未接线 /
   `chain.controller.buildPlatformStyleDirective` 只覆盖 6 平台文案）→ 合并到 `platform-benchmarks.ts`。
   平台类型曾有 7/10/12 三个版本 → 唯一来源 `enums/platform.ts`。**禁止再写第二套。**
2. **`nest start --watch` / vite 是三层进程结构**，父 CLI 命令行是相对路径 → 只按绝对路径匹配会漏杀，
   于是"端口莫名被占 / 两个后端 / database is locked"。修法见 `restart.ps1` 四层防御。
   `database is locked` 最后一次实测为 9/22 12:03，之后 **0 次**。
3. **测试进程不加载 .env** → DATA_DIR 未定义 → 曾 6 处各自回落到 `server/data` 并写出真实数据文件
   （"刚清掉的旧目录又长出来"）。现两道防线：`data-dir.ts` + `vitest.setup.ts`。
4. **精修不带上下文**：历史上真空精修把都市文整章覆盖成另一部小说 → 必须带【上一版原文 + 本章大纲契约 + 人物白名单】+ 身份守护。
5. **`require('@novel/shared')` 会崩**（Node 24 拒绝剥离 node_modules 下 .ts）→ 运行时只用相对路径 `'../../../shared/src'`。
6. **数据库旧列只是投影**：`target_platform` / `platform_style` / `writing_style` 不许再当第二事实源。

## 6. 红线（已否决，勿重犯）

- 不加 `deferQualityGate`；不改 `chain.controller.ts:3499` per-paragraph-polish；不改 `missingDimensionJudgePrompt`。
- `parseStageScore` 中 `missing` 先于 `applicable`；`STYLE_INTENSITY_AXES` 是另一概念，勿动。
- 交叉维同名（悬疑/甜宠/虐恋，story_subcategory vs tone_tag）**保留双维**。
- 旧"基调/文风/流派/视角"就是六维中的四项，**不删**；`targetAudience` 是频道提示，**不是第六维**。
- `scenario-taxonomy.ts` 的 `MODEL_TABS` vs `STANDARD_ALIASES` 不是重复项，勿合并。
- H 补丁在位勿动：`chain.types.ts:51 evaluationUnit?`；`real-llm.service.ts:397,413`；
  `writing-quality.service.ts:1559 evaluationUnit:'segment'`；`refinement.controller.ts:114`。
- 勿回退 `server/shared/src/execution-standard-dimensions.ts`（种子标签、STYLE_GUIDES、TONE_GUIDES）及其消费者。

## 7. 2026-09-23 接手复验：最新事实与未完成项

### 交接历史并入本台账

- 临时 `pending-195.md` 记录：第 195 轮声称同步 seed v24、删 writing-quality 第二份平台名、清理两个失败项目，当时后端 63 文件 / 625 测试；第 197 轮声称修复 outline-consistency 前缀误报、seed v25、后端 63 文件 / 629 测试。这些是历史记录，当前测试通过不能逐项证明当时的过程。
- `HANDOFF-20260923.md` 记录第 204 轮扫描器 35b 坐标修复、54 条定点测试及 63 文件 / 640 测试；接手时实测这两个数字均成立。第 198–203 轮没有可核验的逐轮记录，本台账不补造。
- 第 194 轮状态见第 2 节，只作历史快照；以下数据库与端到端结果优先于旧结论。

### 现行代码与数据库（命令均从指定目录运行）

- 仓库根 `git status --porcelain`：HEAD `42db9e7`；接手前 129 个已跟踪改动（含 1 个删除）及 33 个未跟踪文件。未提交、未推送。
- `server` 目录 `npm run typecheck`：EXIT=0；`npm test`：63 文件 / 643 通过；`npm run test:acceptance`：15 文件 / 35 通过。`desktop` 目录 `npx tsc --noEmit`：EXIT=0；`npx vitest run`：4 文件 / 65 通过。以上测试证明代码局部行为，不等于生产端到端成功。
- `server/data-from-20260917/novel.db`（只读 SQLite 查询）：1 个项目、3 个章节、142 条 `generation_runs`，其中 `status=failed` 6 条。B2 项目 `bcfd17de-bd0e-412f-a2ec-29278a153dc4` 的 3 章 `length(content)` 均为 0，`word_count` 均为 0；小说尚未产出。
- `restart.ps1` 最新重启验收：3100 listener=1（后端 PID 3496），5173 listener=1（前端 PID 6548），后端健康检查通过。此 PID 是当次快照，后续应重新查端口。

### 本次改动与实跑

- 平台 id/显示名/可选性仍以 `server/shared/src/enums/platform.ts` 的 `PLATFORM_REGISTRY` 为唯一来源。共享 `PLATFORM_OPTIONS` 从该注册表派生，前端 `executionStandards.ts` 只重导出；参考作品库删除自写的 `Platform` union 和 `PLATFORM_NAMES`，从作品实际覆盖范围列出出处。`platform-benchmarks.ts` 保留各平台独立质量画像，它是基准数据，不是另一份可选平台清单。新增注册表与画像覆盖/名称一致性测试。
- `scenario-taxonomy.ts` 的执行标准路由现在将显式 `daily + body_*` 映射到 `writing` 标准，不改显式 daily 的模型选择。`real-llm.service.ts` 的提示注入与 `generation-metrics.service.ts` 的快照共用这一路由。修复前 B2 正文 run 的标准快照为 `available=false, modules=0`；修复后生产 run 为 `available=true`，包含 `quality_loop/body/continuation/originality` 4 个模块。
- `chain.controller.ts` 三个正文入口此前默认 `daily`，使作者配置的 `writing` 模型在默认流程不生效；现在默认 `writing`，显式场景仍保持用户指定值。当前 normal 模式未配置 `writing:normal`，会按现有路由明确继承 `daily:normal=deepseek-flash`，因此这项修复本身不改变模型质量。修复后 `typecheck` EXIT=0、后端 63 文件 / 643 测试、验收 15 文件 / 35 测试；尚未在新默认路由下重新跑 B2。
- 混合“确定性硬红线 + 大纲冲突”现在先尝试段落级硬红线修复，再重新评审；两类问题都仍阻断保存。第三次实跑确实进入 `refinement`，但模型补丁使命中数 2→3，守卫丢弃补丁。离线枚举该次 7 个补丁的 128 种组合，最低仍为 2 处命中。
- B2 `POST /api/v1/chain/generate` 同一章节三次：HTTP 422 / 461.2 秒、HTTP 422 / 275.0 秒、HTTP 422 / 288.9 秒，合计 1025.1 秒；3 次均未写入章节正文。第三次残留真实规则 35、42 与第十站停靠情节自相矛盾。35b 坐标伪原文未按旧形式复现，但“422 消失”未通过。
- 数据库按三次请求窗口统计 `generation_runs`：第 1 次 10 条（daily 5/review 4/refinement 1）、第 2 次 6 条（daily 3/review 3）、第 3 次 5 条（daily 2/review 2/refinement 1）；分别累计记录模型耗时 461/275/289 秒。重复生成与评审的成本已量化，原因需继续按链路拆解。
- 临时 `pending-195.md` 的已知内容已并入本节后删除；Temp 中 `t197/t202/t203/t204/t205*.cjs` 共删除 45 个，匹配文件剩余 0。清理没有涉及仓库源码或数据库。
- 质量门与模型未降级：未改阻断严重度、未启用 advisory、未切换 `deepseek-flash`。第三次 B2 中局部补丁未改善被回滚，是预期的严格行为。

### 仍需完成

- **最高优先级**：让 B2 按全部硬红线与大纲一致性通过，确认章节 `content` 长度 > 0，随后用另一短篇和长篇样本验收；三次 B2 不能证明长篇可用。现有模型对具体证据的局部修复无有效候选，继续原样重试会增加模型耗时与费用。
- **平台分类覆盖**：分类唯一源仍是 `server/shared/src/platform-categories.ts`。番茄以外的分类树主要是 modeled，分类级段落/对话指标尚未实测；不能宣称全平台分类爆款文已实现。
- **性能/自优化**：`quality_gate`、`quality_local_repair`、`chapter_responsibility_repair` 重复触发原因尚未查明；策略学习与自动归纳代码存在，但尚无跨作品、长短篇的生产质量提升证据。
- **模型选择已明确**：用户要求暂不切换 `deepseek-v4-pro`；`outline:normal` 与 `writing:normal` 仍是独立场景。`module_standard_versions.seedBase` 标注是否统一尚未处理。未擅改模型。

## 8. 2026-09-23 截图问题复核与修正

- 全局 `/module-standards` 是工作流规则，项目 `/project/:id/standards` 是本书六维创作设定；两者曾都叫“执行标准”，造成重复标准的误读。导航先改为“系统创作规则”和“本书创作设定”，9/24 又把前者明确为“系统工作流规则”；后端仍按本书六维设定执行全局工作流规则。没有新建第二套标准。
- 灵感发现曾把基调、文风、流派混在 `selectedTones`，创建项目时还把 AI 推荐值排在用户选择前；现三个维度独立保存，请求携带六维设定，后端缺任一项即 422，候选题材必须原样继承，创建项目继续使用用户选择。旧版混合草稿迁移时清空歧义值，要求重新选择。
- 灵感发现页面移除“采集日期/样本/中位数”等长段内部取证文字；分类和流派选项取自 shared 的同一平台分类来源。番茄长篇已采样分类的流派显示对应官方头部标签；短篇不套用长篇榜单标签，改为明确显示“暂无已核验的平台标签”及作者流派选项。基调、文风、视角不是平台官方标签，仍是作者设定，进入生成和验收。
- `PLATFORM_CATEGORY_WRITING_PROFILES` 增加 `measureUnit='long_novel'`，灵感、项目卡片、生成提示和质量评审都按项目长短篇取数据；分类字数证据也按 `PLATFORM_CATEGORY_METRICS.measureUnit` 过滤，短篇不再引用长篇区间。这里的样本只覆盖番茄长篇部分分类；其它平台及番茄短篇分类标签仍缺实测数据，不能宣称全部标签已与平台对齐。
- 复测：server `npm run typecheck`、desktop `npm run typecheck` 均 EXIT=0；server `npm test` 63 文件/646 通过，`npm run test:acceptance` 15 文件/35 通过，desktop `npm test` 5 文件/67 通过。`restart.ps1` 干净构建并重启，3100/5173 各 1 个 listener、健康与前端 HTTP 200。运行中 `/api/v1/chain/idea-discover` 缺视角请求 HTTP 422，返回“发现灵感缺少执行设定：视角”。
- 重启后只读查库仍为 1 项目、3 章且正文 `length(content)` 全为 0；`generation_runs` 共 142 条，其中 failed 6 条。B2 小说产出、跨平台分类实测与长期自优化的生产效果仍未验收。未切换模型，未提交或推送。

## 9. 2026-09-24 六维选择与平台名称核对

- 无需切换 `deepseek-v4-pro` 才能修复字段错位或质量 Gate 的 422；保持用户指定的现有模型配置。
- 六维的选择方式明确为：目标平台单选、故事分类单选（平台有两级时级联）、故事基调多选、文风多选、流派/题材标签多选、叙事视角单选。灵感发现与书内设定共用 `MultiSelectDropdown`，已选值始终可见；两个页面按这六维相对顺序呈现。目标字数与目标读者仍是附加字段，不冒充六维。
- 官网核对发现“规则怪谈”是作品题材标签，不是可投稿平台。`PLATFORM_REGISTRY` 将旧 `rules_horror` 标为不可选，仅保留旧 ID 供历史读取；删除其伪平台分类树；shared 的 `platformStandardProblem` 成为前后端唯一有效性判据，直连灵感接口选此值返回 422，不能静默套用伪平台画像。
- 番茄分类树来自长篇榜单，短篇/短故事的投稿分类名称尚未单独核验。`platformCategoryTreeVerification` 按成稿单元返回 `unit_unverified`，前端有简短提示，书内标准也记录来源限制。其它平台分类树仍是建模数据；这些名称不能声称与各平台后台完全相同。
- 两个入口名称调整为“系统工作流规则”（全局模块流程）与“本书创作设定”（单书六维值），IdeaLab 创建前表单也统一后者。两者关系是规则读取项目设定，不是两套互相覆盖的标准。
- 本轮复测：server/desktop `npm run typecheck` 均 EXIT=0，desktop `npm test` 5 文件/68 通过，server `npm test` 63 文件/647 通过、`npm run test:acceptance` 15 文件/35 通过。浏览器实测双选基调保留 2 项，平台候选不再有规则怪谈，番茄短篇显示“短故事投稿分类尚未核验”。`restart.ps1` 干净构建并重启，3100/5173 各 1 个 listener、健康与前端 HTTP 200；运行中灵感接口传 `platform=rules_horror` 返回 HTTP 422。只读数据库仍是 1 项目、3 章正文长度均为 0、failed run 6 条。生产 B2 生成尚未重新运行，不能据此宣称小说已产出。

## 10. 2026-09-24 平台字段叫法纠偏

- 六维相对顺序统一不等于已按所有平台的官方投稿字段命名。番茄官网可核实“分类”和“作品标签”；基调、文风、视角是本系统的作者创作设定，不能冒称平台字段。其它平台分类树仍为 `modeled`，番茄短故事分类为 `unit_unverified`，不能声称这些名称已与投稿后台逐项一致。
- `server/shared/src/platform-categories.ts` 新增唯一的创建字段展示名判据；灵感发现与书内创作设定共用。已核验的番茄长篇分类显示“分类”，有该分类实测标签时显示“作品标签”；其余显示“参考分类（待核验）”“创作流派（作者设定）”。数据值与六维执行判据未改。
- 复测：server/desktop `npm run typecheck` 均 EXIT=0；desktop `npm test` 5 文件/68 通过；server `npm test` 首次在受限环境加载配置遇 `Access is denied`，完整读取权限下重跑 63 文件/647 通过；改动文件 LF=CRLF，`git diff --check` EXIT=0。首次受限重启时 Vite 同因配置读取权限失败；完整读取权限下重启成功，3100/5173 各 1 个 listener。尚未完成其它平台后台字段逐项核验及生产小说生成验收。

## 11. 2026-09-24 投稿字段与创作维度冲突

- 用户要求创建界面按各平台真实投稿字段显示，并移除核验说明。两个入口已移除“短故事投稿分类尚未核验”等操作区说明、采样和判据长文；后端核验状态与硬门未改。未核验分类的可见字段名缩成“题材分类”，不把内部核验过程写在表单上。
- 尚需决定旧“六维均为项目卡片必填”规则是否由“仅平台真实投稿字段必填”替代。当前前后端仍强制六维，若直接隐藏基调/文风/视角会导致创建 422；绝不能隐藏控件后静默补值或绕过质量门。已向用户询问这一规则变更；未收到明确答复前不改创建判据。
- 公开资料已核实：番茄有“分类”“作品标签”，晋江作品页有“文章类型”“内容标签”“作品视角”；其它平台作者后台字段尚未逐项实测。此次仅移除 UI 说明性段落，server/desktop typecheck 均 EXIT=0，desktop 5 文件/68 测试通过，改动文件 LF=CRLF。完整重启后 3100/5173 各 1 个 listener、HTTP 200。

## 12. 2026-09-24 投稿字段执行口径修正与当前事实

- 用户已明确采用各平台实际投稿字段，旧第 9–11 节“六维一律必填/六维均显示”的结论已过时。创建入口只要求平台、分类及已识别的投稿标签；历史项目显式填写的基调、文风、流派、叙事视角仍进入生成与质量门，不得丢弃或降级。前后端从 shared 的 `platformSubmissionDimensions` 派生必填项，质量报告也按实际执行维度计覆盖。
- 番茄长篇公开榜单的分类/标签样本仍可选；番茄短篇以及其它未核实的投稿分类不再混用长篇或全局字典，改为作者填写平台后台分类原名；保存后按原值执行，不伪称已核验后台选项。灵感发现和书内表单均已改。切换长短篇清空旧分类、频道和标签。
- UI 删去核验状态、采样说明和平台规则页的六维长段解释；书内入口为“本书创作设定”，全局入口为“系统工作流规则”。`deepseek-v4-pro` 未启用或改动。
- 实跑：server/desktop `npm run typecheck` 均 EXIT=0；server `npm test` 63 文件/648 通过，`npm run test:acceptance` 15 文件/35 通过；desktop `npm test` 5 文件/68 通过。重启后 3100/5173 各 1 listener，后端健康通过。浏览器核对番茄短篇为手填分类、长篇有分类选项、未见基调/文风/叙事视角和核验说明；灵感接口缺作品标签返回 HTTP 422。
- 只读数据库仍是 1 项目、3 章，3 章 `length(content)` 全为 0，failed run 6 条。本轮没有重跑 B2 正文，因此不能称小说已生成。番茄长篇名单来自公开榜单，不是作者后台完整投稿选项；其它平台完整后台字段仍缺直接证据，不能称平台标签已全部核对完成。要完成这一步须取得各平台作者后台当前创建作品页面及长短篇选项。

## 13. 2026-09-24 灵感分类下拉与工作流页面

- 灵感发现和书内设定对未核实分类共用 `CategoryReferencePicker`：可以展开参考品类，也能填写后台实际分类。番茄短篇参考项是番茄作家专区当前短故事活动列出的 14 个热门品类，明确不是后台完整投稿分类；不混入长篇 37 项。其它有 modeled 树的平台按 shared 中各自建模数据给参考项，仍可手填，不能声称已核实。无来源的平台只可手填。
- 工作流页仍只读 `/module-standards` 的当前 active 数据，没有另起一套规则。数据库核实 active 14 行/14 个唯一 module_key，seed 基线均为 v27，历史版本无高于当前 active 的记录；内存标准缓存已加载。前端与项目内导航的 `/module-standards` 是同一页面；项目内“本书创作设定”是书本参数，不是第二份全局工作流规则。
- 页面展示改为创作主线、横切保障、质量闭环三组，默认折叠模块；展开按目标、步骤、硬性要求、规则纪律、质量门槛单列排版。未改规则正文和 Gate。
- 实测：server/desktop `npm run typecheck` 均 EXIT=0；server `npm test` 63 文件/648 通过；desktop `npm test` 5 文件/68 通过。浏览器 850px/560px 视口无水平溢出；番茄短篇 14 个参考项、未混入长篇专属项，选择“女性成长”后输入值同步；起点 modeled 参考项 21 个。

## 14. 2026-09-24 创作设定与投稿标签拆分

- 用户纠正旧口径：六维创作设定仍须显示并执行；平台投稿分类及作品标签另行展示。`webNovelGenre` 继续承载创作流派，新增 `submissionTags` 承载投稿标签、`plotTags` 承载情节取向、`genreFitNote` 承载未命中公开采样标签时的分类契合依据。番茄长篇要求作品标签；其它平台后台清单和番茄必选标签数量尚未核验，不得称候选完整。
- 灵感发现及本书创作设定均显示分类、基调、文风、创作流派、投稿标签、情节取向、视角；投稿标签可展开公开候选并填写后台实际值。四项新增值经过请求 DTO、创作宪法持久化和执行标准进入生成与质量门；未命中采样时至少 10 字契合依据，生成与项目创建前阻断缺项，评审仍需核验内容兑现。平台标签与创作流派不再共用一份数组。
- 系统工作流规则按条折叠，展开仍展示数据库 active 原文；seed 基线 v29 修正了“规则怪谈是平台”和“未知平台通用兜底”的旧文案。既有模块业务版本号与 seed 基线版本号是不同计数，不可混称。
- 本轮初始状态实测：HEAD 仍 `42db9e7`；服务器 typecheck EXIT=0、63 文件/648 单测通过；数据库 1 项目、3 章节正文长度均 0、142 generation_runs 其中 failed=6，小说仍未生成。后续改动后 server 63 文件/649 单测、15 文件/35 验收测试、desktop 5 文件/68 单测通过；最终重启和页面复核结果以本节后续补记为准。
- 追加页面复核：运行中系统工作流规则的正文生成模块显示 21 条默认折叠的规则；灵感发现番茄长篇的都市日常分类显示独立创作流派、作品标签、情节取向等下拉，作品标签展开可见 6 个公开样本候选及手填入口。旧短篇项目的分类已有历史值时，参考品类曾被该值过滤到 0 项；现点击展开直接显示全部 14 个番茄短故事活动参考项，输入时才筛选，页面实测 14 项可见。14 项并非投稿后台完整名单。
- 复测数值：server typecheck EXIT=0、63 文件/649 单测通过、15 文件/35 验收测试通过；desktop typecheck EXIT=0、5 文件/68 单测通过。沙箱内首次重启的 Vite 因读取目录被拒绝而失败，改为授权执行 `pwsh -File .\restart.ps1` 后退出码 0、3100 和 5173 各 1 个 listener、后端健康检查通过。追加分类控件修复后 desktop typecheck 再次 EXIT=0，Vite 页面热更新复核通过。
- 重启后数据库再次只读核查：projects=1、chapters=3，正文长度 `[0,0,0]`；generation_runs=142、failed=6。B2 正文产出仍未验收，不能称小说已生成；当前旧短篇项目分类 `都市·现实/都市日常` 也不是已核验的番茄短故事后台选项，保存前应由用户按后台真实分类核定。未提交或推送。

## 15. 2026-09-24 创作字典与题材设定继承

- 顶部新增“创作字典”入口；灵感发现、本书创作设定的基调/文风/流派/情节取向/视角统一读取 `story_dict`。情节取向由 shared 候选同步为 `plot_tag`（seed v23），取消创作流派和情节取向在下拉里只加入本次选择的自由输入；投稿标签仍按唯一平台分类资料给候选并允许填写后台实际值，不冒充全局创作字典。
- 创作维度留空时，题材发现从当前数据库字典中选择明确值并校验候选；已选值必须原样继承。同批自动组合不可重复。目标平台必选，分类留空时只从所选平台和长短篇对应的唯一分类事实源组合；参考/建模分类的核验状态不变，不能冒充官方投稿分类。自定义平台无分类候选时需作者填写分类。
- 2026-09-24：全局项目列表、灵感发现、创作字典不再因缓存的旧项目显示书内侧栏；项目路由仍显示。创作字典首页增加分类、情绪氛围、文风、流派、作品标签、情节取向与视角的用途对照。平台必选，前端移除短故事必须预选分类的阻断，后端删除空平台自动番茄并从所选平台的分类候选组合。server typecheck=0、unit 63 文件/654 项通过、acceptance 15 文件/35 项通过；desktop typecheck=0、unit 6 文件/70 项通过。`restart.ps1` 已重启，3100/5173 各 1 listener；浏览器实测全局 3 页无书内侧栏、书内页有侧栏，字典说明可见。此轮未发起真实模型题材生成或 B2 小说生成。
- 每张返回的题材卡显示平台、分类、情绪氛围、文风、流派、作品标签、情节取向和视角；创建项目从所选卡继承留空维度补出的值，创建前后端仍按完整创作宪法硬阻断。项目首页同时显示八组设定标签。
- “故事基调”改名为“情绪氛围”。从新候选移走爽文、权谋、无敌、逆袭、刀人、女强等非情绪项，情节取向补入打脸回报、人物牺牲、女性成长；旧书可能保存这些基调词，操作定义继续保留用于既有作品，不静默更改旧项目设定。
- 真实模型验收：向本地 `/api/v1/chain/idea-discover` 发送长篇、平台/分类/创作维度留空、count=1，请求成功返回 1 张题材卡，番茄 `男频·悬疑脑洞`，基调/文风/流派/投稿标签/情节各 2 项，视角 1 项。尚未以该卡创建新项目，也未生成正文；标签存在不等于已证明内容语义吻合。
- 最终复测：server typecheck EXIT=0、63 文件/653 单测、15 文件/35 验收测试通过；desktop typecheck EXIT=0、6 文件/69 单测通过，新增题材卡设定继承测试。重启脚本 EXIT=0，3100/5173 各 1 listener。只读数据库确认字典 seed v23：情绪氛围 10 项、情节取向 17 项；项目仍 1 个、3 章正文长度仍 `[0,0,0]`。浏览器实测字典页 10 项情绪氛围、项目首页显示平台名称和八组设定标签。未以新卡创建小说、未验收正文，不能称小说已生成。

## 16. 2026-09-25 创建顺序、失败诊断与灵感卡状态

- 实查 2026-09-24 22:27 的项目“代驾听你说完”：题材卡 `storyType=long_novel`、项目 `type=long_novel`、目标 90 万字，运行失败是长篇地基质量门阻断，具体为日记体没有成为叙事单元、单女主/情感拉扯没有具名关系事件。不能将它解释成“短篇报成长篇”。当前数据库 2 项目，有正文的章节数 0，failed generation run 7 条。
- 执行标准基线 v33 明确“创作宪法→确认题材→主线与结局骨架→世界规则→核心角色与关系→分卷及详细章纲→组织/地点→伏笔→时间线→正文”，世界观输入改为题材卡与主线骨架。长篇地基实际一次模型调用产生故事骨架和世界规则，进度不再同时标记“世界观/大纲”；通过后才进入角色、详细章纲、伏笔。短篇显示其实际世界观→章纲→角色资料顺序。心跳只更新真实活动阶段。
- 长篇地基提示词 v1.0.1 要求文风、关系标签、情节取向落到具体叙事单元与具名人物行动；现实题材不得套用穿越与修炼字段。质量门没有降级；真实模型重跑尚未进行，此修复效果不能声称已通过。
- 前后端创建入口均阻断长短篇题材卡错配。题材卡显示长短篇；返回已创建的题材卡时，通过确认题材定位原项目，显示创建/失败状态并进入原项目，避免再次创建。共享创建来源补入 `idea_discovery`，项目列表统一显示“灵感发现”。
- 验证：server typecheck EXIT=0、63 文件/655 单测通过、15 文件/35 验收测试通过；desktop typecheck EXIT=0、6 文件/71 单测通过。`restart.ps1` EXIT=0，3100 和 5173 各 1 listener，后端健康检查通过；浏览器项目列表实见 1 个长篇失败项目（0 字）和 1 个短篇项目（0 字）。页面没有保留旧题材卡，本次没有重新调用付费模型生成或验证正文。

## 17. 2026-09-25 短篇选择后显示长篇旧结果

- 日志事实：18:17 的发现请求是 `type=long_novel platform=fanqie count=5`，18:19 返回 5 个合格长篇；用户随后截图显示配置页已选择短篇。后端按请求的长篇参数生成并通过类型校验；前端的问题是配置改动后旧结果未立即失效，且异步响应回来时未核对当前选择。不能用“数据库里的项目本来是长篇”解释当前页面显示错配。
- 修复：请求参数锁定点击时的配置快照；响应必须与该快照及当前配置一致，且整批题材长短篇与平台一致才写入。切换长短篇/平台立即清空旧题材和旧排除记录；其它创作维度改变时清除过期结果。跨页面实例用请求序号阻止旧异步请求覆盖新请求。已选字段仍由服务端原样校验，只有未选创作维度按字典组合；平台仍须明确选择。
- 验证：desktop `npm run typecheck` EXIT=0、`npm test` 6 文件/74 项通过；`restart.ps1` EXIT=0，3100/5173 各 1 listener，浏览器复核短篇配置和服务器在线。未重新调用真实模型；异步错配通过回归测试验证，尚无新一轮真实题材卡页面验收。

## 18. 2026-09-25 创建阶段顺序与网络断连

- 现场核查项目“我把声音借给你”（short_story）：`world_settings=1`、`outlines=0`、章节正文 `0`；SSE 事件依次为世界观完成、大纲开始、outline 报 `UND_ERR_SOCKET`。这不是世界观和大纲并发。原页面把两个阶段合写为“故事骨架与世界规则”，且错误事件把所有非 pending 阶段标为失败，误报已完成的世界观。
- 短篇页面拆清世界观与大纲标签；进度改由 SSE 单路按事件顺序回放，已完成阶段不受旧 running 事件覆盖；失败只标当前运行阶段，服务端错误事件携带 step。`UND_ERR_SOCKET` 改为连接被关闭的具体诊断，不凭单次断连要求切模型或设置代理。
- 长篇旧链确实只有一次模型调用，同时索要主线骨架与世界观，不符合 v33 执行标准顺序。现为同一条严格顺序链的两次模型调用：主线与结局骨架按 outline 质量阶段验收，检查分卷章数可承载目标字数后，世界规则按 world_building 质量阶段生成，并显式引用已验收骨架；失败时不执行下游节点。随后仍为角色→详细章纲。旧合并提示词已删除并留防复发注释。
- 当前恢复入口会清理未保护的生成资料后按原配置重新生成；它不是“从失败阶段续跑”。这会重复消耗模型调用，且本次没有对真实 DeepSeek 再发起付费生成，所以不能声称网络问题根治或小说已产出。
- 复测：server/desktop `npm run typecheck` EXIT=0；server `npm test` 64 文件/657 项通过；desktop `npm test` 7 文件/76 项通过；server `npm run test:acceptance` 15 文件/35 项通过。新增测试覆盖严格顺序、骨架失败不启动世界规则，以及大纲失败时保留已完成世界观状态。最终调整后 server typecheck 和相关定向单测/验收均 EXIT=0。首次沙箱重启时进程未持续运行；正常权限下最终 `restart.ps1` EXIT=0、3100/5173 各 1 listener，浏览器能加载灵感发现页。
- 对原失败项目“我把声音借给你”执行了两次真实恢复。第一次世界观成功、大纲规划及前两章详细大纲成功，第3章详细大纲在 32768 tokens 硬顶截断；遥测 `step_key=creation_chapter_detail`、`prompt_chars=16574`，前两章输出 3482/4128 字。项目恢复服务还原原有资料，返回 409。对单章（已是最小批量）的截断增加同模型、同提示词、同 JSON 合同的一次关闭思考故障补发；新增定向测试，server typecheck EXIT=0、结构化输出单测 13/13 通过，重启后端/前端各 1 listener。
- 第二次真实恢复在故事卡审查 `review` 阶段连续遇 `UND_ERR_SOCKET`，再次返回 409，未到新增单章补发路径，不能宣称它通过生产验证。停止继续付费重试。数据库最终核查该项目 `status=generation_failed`、`world_settings=1`、`outlines=0`、`chapters=0`、正文 0 字；最新 failed runs 依次为 review 网络断连、outline 结构化截断、outline 网络断连。恢复服务在每次失败后均还原原有世界观。当前小说仍未生成；网络连接稳定性与恢复时从头重生成导致的重复成本是剩余风险。

## 19. 2026-09-27 正文质量门与复检假通过修正

- 执行标准 seed v46 增补逐维质量评估、确定性硬红线入质检阻断、平台度量失败显式未评估、复检必须有已应用修订稿和真实模型结果、应用局部精修后待复检，以及一致性评审已判定的矛盾不可转成非阻断建议；`QUALITY_EXECUTION.md` 同步。这里修正的是通用规则与质检路径，不针对单本书放宽任何硬红线。
- 质检报告逐维核对平台/分类/基调/文风/流派/视角的分数和正文逐字证据，低于项目质量最低线或缺证据记 `blocking`；硬红线扫描结果也逐条记 `blocking`，高分不能抵消。平台确定性评审异常直接暴露，不能空问题集合冒充通过。
- 发现原复检在模型失败时按剩余问题数推断 `pass`，解析失败甚至默认通过；已删除两条路径。复检要求已应用修订稿，`review` 场景返回结构完整且明确通过；缺模型、缺修订、空输出、伪布尔值均不能转成 `recheck_passed`。
- 验证：server `npm run typecheck` EXIT=0；最后一次完整 `npm test` 72 文件/703 项通过；相关测试 1 文件/8 项、seed 升级测试 1 文件/2 项通过；`git diff --check` EXIT=0；触及文件 bareLF=0。v46 `restart.ps1` EXIT=0，后端 3100 与前端 5173 各 1 listener，health/API/frontend 均 200，后端错误日志 0 字节。数据库活跃标准 14 条，seed 全为 v46；API 返回“本章一致性评审已列为 contradictions”的禁止降级规则。
- 项目 `3a9a01f5-9625-4803-a791-336841934e30` 仍有 2 章正文长度 `[0,0]`，failed runs 9 条；本轮没有付费调用生成，也没有证实能产出合格小说。当前测试证明代码合同与服务启动，不能替代真实模型端到端验收。
