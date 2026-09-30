from pathlib import Path
import re

# 1) Final idea-gate evidence recognition: cover natural Chinese cues exposed by latest.json.
gate_path = Path('server/src/chain/idea-appeal-gate.service.ts')
gate = gate_path.read_text(encoding='utf-8')
replacements = {
    "const ANOMALY = /(突然|异常|消失|失踪|不存在|多出|少了|多一|少一|倒计时|重复|重置|回拨|重生|回到.{0,8}(?:年前|过去)|名单|遗嘱|秘密|真相|陌生|不认识|死亡|葬礼|尸体|证据|监控|规则|每次|每天|每周|竟然|原来|却|不.{0,8}只.{0,8}|每.{0,12}(?:就|会).{0,18}(?:忘|失|消|变|转|痛|伤|恢复|好转)|会.{0,24}(?:忘|消|少|多|变|出现|收到|梦见|显示|拼|撞|预告|映|跳)|(?:交换|转移).{0,16}(?:记忆|痛|伤|听力|触觉)|(?:明天|次日|七天后|十年后).{0,24}(?:会|就|少|多|失|死))/;":
    "const ANOMALY = /(突然|异常|消失|失踪|不存在|多出|少了|多一|少一|倒计时|重复|重置|回拨|重生|回到.{0,8}(?:年前|过去)|名单|遗嘱|秘密|真相|陌生|不认识|死亡|葬礼|尸体|证据|监控|规则|每次|每天|每周|竟然|原来|却|不.{0,8}只.{0,8}|(?:吃出|认出|发现|对照出).{0,18}(?:旧|改|假|不对|不同|异常|秘密|身份|账|线索)|被改|改过|伪造|假契|顶替|冒用|换嗣|点名|私话|指认|同一张模子|每.{0,12}(?:就|会).{0,18}(?:忘|失|消|变|转|痛|伤|恢复|好转)|会.{0,24}(?:忘|消|少|多|变|出现|收到|梦见|显示|拼|撞|预告|映|跳)|(?:交换|转移).{0,16}(?:记忆|痛|伤|听力|触觉)|(?:明天|次日|七天后|十年后).{0,24}(?:会|就|少|多|失|死))/;",
    "const PRESSURE = /(必须|否则|只剩|之前|截止|期限|倒计时|代价|失去|死亡|辞退|开除|破产|债|欠|追责|坐牢|举报|威胁|危险|救|保住|夺回|不能|来不及|一旦|手术|学费|违约金|赔偿|退学|退役|停播|停职|资格|档案|失聪|失明|忘记|遗忘|限.{0,8}(?:天|小时|还|签|卖)|[一二三四五六七八九十百零两\\d]+(?:天|小时|分钟)(?:内|后|前)|扣|洗不掉|少一笔|后退|忘掉|被.{0,8}(?:接走|抱走|收走))/;":
    "const PRESSURE = /(必须|否则|只剩|之前|截止|期限|倒计时|代价|失去|死亡|辞退|开除|破产|债|欠|追责|坐牢|举报|威胁|危险|救|保住|夺回|不能|来不及|一旦|当晚|连夜|有去无回|押走|被押|卖出去|拐子|封摊|断药|催命|顶罪|闭嘴|逼.{0,10}(?:认|签|走|改|嫁|闭嘴)|手术|学费|违约金|赔偿|退学|退役|停播|停职|资格|档案|失聪|失明|忘记|遗忘|限.{0,8}(?:天|小时|还|签|卖)|[一二三四五六七八九十百零两\\d]+(?:天|小时|分钟)(?:内|后|前)|扣|洗不掉|少一笔|后退|忘掉|被.{0,8}(?:接走|抱走|收走))/;",
    "const AGENCY = /(查|调查|追|找|救|保|阻止|揭|证明|反击|举报|逃|夺回|争|守|破解|选择|决定|行动|潜入|对抗|偿还|起诉|报名|报上|公开)/;":
    "const AGENCY = /(查|调查|追|追凶|找|救|保|阻止|揭|证明|反击|举报|逃|夺回|争|守|破解|选择|决定|行动|潜入|对抗|偿还|起诉|报名|报上|公开|承认|请.{0,8}(?:来|尝|看|查)|摆上|念(?:出|出来)?|留底|端.{0,8}(?:进|入)|拆开|认回|拒绝|署名|核对|对照)/;",
    "const RELATIONSHIP = /(父|母|爸|妈|儿|女|妻|夫|丈夫|老婆|恋人|前任|暗恋|青梅|兄|弟|姐|妹|同事|老板|朋友|邻居|家人|亲人|师|学长|学弟|同学|同班|队友|队长|教练|室友|搭档|对手|夫妻|家庭|家属|顾客)/;":
    "const RELATIONSHIP = /(父|母|爸|妈|儿|女|孩子|妻|夫|丈夫|老婆|恋人|前任|暗恋|青梅|兄|弟|姐|妹|嫡姐|同事|老板|雇主|朋友|邻居|家人|亲人|师|学长|学弟|同学|同班|队友|队长|教练|室友|搭档|对手|仇家|夫妻|家庭|家属|顾客|太子|将军|官差|丫鬟|家族|宗族|族老|掌事)/;",
    "const SECOND_ORDER_EVIDENCE = /(受益|受损|关系|目标|身份|规则|客流|收入|饭碗|抚养权|供货|价格|市场|调查对象|迁怒|重排|改写|被迫|反噬|牵连|连带|停工|中断|站队|资格|责任|队友|机会|退学|退役|辞退|停职|解散)/;":
    "const SECOND_ORDER_EVIDENCE = /(受益|受损|关系|目标|身份|规则|客流|收入|饭碗|抚养权|供货|价格|市场|调查对象|迁怒|重排|改写|被迫|反噬|牵连|连带|卷入|找上门|认祖归宗|互相推罪|婚约|停工|中断|站队|资格|责任|队友|机会|退学|退役|辞退|停职|解散)/;",
}
for old, new in replacements.items():
    if old not in gate:
        raise SystemExit('gate patch anchor missing: ' + old[:100])
    gate = gate.replace(old, new, 1)
