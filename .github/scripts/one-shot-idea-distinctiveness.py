from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 occurrence, found {count}')
    return text.replace(old, new, 1)


# 1) Distinctiveness Gate: stop treating keyword-complete but generic premises as strong ideas.
path = Path('server/src/chain/idea-appeal-gate.service.ts')
text = path.read_text(encoding='utf-8')
text = once(
    text,
    "  payoffPromise: boolean;\n}",
    "  payoffPromise: boolean;\n  concretePremiseAnchor: boolean;\n  counterExpectation: boolean;\n  forcedTradeoff: boolean;\n  secondOrderConsequence: boolean;\n  simpleMoralMechanismRisk: boolean;\n  distinctivenessScore: number;\n}",
    'signal contract',
)
text = once(
    text,
    "const PRESSURE_EMOTION = /(怕|恐惧|危险|威胁|逼迫|压力|绝望|焦虑|来不及|倒计时|失去|死亡)/;",
    "const PRESSURE_EMOTION = /(怕|恐惧|危险|威胁|逼迫|压力|绝望|焦虑|来不及|倒计时|失去|死亡)/;\n// 题材差异度不是靠“新颖/反转”自评，而看具体生活载体、反预期、两难与二阶后果是否真正进入故事。\nconst CONCRETE_PREMISE = /(合同|遗嘱|工号|病历|账单|订单|直播|账号|工资|房贷|租约|房本|钥匙|名单|录音|监控|聊天记录|考核|名额|证件|快递|药方|手术|保险|借条|票据|档案|门牌|排班|学籍|成绩|二维码|银行卡|手机|群聊|户口|赔偿|保单|奖金|绩效|社保|病例|收据|发票|录取|论文|举报信|工资单)/;\nconst COUNTER_EXPECTATION = /(却|反而|看似|实际上|实际是|并非|不是.{0,12}而是|越.{1,10}越|原来|真正|偏偏|本以为|没想到)/;\nconst FORCED_TRADEOFF = /(在.{2,24}与.{2,24}之间|二选一|只能.{2,24}(?:或|还是)|保住.{0,14}(?:却要|必须|就得).{0,14}(?:失去|放弃)|公开.{0,14}(?:会|就会)|救.{0,10}(?:却要|代价)|代价是|换来|牺牲.{0,12}(?:才能|换取))/;\nconst SECOND_ORDER = /(转嫁|反噬|牵连|连带|迫使.{0,18}(?:从|改)|敌友.{0,8}改写|关系.{0,10}改写|目标.{0,10}改变|身份.{0,10}改变|规则.{0,10}改变|谁受益|谁承担|收益.{0,10}归|责任.{0,10}转|失去.{0,10}资格)/;\nconst MORAL_TRIGGER = /(说谎|撒谎|欺骗|贪心|作弊|偷懒|造假|网暴|炫富|贪婪|自私|恶意)/;\nconst DIRECT_PUNISHMENT = /(消失|死亡|失去|惩罚|报应|倒霉|变穷|被抹除|失忆|受伤|破产|扣除)/;",
    'distinctiveness regexes',
)
text = once(
    text,
    "    const stackingRisk = all.length > 0 && intensityHits >= (storyType === 'short_story' ? 9 : 12)\n      && intensityHits / Math.max(1, all.length / 100) >= 4;\n\n    const readerExperienceProfile = this.buildReaderExperienceProfile(storyType, {",
    "    const stackingRisk = all.length > 0 && intensityHits >= (storyType === 'short_story' ? 9 : 12)\n      && intensityHits / Math.max(1, all.length / 100) >= 4;\n\n    const distinctiveText = `${title}；${hook}；${uniquePoint}；${coreConflict}；${mainReversal}；${description}`;\n    const concretePremiseAnchor = CONCRETE_PREMISE.test(`${title}；${hook}；${uniquePoint}`) || /\\d+[天小时分钟年月次条份人章]/.test(distinctiveText);\n    const counterExpectation = COUNTER_EXPECTATION.test(`${uniquePoint}；${mainReversal}；${description}`);\n    const forcedTradeoff = FORCED_TRADEOFF.test(`${coreConflict}；${mainReversal}；${description}`);\n    const secondOrderConsequence = SECOND_ORDER.test(`${mainReversal}；${description}`) || (reversalConsequential && forcedTradeoff);\n    const simpleMoralMechanismRisk = MORAL_TRIGGER.test(`${title}；${hook}；${uniquePoint}`)\n      && DIRECT_PUNISHMENT.test(`${title}；${hook}；${uniquePoint}`)\n      && !forcedTradeoff && !secondOrderConsequence;\n    const distinctivenessScore = Math.max(0, Math.min(10,\n      (concretePremiseAnchor ? 2 : 0)\n      + (counterExpectation ? 2 : 0)\n      + (forcedTradeoff ? 2 : 0)\n      + (secondOrderConsequence ? 2 : 0)\n      + (hookHasRelationship ? 1 : 0)\n      + (openingDeliversPromise ? 1 : 0)\n      - (simpleMoralMechanismRisk ? 4 : 0)\n      - (stackingRisk ? 1 : 0)));\n\n    const readerExperienceProfile = this.buildReaderExperienceProfile(storyType, {",
    'distinctiveness calculation',
)
text = once(
    text,
    "    if (!sustainedSuspense) issues.push('缺少可贯穿阶段的核心追问，故事没有稳定的“还想知道什么”');\n\n    // 热血、刀点、喜怒哀乐、爽感是体验曲线，不是题材卡逐项打卡。缺失时给下游规划提示，不用在发现阶段强塞。",
    "    if (!sustainedSuspense) issues.push('缺少可贯穿阶段的核心追问，故事没有稳定的“还想知道什么”');\n    if (simpleMoralMechanismRisk) issues.push('题材仍是“某种行为→直接受到超常惩罚/报应”的单层寓言机制，缺少会改写利益、关系或选择的第二层后果');\n    const minDistinctiveness = storyType === 'short_story' ? 6 : 5;\n    if (distinctivenessScore < minDistinctiveness) issues.push(`题材差异度不足（${distinctivenessScore}/10）：具体生活载体、反预期、两难选择和二阶后果至少要形成稳定组合，而不是字段齐全即可通过`);\n\n    // 热血、刀点、喜怒哀乐、爽感是体验曲线，不是题材卡逐项打卡。缺失时给下游规划提示，不用在发现阶段强塞。",
    'distinctiveness gate',
)
text = once(
    text,
    "        reversalConsequential,\n        payoffPromise,\n      },",
    "        reversalConsequential,\n        payoffPromise,\n        concretePremiseAnchor,\n        counterExpectation,\n        forcedTradeoff,\n        secondOrderConsequence,\n        simpleMoralMechanismRisk,\n        distinctivenessScore,\n      },",
    'signal result',
)
text = once(
    text,
    "    const accepted = assessed\n      .filter((item) => item.assessment.passed)\n      .slice(0, desiredCount)\n      .map((item) => ({\n        ...item.idea,\n        // 随 selectedIdea 原样进入 Creative Constitution.confirmedStory；后续世界观/章纲/正文共享同一份体验策略。\n        readerExperienceProfile: item.assessment.readerExperienceProfile,\n      }));",
    "    // 通过 Gate 后不能再按模型原始顺序截前 N 个。先选差异度更强、推进更完整的题材，\n    // 避免“第一个字段齐全但很普通”的候选占掉展示位。这里仍不是点击率预测，只是文本前置排序。\n    const accepted = assessed\n      .filter((item) => item.assessment.passed)\n      .sort((left, right) =>\n        right.assessment.signals.distinctivenessScore - left.assessment.signals.distinctivenessScore\n        || right.assessment.signals.descriptionProgressions - left.assessment.signals.descriptionProgressions\n        || Number(right.assessment.signals.hookHasRelationship) - Number(left.assessment.signals.hookHasRelationship))\n      .slice(0, desiredCount)\n      .map((item) => ({\n        ...item.idea,\n        // 随 selectedIdea 原样进入 Creative Constitution.confirmedStory；后续世界观/章纲/正文共享同一份体验策略。\n        readerExperienceProfile: item.assessment.readerExperienceProfile,\n      }));",
    'selection ranking',
)
path.write_text(text, encoding='utf-8')


