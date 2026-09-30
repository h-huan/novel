from pathlib import Path

root = Path('.')
service_path = root / 'server/src/chain/idea-appeal-gate.service.ts'
controller_path = root / 'server/src/chain/chain.controller.ts'
arch_path = root / 'server/src/chain/chain-route-architecture.spec.ts'
spec_path = root / 'server/src/chain/idea-appeal-gate.service.spec.ts'

service = service_path.read_text(encoding='utf-8')
old_pressure = "const PRESSURE = /(必须|否则|只剩|之前|截止|期限|倒计时|代价|失去|死亡|辞退|开除|破产|债|欠|追责|坐牢|举报|威胁|危险|救|保住|夺回|不能|来不及|一旦|当晚|连夜|有去无回|押走|被押|卖出去|拐子|封摊|断药|催命|顶罪|闭嘴|逼.{0,10}(?:认|签|走|改|嫁|闭嘴)|手术|学费|违约金|赔偿|退学|退役|停播|停职|资格|档案|失聪|失明|忘记|遗忘|限.{0,8}(?:天|小时|还|签|卖)|[一二三四五六七八九十百零两\\d]+(?:天|小时|分钟)(?:内|后|前)|扣|洗不掉|少一笔|后退|忘掉|被.{0,8}(?:接走|抱走|收走))/;"
new_pressure = "const PRESSURE = /(必须|否则|只剩|之前|截止|期限|倒计时|代价|失去|死亡|辞退|开除|破产|债|欠|追责|坐牢|举报|威胁|危险|救|保住|夺回|不能|来不及|一旦|当晚|连夜|有去无回|押走|被押|卖出去|拐子|封摊|断药|催命|顶罪|闭嘴|逼.{0,10}(?:认|签|走|改|嫁|闭嘴)|手术|手术费|疗养费|医药费|学费|违约金|赔偿|退学|退役|停播|停职|资格|档案|失聪|失明|忘记|遗忘|限.{0,8}(?:天|小时|还|签|卖)|[一二三四五六七八九十百零两\\d]+(?:天|小时|分钟|秒)(?:内|后|前)|最后.{0,10}(?:一笔|一份|一次|一个|机会|存款|房租|租约|保证金|贷款|钱|款)|(?:确认|截止|签约|转账|开庭|结算).{0,8}前[一二三四五六七八九十百零两\\d]+(?:秒|分钟|小时|天)|扣|洗不掉|少一笔|后退|忘掉|被.{0,8}(?:接走|抱走|收走))/;"
if old_pressure not in service:
    raise SystemExit('PRESSURE pattern changed; stop')
service = service.replace(old_pressure, new_pressure)
old_agency = "const AGENCY = /(查|调查|追|追凶|找|救|保|阻止|揭|证明|反击|举报|逃|夺回|争|守|破解|选择|决定|行动|潜入|对抗|偿还|起诉|报名|报上|公开|承认|请.{0,8}(?:来|尝|看|查)|摆上|念(?:出|出来)?|留底|端.{0,8}(?:进|入)|拆开|认回|拒绝|署名|核对|对照)/;"
new_agency = "const AGENCY = /(查|调查|追|追凶|找|救|保|阻止|揭|证明|反击|举报|逃|夺回|争|守|破解|选择|决定|行动|潜入|对抗|偿还|起诉|报名|报上|公开|承认|提出|要求|答应|同意|假装|配合|谈判|套话|套出|请.{0,8}(?:来|尝|看|查)|摆上|念(?:出|出来)?|留底|端.{0,8}(?:进|入)|拆开|认回|拒绝|署名|核对|对照)/;"
if old_agency not in service:
    raise SystemExit('AGENCY pattern changed; stop')
service = service.replace(old_agency, new_agency)
old_anomaly_end = "(?:明天|次日|七天后|十年后).{0,24}(?:会|就|少|多|失|死))/;"
new_anomaly_end = "(?:明天|次日|七天后|十年后).{0,24}(?:会|就|少|多|失|死)|(?:发现|看见|看到|撞见|得知|才知道).{0,28}(?:只|竟|原来|正|是|不是|并非|被|拿|用|失踪|骗|冒用|盗用|伪造)|(?:照片|身份|账号|名字|资料).{0,16}(?:骗|冒用|盗用|伪造|顶替|套用)|(?:失眠|失聪|失明|不会|不能|从不|多年未).{0,16}(?:第一次|自然|突然|竟然|就).{0,12}(?:睡着|听见|看见|恢复|做到)|只.{0,12}(?:关注|认|看|信|找|对).{0,12}(?:一人|一个人|她|他|我))/;"
if old_anomaly_end not in service:
    raise SystemExit('ANOMALY tail changed; stop')