gate_path.write_text(gate, encoding='utf-8')

# 2) Idea-discovery: never return 1/5 as success. One bounded repair of the same premises, then all-or-fail.
controller_path = Path('server/src/chain/chain.controller.ts')
controller = controller_path.read_text(encoding='utf-8')
old = "const accept = (candidates: any[]) => {"
if old not in controller:
    raise SystemExit('accept signature anchor missing')
controller = controller.replace(old, "const accept = (candidates: any[], attempt: 'initial' | 'repair' = 'initial') => {", 1)
old = """          candidateAssessments.push({
            title: String(candidate?.title || ''),
            // 未通过候选不会进入前端，但必须保留足够文本证据供 latest.json 复盘 Gate 是否误杀。"""
new = """          candidateAssessments.push({
            title: String(candidate?.title || ''),
            sourcePremiseId: String(candidate?.sourcePremiseId || '').trim(),
            attempt,
            // 未通过候选不会进入前端，但必须保留足够文本证据供 latest.json 复盘 Gate 是否误杀。"""
if old not in controller:
    raise SystemExit('assessment anchor missing')
controller = controller.replace(old, new, 1)

old = """      accept(structuredCards);

      const selectedAccepted = accepted
        .sort((left, right) =>
          Number(right?.ideaAppealGate?.distinctivenessScore || 0) - Number(left?.ideaAppealGate?.distinctivenessScore || 0)
          || Number(right?.ideaAppealGate?.descriptionProgressions || 0) - Number(left?.ideaAppealGate?.descriptionProgressions || 0)
          || Number(Boolean(right?.ideaAppealGate?.hookHasRelationship)) - Number(Boolean(left?.ideaAppealGate?.hookHasRelationship)))
        .slice(0, requestedCount);"""