# 2) Generation prompt: make the model produce a real second layer instead of self-declaring novelty.
path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')
text = once(
    text,
    '\"noveltyProof\":{\"familiarShell\":\"读者一眼能懂的类型外壳\",\"uncommonCombination\":\"本题材独有的职业/关系/机制组合\",\"avoidedPatterns\":\"相对历史题材主动避开的机制与反转\"}',
    '\"noveltyProof\":{\"familiarShell\":\"读者一眼能懂的类型外壳\",\"uncommonCombination\":\"本题材独有的职业/关系/机制组合\",\"avoidedPatterns\":\"相对历史题材主动避开的机制与反转\",\"irreplaceableWhy\":\"去掉这个职业/关系/机制任一项后故事为何不成立\",\"secondOrderConsequence\":\"规则启动后的二阶后果：谁额外受益/受损、关系或目标如何被迫改变\",\"readerQuestion\":\"读者看完首屏后必须追问的一个具体问题\"}',
    'novelty output schema',
)
text = once(
    text,
    "6. 新颖性不是堆设定。每项先选一个读者熟悉的类型外壳，再组合一个少见但可验证的职业/关系/机制，并明确相对历史作品避开了什么；写入 noveltyProof。若仍是历史题材的同一机制、同一追查路径或同一反转，必须在输出前淘汰重想。",
    "6. 新颖性不是堆设定，也不是自己写一句“独特”。每项先选读者熟悉的类型外壳，再把【具体生活载体/职业】、【不可互换的人物关系】、【异常机制】组成一个彼此依赖的冲突；noveltyProof 必须写清 irreplaceableWhy、secondOrderConsequence、readerQuestion。凡可概括为“某种行为→直接受到超常惩罚/奖励”“发现秘密→一路追查”“获得能力→一路升级”，且去掉具体职业/关系后故事仍成立的，视为可替换模板，必须淘汰重想。核心机制启动后至少产生一个二阶后果：改变谁受益/谁受损、迫使关系重组、改变主角目标或制造真正两难；不能只有直接报应。若仍是历史题材的同一机制、同一追查路径或同一反转，也必须淘汰重想。",
    'novelty prompt rule',
)
text = once(
    text,
    "        if (!novelty || String(novelty?.familiarShell || '').trim().length < 4\n          || String(novelty?.uncommonCombination || '').trim().length < 8\n          || String(novelty?.avoidedPatterns || '').trim().length < 6) {\n          issues.push('缺少可核验的题材差异说明');\n        }",
    "        if (!novelty || String(novelty?.familiarShell || '').trim().length < 4\n          || String(novelty?.uncommonCombination || '').trim().length < 8\n          || String(novelty?.avoidedPatterns || '').trim().length < 6\n          || String(novelty?.irreplaceableWhy || '').trim().length < 10\n          || String(novelty?.secondOrderConsequence || '').trim().length < 10\n          || String(novelty?.readerQuestion || '').trim().length < 8) {\n          issues.push('缺少可核验的题材差异说明、不可替换性、二阶后果或首屏追问');\n        }",
    'novelty proof validation',
)
path.write_text(text, encoding='utf-8')


