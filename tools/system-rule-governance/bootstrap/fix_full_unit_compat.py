#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)

# 1) Architecture tests must verify public-rule projection, not duplicate inline prose.
path = Path('server/src/chain/chain-route-architecture.spec.ts')
text = path.read_text(encoding='utf-8-sig')
old = """    expect(source).toContain('normalizePremiseSelectionPayload');
    expect(source).toContain('premisePoolTargetMet');
    expect(source).toContain('pool 以 ${premisePoolSize} 项为广搜目标，不是整批成功的硬门槛');
    expect(source).toContain('selectedPremises 必须恰好 ${requestedCount} 项');
    expect(source).not.toContain('创建前题材筛选未形成至少');
"""
new = """    expect(source).toContain('normalizePremiseSelectionPayload');
    expect(source).toContain('premisePoolTargetMet');
    expect(source).toContain('ideaPremiseSelectionDirective');
    expect(source).toContain('ideaCardStructuringDirective');
    expect(source).not.toContain('pool 以 ${premisePoolSize} 项为广搜目标，不是整批成功的硬门槛');
    expect(source).not.toContain('selectedPremises 必须恰好 ${requestedCount} 项');
    expect(source).not.toContain('创建前题材筛选未形成至少');
"""
text = replace_once(text, old, new, 'architecture public-rule ownership test')
path.write_text(text, encoding='utf-8')

# 2) Raw countdown prose is advisory without a stable fact identity. Exercise the integration
# path with a fully stubbed successful evaluator instead of expecting the retired story-specific 422.
path = Path('server/src/chain/chain.controller.helpers.spec.ts')
text = path.read_text(encoding='utf-8-sig')
old = """  it('blocks a contradictory source countdown before the first body model call', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.worldSettingService.getWritingSummary = () => ({
      summary: '两天前——开发方下达定向爆破令，72小时倒计时启动。',
    });
    controller.generateBodyWithLengthGuard = vi.fn();

    await expect(controller.generateBodyWithAlignmentGuard({
      projectId: 'p1', basePrompt: '写正文', targetWords: 4000,
      scenario: 'writing_climax', chapterIndex: 1, chapterTitle: '第一章',
      outlineContract: '三天后上午十点起爆。', storyContext: '已确认上下文',
      wordRange: { min: 3000, max: 5000 },
    })).rejects.toMatchObject({ status: 422 });

    expect(controller.generateBodyWithLengthGuard).not.toHaveBeenCalled();
  });
"""
new = """  it('keeps raw countdown arithmetic as advisory when stable fact identity is unavailable', async () => {
    const controller = applyStandardsStub(Object.create(ChainController.prototype) as any);
    controller.worldSettingService.getWritingSummary = () => ({
      summary: '两天前，72小时倒计时启动。',
    });
    controller.getActiveLessons = vi.fn().mockReturnValue('');
    controller.generateBodyWithLengthGuard = vi.fn().mockResolvedValue('正文'.repeat(1800));
    controller.assertGeneratedChapterIdentity = vi.fn();
    controller.checkChapterAlignment = vi.fn().mockResolvedValue({
      evaluationStatus: 'evaluated', pass: true,
      requiredEvents: [{ event: '必需事件', covered: true, evidence: '正文证据' }],
      missingRequiredItems: [], missing: [], contradictions: [], advisories: [], sourceConflicts: [], evidence: [], hardlineFindings: [],
      outlineAligned: true, continuityPassed: true, characterPassed: true,
      worldPassed: true, timelinePassed: true, prosePassed: true,
    });
    controller.persistAlignmentContradictions = vi.fn();
    controller.assertNoBlockingGeneratedContentIssues = vi.fn();

    await expect(controller.generateBodyWithAlignmentGuard({
      projectId: 'p1', basePrompt: '写正文', targetWords: 4000,
      scenario: 'writing_climax', chapterIndex: 1, chapterTitle: '第一章',
      outlineContract: '三天后零点截止。', storyContext: '已确认上下文',
      wordRange: { min: 3000, max: 5000 },
    })).resolves.toEqual(expect.any(String));

    expect(controller.generateBodyWithLengthGuard).toHaveBeenCalledTimes(1);
    expect(controller.logger.warn).toHaveBeenCalledWith(expect.stringContaining('可计算时间风险'));
  });
"""
text = replace_once(text, old, new, 'countdown advisory integration test')

# 3) Keep the sequential-patch regression, but use a rule that remains deterministic: actual
# repeated prose. The old action-chain example is now a semantic/style risk, not a P1 hardline.
old = """        { original: '屋里只有一本账册。', replacement: '拉开抽屉，抽出账册，翻到末页，推到桌上。' },
"""
new = """        { original: '屋里只有一本账册。', replacement: '屋里只有一本账册。屋里只有一本账册。屋里只有一本账册。屋里只有一本账册。' },
"""
text = replace_once(text, old, new, 'repair regression actual hardline patch')
text = replace_once(
    text,
    """    expect(after).not.toContain('拉开抽屉，抽出账册');
""",
    """    expect(after).not.toContain('屋里只有一本账册。屋里只有一本账册。');
""",
    'repair regression rejection assertion',
)
path.write_text(text, encoding='utf-8')

# 4) Structured-output guard tests own transport/output-budget behavior only. Public standard
# injection is covered by real-llm.standards.spec.ts; the retired inline preflight must not be
# copied back into this test as a second rule source.
path = Path('server/src/chain/real-llm.structured-output.spec.ts')
text = path.read_text(encoding='utf-8-sig')
needle = "expect.stringContaining('执行前置规则')"
count = text.count(needle)
if count != 3:
    raise SystemExit(f'structured-output preflight expectations: expected 3, got {count}')
text = text.replace(needle, 'expect.any(String)')
anchor = """    expect(response.content).toBe('{\"ok\":true}');
    expect(response.finishReason).toBe('stop');
"""
replacement = """    expect(response.content).toBe('{\"ok\":true}');
    expect(response.finishReason).toBe('stop');
    expect(String(callModel.mock.calls[0][2] || '')).not.toContain('执行前置规则');
"""
text = replace_once(text, anchor, replacement, 'structured-output no inline public preflight')
path.write_text(text, encoding='utf-8')

print('aligned full unit compatibility tests with governed rule ownership and current hardlines')