new = """      accept(structuredCards, 'initial');

      // Final Gate is not allowed to silently shrink a requested batch. The selected premises are already the
      // story identities; a failing full card gets one bounded repair of that same premise, never a substitute.
      let finalGateRepairAttempted = false;
      let finalGateRepairGenerated = 0;
      const acceptedPremiseIds = () => new Set(accepted.map((idea: any) => String(idea?.sourcePremiseId || '').trim()).filter(Boolean));
      const missingAfterGate = () => selectedPremises
        .map((item: any) => String(item?.premiseId || '').trim())
        .filter((id: string) => id && !acceptedPremiseIds().has(id));
      const initialMissingPremiseIds = missingAfterGate();
      if (initialMissingPremiseIds.length > 0) {
        finalGateRepairAttempted = true;
        const initialIssueByPremiseId = new Map(candidateAssessments
          .filter((item: any) => item?.attempt === 'initial' && item?.passed !== true && item?.sourcePremiseId)
          .map((item: any) => [String(item.sourcePremiseId), item.issues]));
        const failedCards = structuredCards.filter((item: any) => initialMissingPremiseIds.includes(String(item?.sourcePremiseId || '').trim()));
        const failedPremises = selectedPremises.filter((item: any) => initialMissingPremiseIds.includes(String(item?.premiseId || '').trim()));
        const repairTargets = failedCards.map((card: any) => ({
          premise: failedPremises.find((item: any) => String(item?.premiseId || '').trim() === String(card?.sourcePremiseId || '').trim()),
          card,
          gateIssues: initialIssueByPremiseId.get(String(card?.sourcePremiseId || '').trim()) || [],
        }));
        const repairResponse = await this.realLLM.generate({
          prompt: `${buildPlatformStyleDirective(dto.platform, dto.storyType, dto.customPlatformNote)}
对下面 ${repairTargets.length} 张完整题材卡执行一次“最终 Gate 定向局部修复”。这不是重新选题，也不是换 premise。

硬约束：
1. 每张必须原样保留 sourcePremiseId，并与对应 premise 一一对应；不得新增、删除、交换或改写题材身份。
2. 平台、长短篇、分类，以及用户已明确选择的基调/文风/流派/视角/标签不得改变。
3. 只修 gateIssues 点名的表达与结构证据：让 hook 清楚显出异常/信息差、现实压力、主角行动和关键关系；让 description/冲突/反转/noveltyProof 把已经存在的因果与二阶后果说清。禁止为了过 Gate 新增另一套案件、能力、身份、亲属关系或结局。
4. 篇幅字段只在 gateIssues 明确指出篇幅/章数无效时修正，且仍必须满足本次项目字数与章节范围；否则保持原值。
5. 只输出 JSON 对象 {"ideas":[...]}，ideas 必须恰好 ${repairTargets.length} 项。不得输出分析、Markdown 或额外文字。

待修复卡：${JSON.stringify(repairTargets)}`,
          scenario: 'idea_generate',
          timeout: LLM_TUNABLES.timeoutSimple(),
          maxEmptyRetries: 1,
          responseFormat: 'json_object',
        });
        const repairedCards = extractIdeaList(repairResponse.content || '') || [];
        finalGateRepairGenerated = repairedCards.length;
        const expectedRepairIds = [...initialMissingPremiseIds].sort();
        const actualRepairIds = repairedCards.map((item: any) => String(item?.sourcePremiseId || '').trim()).filter(Boolean).sort();
        const uniqueRepairIds = new Set(actualRepairIds);
        if (repairedCards.length !== expectedRepairIds.length
          || uniqueRepairIds.size !== expectedRepairIds.length
          || actualRepairIds.join('\\u0000') !== expectedRepairIds.join('\\u0000')) {
          throw new Error(`最终 Gate 定向修复必须逐一返回原未通过题材；期望=${expectedRepairIds.join('、')}，实际=${actualRepairIds.join('、') || '无'}。系统不会用别的题材补位。`);
        }
        accept(repairedCards, 'repair');
      }

      const selectedAccepted = accepted
        .sort((left, right) =>
          Number(right?.ideaAppealGate?.distinctivenessScore || 0) - Number(left?.ideaAppealGate?.distinctivenessScore || 0)
          || Number(right?.ideaAppealGate?.descriptionProgressions || 0) - Number(left?.ideaAppealGate?.descriptionProgressions || 0)
          || Number(Boolean(right?.ideaAppealGate?.hookHasRelationship)) - Number(Boolean(left?.ideaAppealGate?.hookHasRelationship)))
        .slice(0, requestedCount);
      const finalAcceptedPremiseIds = new Set(selectedAccepted.map((idea: any) => String(idea?.sourcePremiseId || '').trim()).filter(Boolean));
      const finalMissingPremiseIds = selectedPremises
        .map((item: any) => String(item?.premiseId || '').trim())
        .filter((id: string) => id && !finalAcceptedPremiseIds.has(id));"""