service = service.replace(old_anomaly_end, new_anomaly_end)
service_path.write_text(service, encoding='utf-8')

controller = controller_path.read_text(encoding='utf-8')
controller = controller.replace(
"      // Final Gate is not allowed to silently shrink a requested batch. The selected premises are already the\n      // story identities; a failing full card gets one bounded repair of that same premise, never a substitute.\n",
"      // Final Gate 只决定哪些已选 premise 可以展示，不再承担补题职责。某张卡失败时允许对同一 premise\n      // 做一次有界局部修复；仍失败就只淘汰这一张，已通过题材照常返回，绝不能把 4/5 伪装成 0/5。\n")
old_note = "        note: '先完成轻量题材池筛选；每个已选 premise 独立结构化恰好一张完整卡，题材身份由服务器绑定，避免批量大 JSON 少卡/错 ID。最终 Gate 未通过时只允许对原 premise 做一次有序局部字段修复；修复后仍不足请求数量则整次失败。',"
new_note = "        note: '先完成轻量题材池筛选；每个已选 premise 独立结构化恰好一张完整卡，题材身份由服务器绑定，避免批量大 JSON 少卡/错 ID。最终 Gate 未通过时只允许对原 premise 做一次有序局部字段修复；仍未通过只淘汰该题材，已通过题材照常返回，不换题、不补数。',"
if old_note not in controller:
    raise SystemExit('appealGate note changed; stop')
controller = controller.replace(old_note, new_note)
old_block = '''      if (selectedAccepted.length !== requestedCount || finalMissingPremiseIds.length > 0) {
        const rejectionSummary = finalRejectedReasons.slice(0, 10).join('；') || uniqueRejectedReasons.slice(0, 10).join('；') || '证据不足';
        this.logger.warn(`idea-discover: 最终 Gate 与一次定向局部修复后仍只有 ${selectedAccepted.length}/${requestedCount} 个通过：${rejectionSummary}`);
        return {
          success: false,
          ideas: [],
          totalIdeas: 0,
          error: finalGateRepairError
            ? `请求 ${requestedCount} 个可选题材，但最终 Gate 的同题材局部修复协议未完成：${finalGateRepairError} 系统不会把部分结果伪装成完整成功。`
            : `请求 ${requestedCount} 个可选题材，但最终 Gate 与一次定向局部修复后只有 ${selectedAccepted.length} 个通过；系统不会把部分结果伪装成完整成功。请重新发现。`,
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
      };'''
new_block = '''      if (selectedAccepted.length === 0) {
        const rejectionSummary = finalRejectedReasons.slice(0, 10).join('；') || uniqueRejectedReasons.slice(0, 10).join('；') || '证据不足';
        this.logger.warn(`idea-discover: 最终 Gate 与一次定向局部修复后 0/${requestedCount} 通过：${rejectionSummary}`);
        return {
          success: false,
          ideas: [],
          totalIdeas: 0,
          error: finalGateRepairError
            ? `本次创建前筛选的 ${requestedCount} 个题材均未形成可展示结果，且同题材局部修复协议未完成：${finalGateRepairError}`
            : `本次创建前筛选的 ${requestedCount} 个题材在最终 Gate 与一次定向局部修复后均未通过；系统未换题或补数，请重新发现。`,
          appealGate,
        };
      }
      const acceptedWithAudit = selectedAccepted.map(idea => ({ ...idea, ideaDiscoveryAudit: appealGate }));
      const partial = selectedAccepted.length < requestedCount || finalMissingPremiseIds.length > 0;
      const qualityWarning = partial
        ? `创建前已筛选 ${requestedCount} 个题材，最终 Gate 通过 ${selectedAccepted.length} 个；未通过题材已淘汰，系统未换题或补数。`
        : undefined;
      this.logger.log(`idea-discover: 完成 ${acceptedWithAudit.length}/${requestedCount} 个合格题材；只返回最终 Gate 通过项，不换题补数`);
      return {
        success: true,
        ideas: acceptedWithAudit,
        totalIdeas: acceptedWithAudit.length,
        qualityWarning,
        appealGate,
      };'''
if old_block not in controller:
    raise SystemExit('partial-result block changed; stop')
controller = controller.replace(old_block, new_block)
controller_path.write_text(controller, encoding='utf-8')