# 3) Regression tests: the exact failure mode from the real sample must stay rejected.
path = Path('server/src/chain/idea-appeal-gate.service.spec.ts')
text = path.read_text(encoding='utf-8')
insert_before = "  it('enriches only accepted ideas with the profile that will travel with selectedIdea', () => {"
new_test = """  it('rejects a keyword-complete but single-layer moral punishment premise as too generic', () => {\n    const assessment = gate.assess({\n      title: '说谎带货会消失',\n      hook: '主播每次说谎带货都会从直播间消失十分钟；为了保住工作和工资，他必须在老板威胁下查清规则，否则会彻底消失，他决定反击并找出真相。',\n      description: '最初他为了保住工作继续直播，随后发现平台规则会惩罚说谎者；第二次消失后他调查账号记录和合同，最后举报老板并揭开真相，保住工资并让公司承担代价。',\n      protagonist: '想保住工资和工作的普通主播',\n      uniquePoint: '说谎带货的人会直接消失，平台记录会留下异常。',\n      coreConflict: '主角必须一边保住工作一边调查平台规则并反击老板。',\n      mainReversal: '原来老板知道规则，因此主角决定举报公司并改变目标。',\n    }, 'short_story');\n\n    expect(assessment.passed).toBe(false);\n    expect(assessment.signals.simpleMoralMechanismRisk).toBe(true);\n    expect(assessment.signals.distinctivenessScore).toBeLessThan(6);\n    expect(assessment.issues.some((item) => item.includes('单层寓言机制'))).toBe(true);\n  });\n\n  it('ranks stronger accepted premises ahead of merely adequate ones instead of preserving model order', () => {\n    const adequate = {\n      title: '工资单上多了死人',\n      hook: '同事葬礼后，我的工资单突然多出他的名字；老板要求我三天内签保密协议，否则全组失业，我决定查工资记录和合同。',\n      description: '最初我只想保住工作和房租，第一天查到工资单由老板手工改过；随后我和同事家属核对合同，发现公司一直用离职员工的名额做绩效。第二天老板逼我签保密协议，我继续调查。最后我公开证据，让公司赔偿并保住同事家属应得的钱。',\n      protagonist: '想保住工作和房租的普通职员',\n      uniquePoint: '死去同事的名字重新出现在工资单上，逼主角调查公司记录。',\n      coreConflict: '主角必须在三天内查清工资记录，同时保住工作并帮助同事家属。',\n      mainReversal: '原来老板早就知道工资单异常，因此主角改变目标，转而公开证据。',\n    };\n    const selection = gate.select([adequate, strongShort], 'short_story', 2);\n    expect(selection.accepted).toHaveLength(2);\n    expect(selection.accepted[0].title).toBe(strongShort.title);\n    expect(selection.accepted[0].readerExperienceProfile).toBeTruthy();\n  });\n\n"""
text = once(text, insert_before, new_test + insert_before, 'gate regression tests')
path.write_text(text, encoding='utf-8')