if old not in controller:
    raise SystemExit('final gate block anchor missing')
controller = controller.replace(old, new, 1)

old = """      const uniqueRejectedReasons = Array.from(new Set(rejectedReasons));
      const qualifiedCount = candidateAssessments.filter(item => item.passed === true).length;
      const appealGate = {
        schemaVersion: 4,
        mode: 'premise_preselection_then_final_reader_experience_gate',"""
new = """      const uniqueRejectedReasons = Array.from(new Set(rejectedReasons));
      const finalRejectedReasons = Array.from(new Set(candidateAssessments
        .filter((item: any) => finalMissingPremiseIds.includes(String(item?.sourcePremiseId || '')) && item?.passed !== true)
        .flatMap((item: any) => Array.isArray(item?.issues) ? item.issues : [])));
      const qualifiedCount = selectedAccepted.length;
      const appealGate = {
        schemaVersion: 5,
        mode: 'premise_preselection_then_final_gate_bounded_repair',"""
if old not in controller:
    raise SystemExit('audit version anchor missing')
controller = controller.replace(old, new, 1)
old = """        generated: candidateAssessments.length,
        qualified: qualifiedCount,
        returned: selectedAccepted.length,
        rejected: candidateAssessments.filter(item => item.passed !== true).length,
        reasons: uniqueRejectedReasons.slice(0, 8),"""
new = """        generated: structuredCards.length,
        evaluatedAttempts: candidateAssessments.length,
        qualified: qualifiedCount,
        returned: selectedAccepted.length,
        rejected: finalMissingPremiseIds.length,
        repairAttempted: finalGateRepairAttempted,
        repairGenerated: finalGateRepairGenerated,
        reasons: finalRejectedReasons.slice(0, 8),"""
if old not in controller:
    raise SystemExit('audit counts anchor missing')
controller = controller.replace(old, new, 1)
controller = controller.replace(
    "        note: '先完成轻量题材池的创建前筛选，再把已选胚子结构化为完整题材卡；最终 Gate 只做独立验收，不负责换题或补生。',",
    "        note: '先完成轻量题材池筛选，再结构化完整卡；最终 Gate 未通过时只允许对原 premise 做一次定向局部修复。修复后仍不足请求数量则整次失败，绝不返回部分成功。',",
    1,
)

old = """      if (!selectedAccepted.length) {
        const rejectionSummary = uniqueRejectedReasons.slice(0, 10).join('；') || '证据不足';
        this.logger.warn(`idea-discover: 创建前已筛选 ${selectedPremises.length} 个题材，但完整卡最终 Gate 全部拒绝：${rejectionSummary}`);
        return {
          success: false,
          ideas: [],
          totalIdeas: 0,
          error: '创建前筛选已完成，但完整题材卡最终验收没有任何一项通过；系统已停止展示，不会通过增加补生次数或另换题材掩盖。请重新发现。',
          appealGate,
        };
      }
      const acceptedWithAudit = selectedAccepted.map(idea => ({ ...idea, ideaDiscoveryAudit: appealGate }));
      this.logger.log(`idea-discover: 完成 ${acceptedWithAudit.length}/${requestedCount} 个合格题材；创建前筛选与完整卡结构化已分阶段完成，最终 Gate 未参与补生`);
      return {
        success: true,
        ideas: acceptedWithAudit,
        totalIdeas: acceptedWithAudit.length,
        appealGate,
        qualityWarning: acceptedWithAudit.length < requestedCount
          ? `创建前已筛选 ${selectedPremises.length} 个成熟题材；完整卡最终 Gate 有 ${acceptedWithAudit.length}/${requestedCount} 个通过。未通过项已留审计，系统没有自动补生或换题。`
          : undefined,
      };"""