arch = arch_path.read_text(encoding='utf-8')
old_arch = '''  it('never reports a partial idea batch as successful after the final gate', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('finalGateRepairAttempted');
    expect(source).toContain("repairProtocol: 'ordered_local_patch_server_owned_identity'");
    expect(source).toContain('applyOrderedIdeaRepairPatches');
    expect(source).toContain('ideaGateLocalRepairDirective');
    expect(source).not.toContain('最终 Gate 定向修复必须逐一返回原未通过题材');
    expect(source).not.toContain('每张必须原样保留 sourcePremiseId');
    expect(source).toContain("mode: 'premise_preselection_then_final_gate_bounded_repair'");
    expect(source).toContain('selectedAccepted.length !== requestedCount');
    expect(source).toContain('evaluatedAttempts: candidateAssessments.length');
    expect(source).toContain('repairGenerated: finalGateRepairGenerated');
    expect(source).toContain('repairError: finalGateRepairError');
    expect(source).toContain('系统不会把部分结果伪装成完整成功');
    expect(source).not.toContain('未通过项已留审计，系统没有自动补生或换题');
    expect(source).not.toContain('qualityWarning: acceptedWithAudit.length < requestedCount');
  });'''
new_arch = '''  it('returns final-gate-passed selected premises without replacing or zeroing a partial batch', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('finalGateRepairAttempted');
    expect(source).toContain("repairProtocol: 'ordered_local_patch_server_owned_identity'");
    expect(source).toContain('applyOrderedIdeaRepairPatches');
    expect(source).toContain('ideaGateLocalRepairDirective');
    expect(source).toContain("mode: 'premise_preselection_then_final_gate_bounded_repair'");
    expect(source).toContain('selectedAccepted.length === 0');
    expect(source).toContain('const qualityWarning = partial');
    expect(source).toContain('未通过题材已淘汰，系统未换题或补数');
    expect(source).toContain('evaluatedAttempts: candidateAssessments.length');
    expect(source).toContain('repairGenerated: finalGateRepairGenerated');
    expect(source).toContain('repairError: finalGateRepairError');
    expect(source).not.toContain('selectedAccepted.length !== requestedCount');
    expect(source).not.toContain('系统不会把部分结果伪装成完整成功');
  });'''
if old_arch not in arch:
    raise SystemExit('architecture partial-batch test changed; stop')
arch = arch.replace(old_arch, new_arch)
arch_path.write_text(arch, encoding='utf-8')

spec = spec_path.read_text(encoding='utf-8')
insert = r'''

  it('recognizes pressure and action in real short-card hooks instead of forcing a repair for ordinary Chinese phrasing', () => {
    const antiFraud = gate.assess({
      ...strongShort,
      hook: '被裁员后她靠夜间客服兼职和合租省钱，正准备把最后一笔“解冻保证金”转给网恋的海外工程师；转账确认前一秒，新室友江砚亮出反诈客服工牌，拦下她的手：那个说要娶她的人，正拿她的照片骗下一个人。她没哭，删掉对话框，答应假装继续转账当诱饵，唯一条件是别把她写成反诈案例。',
    }, 'short_story');
    expect(antiFraud.signals.hookHasPressure).toBe(true);
    expect(antiFraud.signals.hookHasAgency).toBe(true);
    expect(antiFraud.signals.hookHasRelationship).toBe(true);

    const sleepTester = gate.assess({
      ...strongShort,
      hook: '试睡师江晚为母亲的疗养费接下高薪私单，刚铺好床，失眠三年的总裁就睡着。他递来三十天同住合约，她签字时加一条：谁动手脚，就报警，不许用钱封口。',
    }, 'short_story');
    expect(sleepTester.signals.hookHasPressure).toBe(true);
    expect(sleepTester.signals.hookHasAgency).toBe(true);
    expect(sleepTester.signals.hookHasRelationship).toBe(true);

    const cake = gate.assess({
      ...strongShort,
      hook: '母亲的手术费压在月底租约上，她半夜回店堵住偷吃报废蛋糕的男人，发现对方是刚收购商场、要她搬走的控糖总裁。她当场提出试吃抵租：他尝新品，她换租约延期。',
    }, 'short_story');
    expect(cake.signals.hookHasPressure).toBe(true);
    expect(cake.signals.hookHasAgency).toBe(true);
    expect(cake.signals.hookHasRelationship).toBe(true);

    const moderator = gate.assess({
      ...strongShort,
      hook: '她给千万粉情感主播当反黑客服，误登他账号，发现置顶私密小号只关注她一人。当夜他被曝“骗粉”，两小时内她得选：删记录保饭碗，还是替他挖出造谣源头。',
    }, 'short_story');
    expect(moderator.signals.hookHasAnomaly).toBe(true);
    expect(moderator.signals.hookHasPressure).toBe(true);
    expect(moderator.signals.hookHasAgency).toBe(true);
  });
'''
marker = '\n  it(\'ranks higher distinctiveness ahead of lower distinctiveness after both candidates have passed\''
if marker not in spec:
    raise SystemExit('gate spec insertion marker changed; stop')
spec = spec.replace(marker, insert + marker, 1)
spec_path.write_text(spec, encoding='utf-8')

print('patched real idea-discovery gate + partial return behavior')
