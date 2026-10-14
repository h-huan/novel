import { describe, expect, it } from 'vitest';
import {
  GateRejectionError,
  HARDLINE_FINDING_PREFIX,
  classifyGateFailure,
  firstGateReportFromChain,
  gateRejectionFromReport,
  gateFailureLabel,
  isGateFailureReport,
  isGateRejection,
  OUTLINE_PRECONDITION_MARKER,
} from './gate-failure';

const HARDLINE = `${HARDLINE_FINDING_PREFIX}rule42】叙述者跳出成为作者评论者 | 位置: 第3段 | 原文: 各位看官`;

describe('gate failure classifier', () => {
  it('splits the three real causes apart instead of blaming the outline for everything', () => {
    const report = classifyGateFailure({
      evaluationStatus: 'evaluated',
      contradictions: [
        HARDLINE,
        '创作宪法 category 为空，无法核对本章分类归属；修复动作：补全分类字段后重评 category 维度。',
        '正文未出现「师兄吃下锅气菜后显出毒斑」这一必需事件，本章要求的事件缺失',
      ],
    });
    expect(report.kinds).toEqual(['missing_standard', 'prose_hardline', 'outline_alignment']);
    expect(report.status).toBe(422);
    expect(report.sections).toHaveLength(3);
    expect(report.sections[0]).toContain('执行标准未落实');
    expect(report.sections[1]).toContain('正文硬红线');
    expect(report.sections[2]).toContain('本章大纲一致性');
    // detail 必须是单行，否则日志 grep 失效。
    expect(report.detail.includes(String.fromCharCode(10))).toBe(false);
  });

  it('treats every wording of "the standard itself is empty" as a missing standard, not an outline mismatch', () => {
    const wordings = [
      '创作宪法未设置分类：属未执行标准，必须补齐后才能继续（不得用默认值或平台推荐替代）',
      '项目卡 creativeConstitution 中 category、pov、targetAudience 为空，而世界观档案与本章详细大纲明确为现实题材、第一人称限知；本条正文遵循高权威的详细大纲与世界观档案，不影响判定。',
      '创作宪法 pov 为空，无法核验第一人称临场感与视角一致性；修复动作：补全POV字段后重评 pov 维度。',
    ];
    for (const text of wordings) {
      const report = classifyGateFailure({ evaluationStatus: 'evaluated', contradictions: [text] });
      expect(report.kinds).toEqual(['missing_standard']);
      expect(report.prefix).toBe('执行标准未落实，正文未保存');
      // 只有「执行标准本身为空」才 retryable=false：重跑模型只会拿到同样的阻断。
      expect(report.retryable).toBe(false);
    }
  });

  it('reports a reviewer outage as not_evaluated / 503 without pretending it is an outline verdict', () => {
    const report = classifyGateFailure({
      evaluationStatus: 'not_evaluated',
      contradictions: ['评审调用失败：连接超时'],
    });
    expect(report.kinds).toEqual(['review_incomplete']);
    expect(report.status).toBe(503);
    expect(report.sections[0]).toContain('评审未完成');
    // 评审器故障不是正文缺陷，必须仍可重试。
    expect(report.retryable).toBe(true);
  });


  it('把「本章详细大纲本身不足」报成大纲问题(422)，而不是评审器故障(503)', () => {
    // 反例：正文写得再好也没用，缺的是大纲；报成 503「评审器故障」会让作者去反复重试评审，
    // 这就是「同一个问题反反复复出现」的一种。
    const report = classifyGateFailure({
      evaluationStatus: 'not_evaluated',
      missing: [OUTLINE_PRECONDITION_MARKER],
    });
    expect(report.kinds).toEqual(['outline_alignment']);
    expect(report.status).toBe(422);
    expect(report.prefix).toContain('本章详细大纲不足');
    // 重跑模型不可能把短大纲变长，因此不浪费一次整章生成。
    expect(report.retryable).toBe(false);
  });
  it('keeps the machine-readable quality gate prefix so the retry loop still recognises a gate rejection', () => {
    const report = classifyGateFailure({
      evaluationStatus: 'evaluated',
      topic: 'quality_gate',
      gateStatus: 'blocked',
      buckets: { prose_hardline: ['对话占比不足'] },
    });
    expect(report.prefix.startsWith('质量 Gate ')).toBe(true);
    expect(gateFailureLabel(report)).toBe('正文质量问题');
    const error = new GateRejectionError(report, '正文内容');
    expect(isGateRejection(error)).toBe(true);
    expect(error.retryable).toBe(true);
    expect(error.generatedContent).toBe('正文内容');
  });

  it('识别 real-llm 抛出的 GeneratedQualityGateError，并让报告跨 Chain 边界存活', () => {
    const report = classifyGateFailure({
      evaluationStatus: 'evaluated',
      topic: 'quality_gate',
      gateStatus: 'blocked',
      buckets: { missing_standard: ['constitution.category：未设置平台分类'] },
    });
    // real-llm.service 抛的是它自己的错误类，只保留结构化标记与固定 name。
    // 判定必须只认标记、不认类身份：否则节点会把 Gate 拒绝误记成中性「执行错误」，
    // 报告随之丢失，上游只剩「缺少世界观」这类下游症状，「同一个问题反反复复出现」就此重现。
    const producedByRealLlm = Object.assign(new Error(report.message), {
      name: 'GeneratedQualityGateError',
      gateRejection: true,
      report,
      generatedContent: '候选正文',
    });
    expect(isGateRejection(producedByRealLlm)).toBe(true);

    // 节点结果必须把报告原样留住，上游据此才拿得到真实成因。
    const nodeResult = { nodeId: 'node_1_foundation', status: 'failed', error: report.message, gateReport: report };
    expect(firstGateReportFromChain({ nodeResults: [nodeResult] })).toEqual(report);

    // 反面用例：报告被压成字符串后的节点结果不得被当成有报告，防止退化被静默接受。
    expect(firstGateReportFromChain({
      nodeResults: [{ nodeId: 'node_1_foundation', status: 'failed', error: report.message }],
    })).toBeNull();
  });

  it('never re-guesses the category from text once structured buckets are supplied', () => {
    const report = classifyGateFailure({
      evaluationStatus: 'evaluated',
      topic: 'quality_gate',
      gateStatus: 'failed',
      // 文本看起来像「标准缺失」，但调用方已按结构化 ruleId 判定它属于正文质量问题：
      // 传了 buckets 就必须原样采信，不得再做中文猜测。
      buckets: { prose_hardline: ['创作宪法 category 为空，无法核对本章分类归属'] },
    });
    expect(report.kinds).toEqual(['prose_hardline']);
    expect(report.retryable).toBe(true);
  });

  it('falls back to a non-silent outline report when the gate failed with no reason attached', () => {
    const report = classifyGateFailure({ evaluationStatus: 'evaluated', topic: 'outline_alignment' });
    expect(report.kinds).toEqual(['outline_alignment']);
    expect(report.sections[0]).toContain('本章大纲一致性');
    expect(report.prefix).toBe('本章大纲一致性未通过，正文未保存');
  });

  describe('跨 Chain 边界透传 Gate 报告', () => {
    const report = classifyGateFailure({
      evaluationStatus: 'evaluated',
      topic: 'quality_gate',
      gateStatus: 'blocked',
      buckets: { prose_hardline: ['platform.category_word_scale：目标总字数超出该平台分类头部实测体量'] },
    });

    it('按形状校验报告，缺字段的残片不得被当成报告用', () => {
      expect(isGateFailureReport(report)).toBe(true);
      expect(isGateFailureReport(null)).toBe(false);
      expect(isGateFailureReport({ message: '看起来像报告' })).toBe(false);
      expect(isGateFailureReport({ ...report, retryable: undefined })).toBe(false);
      expect(isGateFailureReport({ ...report, kinds: 'prose_hardline' })).toBe(false);
    });

    it('从节点结果里取出报告，跳过没有报告的节点', () => {
      expect(firstGateReportFromChain({ nodeResults: [{ nodeId: 'a' }, { nodeId: 'b', gateReport: report }] })).toEqual(report);
      expect(firstGateReportFromChain({ nodeResults: [{ nodeId: 'a' }] })).toBeNull();
      expect(firstGateReportFromChain({})).toBeNull();
      expect(firstGateReportFromChain(undefined)).toBeNull();
      // 形状不符的 gateReport 不得被采信（宁可报下游症状，也不报一份残缺报告）
      expect(firstGateReportFromChain({ nodeResults: [{ gateReport: { message: 'x' } }] })).toBeNull();
    });

    it('重建后的拒绝仍是 Gate 拒绝，且状态码与文案原样保留（不降级、不改 severity）', () => {
      const relayed = gateRejectionFromReport(report);
      expect(isGateRejection(relayed)).toBe(true);
      expect(relayed.report).toEqual(report);
      expect(relayed.retryable).toBe(report.retryable);
      expect(relayed.message).toBe(report.message);
      expect(relayed.generatedContent).toBe('');
    });
  });
});