new = """      if (selectedAccepted.length !== requestedCount || finalMissingPremiseIds.length > 0) {
        const rejectionSummary = finalRejectedReasons.slice(0, 10).join('；') || uniqueRejectedReasons.slice(0, 10).join('；') || '证据不足';
        this.logger.warn(`idea-discover: 最终 Gate 与一次定向局部修复后仍只有 ${selectedAccepted.length}/${requestedCount} 个通过：${rejectionSummary}`);
        return {
          success: false,
          ideas: [],
          totalIdeas: 0,
          error: `请求 ${requestedCount} 个可选题材，但最终 Gate 与一次定向局部修复后只有 ${selectedAccepted.length} 个通过；系统不会把部分结果伪装成完整成功。请重新发现。`,
          appealGate,
        };
      }
      const acceptedWithAudit = selectedAccepted.map(idea => ({ ...idea, ideaDiscoveryAudit: appealGate }));
      this.logger.log(`idea-discover: 完成 ${acceptedWithAudit.length}/${requestedCount} 个合格题材；最终 Gate 通过后才作为完整候选集返回`);
      return {
        success: true,
        ideas: acceptedWithAudit,
        totalIdeas: acceptedWithAudit.length,
        appealGate,
      };"""
if old not in controller:
    raise SystemExit('partial success return anchor missing')
controller = controller.replace(old, new, 1)

# 3) Short-outline fact conflicts: local patch only; preserve structural fields and provenance.
pattern = re.compile(r"            const repair = await this\.llmCallWithRetry<any>\(`第\$\{order \+ 1\}章事实修复`,.*?            factCheck = await reviewChapterFacts\(chData\);", re.S)
replacement = r'''            const factRepairFields = [
              'title', 'content', 'coreContent', 'summary', 'plot', 'scenes', 'mainScenes',
              'characterActions', '人物行动', 'conflicts', 'conflict', 'conflictDesign',
              'highlights', 'highlight', 'rousing', 'hotScenes', 'foreshadowing', 'foreshadowingSet',
              '伏笔设置', 'foreshadowingRecover', 'foreshadowingPayoff', '伏笔回收', 'characterStates',
              'hook', 'nextChapterHook', 'nextHook', 'emotionalTone', 'mood', 'turningPoint', 'reversalPoint',
            ] as const;
            const factRepairFieldSet = new Set<string>(factRepairFields);
            const repair = await this.llmCallWithRetry<any>(`第${order + 1}章事实局部修复`,
              `只修复当前章纲被事实审查逐项点名的矛盾。已确认题材与前章事实优先，世界观只能作不冲突的补充。不得删除本章职责、不得新增人物、不得换故事。\n【确认题材】${canonicalCreativeBrief}\n【已保存世界规则】${JSON.stringify(currentWorldForOutlineReview)}\n【前章事实台账】${JSON.stringify(priorOutlineFactLedger)}\n【当前章纲】${JSON.stringify(chData)}\n【必须逐项修复】${JSON.stringify(defects)}\n\n【局部修复硬约束】禁止重新生成完整章纲。只输出 JSON 对象 {"patch":{...}}，patch 只包含确实需要修改的事实字段；禁止输出 targetWords、wordCountReason、chapterFunction、goalArc 等结构/篇幅字段。未点名字段必须保持当前值。`,
              {
                projectId, chapterIndex: order + 1, scenario: 'outline', temperature: 0.2,
                timeout: LLM_TUNABLES.timeoutContent(),
                validate: value => {
                  const patch = (value as any)?.patch;
                  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
                  const keys = Object.keys(patch);
                  return keys.length > 0 && keys.every(key => factRepairFieldSet.has(key));
                },
                describeValidation: value => {
                  const patch = (value as any)?.patch;
                  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return ['必须返回 {"patch":{...}}，不得重写整章'];
                  const badKeys = Object.keys(patch).filter(key => !factRepairFieldSet.has(key));
                  return badKeys.length ? [`局部事实修复包含禁止字段：${badKeys.join('、')}`] : [];
                },
              });
            if (repair.runId) shortOutlineSourceRunIds.add(String(repair.runId));
            const rawPatch = repair.data?.patch;
            if (!rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)) {
              throw new Error(`第${order + 1}章事实局部修复未返回 patch 对象`);
            }
            const factPatch = Object.fromEntries(Object.entries(rawPatch)
              .filter(([key]) => factRepairFieldSet.has(key)));
            const preservedTargetWords = chData.targetWords;
            const preservedWordCountReason = chData.wordCountReason;
            chData = {
              ...chData,
              ...factPatch,
              targetWords: preservedTargetWords,
              wordCountReason: preservedWordCountReason,
            };
            const repairedStructureIssues = assessChapter(chData);
            if (repairedStructureIssues.length > 0) {
              throw new Error(`第${order + 1}章事实局部修复破坏了既有结构：${repairedStructureIssues.join('；')}。已停止，不再用整章重写兜底。`);
            }
            factCheck = await reviewChapterFacts(chData);'''