# 4) Local verification must carry the chosen story and discovery audit; screenshots are not an acceptance dependency.
path = Path('verify-local.mjs')
text = path.read_text(encoding='utf-8')
text = once(
    text,
    "  const constitution = project?.creativeConstitution ?? project?.creative_constitution ?? null;\n  const resolvedProjectType = projectType(project);",
    "  const constitution = project?.creativeConstitution ?? project?.creative_constitution ?? null;\n  const confirmedStory = constitution?.confirmedStory && typeof constitution.confirmedStory === 'object' && !Array.isArray(constitution.confirmedStory)\n    ? constitution.confirmedStory\n    : null;\n  const resolvedProjectType = projectType(project);",
    'confirmed story extraction',
)
text = once(
    text,
    "      constitutionRevision: constitution?.revision ?? null,\n      confirmedStoryPresent: Boolean(constitution?.confirmedStory),",
    "      constitutionRevision: constitution?.revision ?? null,\n      confirmedStoryPresent: Boolean(confirmedStory),\n      storySelection: confirmedStory ? {\n        title: confirmedStory.title ?? null,\n        hook: confirmedStory.hook ?? null,\n        protagonist: confirmedStory.protagonist ?? null,\n        coreConflict: confirmedStory.coreConflict ?? confirmedStory.conflict ?? null,\n        uniquePoint: confirmedStory.uniquePoint ?? confirmedStory.uniqueSelling ?? confirmedStory.storyCore ?? null,\n        mainReversal: confirmedStory.mainReversal ?? null,\n        noveltyProof: confirmedStory.noveltyProof ?? null,\n        readerExperienceProfile: confirmedStory.readerExperienceProfile ?? null,\n        ideaDiscoveryAudit: confirmedStory.ideaDiscoveryAudit ?? null,\n      } : null,",
    'story selection report',
)
path.write_text(text, encoding='utf-8')