controller, count = pattern.subn(replacement, controller, count=1)
if count != 1:
    raise SystemExit(f'fact repair block patch count={count}')
controller_path.write_text(controller, encoding='utf-8')

# 4) Static architecture regressions.
arch_path = Path('server/src/chain/chain-route-architecture.spec.ts')
arch = arch_path.read_text(encoding='utf-8')
anchor = """  it('keeps broad premise search as a non-blocking target before full idea cards', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('normalizePremiseSelectionPayload');
    expect(source).toContain('premisePoolTargetMet');
    expect(source).toContain('pool 以 ${premisePoolSize} 项为广搜目标，不是整批成功的硬门槛');
    expect(source).toContain('selectedPremises 必须恰好 ${requestedCount} 项');
    expect(source).not.toContain('创建前题材筛选未形成至少');
    expect(source).not.toContain('selectedPremiseIds');
    expect(source).not.toContain('pool.length < premisePoolSize || malformed');
  });
"""
addition = anchor + """
  it('never reports a partial idea batch as successful after the final gate', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('finalGateRepairAttempted');
    expect(source).toContain("mode: 'premise_preselection_then_final_gate_bounded_repair'");
    expect(source).toContain('selectedAccepted.length !== requestedCount');
    expect(source).toContain('系统不会把部分结果伪装成完整成功');
    expect(source).not.toContain('未通过项已留审计，系统没有自动补生或换题');
    expect(source).not.toContain('qualityWarning: acceptedWithAudit.length < requestedCount');
  });

  it('repairs outline fact conflicts as a local patch instead of regenerating the whole chapter plan', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('factRepairFields');
    expect(source).toContain('禁止重新生成完整章纲');
    expect(source).toContain("shortOutlineSourceRunIds.add(String(repair.runId))");
    expect(source).not.toContain('只输出与当前章纲同字段的完整 JSON 对象；修复后所有事件');
  });
"""
if anchor not in arch:
    raise SystemExit('architecture test anchor missing')
arch_path.write_text(arch.replace(anchor, addition, 1), encoding='utf-8')

# 5) Regression cases copied from latest.json failures, reduced to the fields the gate actually evaluates.
regression_path = Path('server/src/chain/idea-appeal-gate.story-regression.spec.ts')
regression = regression_path.read_text(encoding='utf-8')
if 'latest diagnostic idea-gate regressions' in regression:
    raise SystemExit('regression block already exists')
block = r'''

const latestDiagnosticGateCases = [
  {
    title: '一碗旧味掀翻尚食局',
    hook: '摆摊头一天，微服太子在她最便宜的汤饼里吃出宫中旧味，追问味道来处；她当众承认，请太子接连来摊上尝菜，用膳单把二十年前的漏账一道道摆上桌。',
    description: '她不肯替人顶下御膳贪墨的账，被赶出宫，在长安街口支起汤饼摊，只想站稳脚跟、把脏水洗净。摆摊首日太子吃出宫中旧味，她用一道道菜把当年膳单上的漏账摆上桌。尚食局先断原料，再买通街吏封摊，最后抬出她父亲的旧罪逼她认账；查到最后，她发现父亲确实动过手，是为了替一位宫人换下要命的毒膳。最终她必须在平反和保护那位宫人之间作出选择。',
    protagonist: '阿禾，御膳房掌勺出身的女厨，想靠自己的手艺在长安站住，把泼在身上的脏水洗净。',
    coreConflict: '她要翻出二十年御膳贪墨真相，尚食局掌事握着父亲旧罪，也能把以食谋逆扣在她和太子头上。',
    uniquePoint: '味道就是证据：每道菜都是二十年前膳单的一页，太子每吃一口就替她验证一次旧账。',
    mainReversal: '她原以为父亲是冤枉的，最后发现父亲确实动过手，是为了替宫人换掉毒膳；平反因此变成承认罪与义同体。',
    noveltyProof: { familiarShell: '古言甜宠与市井美食翻旧案', uncommonCombination: '被顶罪出宫的掌勺女厨与微服太子靠味道和膳单翻二十年前的御膳贪墨案', avoidedPatterns: '不靠系统、重生或发现秘密一路追查', irreplaceableWhy: '去掉做菜尝味，宫中旧味、膳单漏账和毒膳这条证据链立即断掉', secondOrderConsequence: '太子频繁出宫被御史追责，父亲旧案翻转又会暴露当年被救宫人的身份，她必须在平反和保人之间选择', readerQuestion: '这口宫中旧味是谁教她的，她和二十年前的御膳贪墨案到底是什么关系？' },
  },
  {
    title: '抄书娘子当众念假契',
    hook: '替雇主抄地契时，她对照出三个字被人改过，正是这张假契吞了邻居一家的田；雇主当晚就要把她卖出去，她当着一屋子人把地契一字一句念出来，从此每抄一份都留底本。',
    description: '她从小被当牛马使唤，不识字，只能替人抄书讨口饭，最想守住的是不再被人拿一张纸就夺走家的活路。她认出假契后当众念出改字，并开始给每份抄件留底。雇主毁她住处、买通证人，乡绅用官面施压；她靠底本串起被吞田的人家。最后她认出旧案里伪造地契的人正是把自己卖掉的生父，复仇对象从雇主扩大成整条假契吞田链。',
    protagonist: '阿绫，被卖作抄书娘子的穷女，想靠自己认得的字把家的活路守住。', coreConflict: '她要护住认字秘密和底本，雇主与乡绅则用她不识字、说不清的身份反咬她诬告。', uniquePoint: '她的武器不是身份而是认字，每一个被改过的字都能变成当庭证据。', mainReversal: '旧案里伪造地契的抄书人正是把她卖掉的生父，她认字的本事与自己的来处原来是一根线。',
    noveltyProof: { familiarShell: '古言小人物翻案与对簿公堂', uncommonCombination: '不识字却被卖去抄书的穷娘子，用逐字对照和每份留底建立证据库', avoidedPatterns: '不靠身份曝光或打斗，也不是发现秘密一路追查', irreplaceableWhy: '换成绣厨医，识文断字这个主动权和底本证据链都不存在', secondOrderConsequence: '被假契坑过的人纷纷来求她辨认，乡绅集中堵她，生父身份暴露又把养大她的人家卷入旧案', readerQuestion: '一个不识字的人怎么会认出地契改字，她又是被谁卖去抄书的？' },
  },
  {
    title: '甜汤铺开在仇家对面',
    hook: '她把甜汤铺开在仇家大宅正门对面，开张头一天，仇家老太太隔窗点了她一碗甜汤，点名要她亲自送进宅。她明知有去无回仍端碗进门，决定用这碗汤把仇家的私话一句句听出来。',
    description: '她家甜汤铺被仇家做局夺走，父母一个病死一个失踪，她带着一口锅和配方把铺子开到仇家正门对面。她一碗汤送一句话，仇家几房为争家产越咬越凶；对方先查菜谱，再查她身世，最后翻出父母旧事逼她闭嘴。她后来发现父亲不是被仇家直接害死，而是替仇家背下一桩放贷逼死人的账，真正的对手另有其人。',
    protagonist: '柳甜，甜汤铺孤女，想把铺子站住并查清父母是怎么没的。', coreConflict: '她要靠送汤进出仇家查父母之死，仇家则用商会、供货和官面处罚逼她关店。', uniquePoint: '铺子的位置就是机制：正对仇家大门，一碗汤进宅，一句话出铺。', mainReversal: '父亲并非被仇家直接害死，而是替仇家背下一桩放贷逼死人的账，复仇对象转向幕后同伙。',
    noveltyProof: { familiarShell: '古言市井夺产复仇与情报周旋', uncommonCombination: '甜汤铺正对仇家大门，用送汤入宅形成贴身情报通道', avoidedPatterns: '不写被夺家产后嫁入豪门，也不靠一路追查', irreplaceableWhy: '换成普通账房或绣坊，正面对峙和送汤入宅的信息通道都会消失', secondOrderConsequence: '她递的话帮助仇家某房争到家产后反被收作眼线，仇家散伙又让欠债仆役和邻里都来找她，她被迫从个人翻案变成替一群人讨债', readerQuestion: '仇家老太太为什么非要她亲自送甜汤进去，她父母到底被谁弄没的？' },
  },
  {
    title: '卖糖人的我被指成拐子',
    hook: '摊前丢了个官家小孩，丫鬟当街指认她是拐子，官差踹翻糖摊把她押走。她当众拆开糖人模具，按孩子画下的糖人样子连夜追凶，却发现被拐的孩子都长着同一张模子脸。',
    description: '她在街口卖糖人，无亲无势，只想凭手艺挣口安稳饭。孩子在摊前丢失后，她为了自证清白拆开糖人模具，照孩子留下的样子逐个找人。每找到一个被换过身份的孩子，宗族就有人堵口，官府里保她和压她的人同时亮牌。最后她发现自己也是当年被换出去的孩子，最初指认她的人正知道她的身世。',
    protagonist: '阿棠，街头卖糖人的孤女，想凭手艺挣安稳饭并洗掉拐子的嫌疑。', coreConflict: '她要自证清白并找回孩子，换嗣团伙与宗族官面则不断改口供、堵口并逼她认祖归宗。', uniquePoint: '糖人模具是一眼可见的身份对照工具，孩子只画得出糖人样子，她追的不是凶而是谁是谁。', mainReversal: '她发现自己也是被换出去的孩子，追拐子变成追自己的来处，目标转为掀开整套换嗣规则。',
    noveltyProof: { familiarShell: '古言悬疑与街头小人物自证清白', uncommonCombination: '街头糖人手艺、同一张模子脸的换嗣机制和主角自身被换的身世反噬', avoidedPatterns: '把拐卖写成宗族换嗣而非个人作案，不靠通用秘密追查', irreplaceableWhy: '换成绣抄书医术就没有人人可画的一眼识别载体，街头手艺身份也失去意义', secondOrderConsequence: '换嗣案一掀开，被换孩子、买孩子宗族和经办者都被牵动，亲生一家找上门逼她认祖归宗，与她替别人争的选择自由直接冲突', readerQuestion: '孩子怎么在她摊前丢的，为什么被换走的孩子都长着同一张模子脸？' },
  },
];

describe('latest diagnostic idea-gate regressions', () => {
  for (const idea of latestDiagnosticGateCases) {
    it(`does not false-reject ${idea.title}`, () => {
      const assessment = gate.assess(idea, 'short_story');
      expect(assessment.issues).toEqual([]);
      expect(assessment.passed).toBe(true);
      expect(assessment.signals.hookHasAgency).toBe(true);
      expect([assessment.signals.hookHasAnomaly, assessment.signals.hookHasPressure, assessment.signals.hookHasRelationship].filter(Boolean).length).toBeGreaterThanOrEqual(2);
    });
  }
});
'''
regression_path.write_text(regression.rstrip() + block + '\n', encoding='utf-8')
