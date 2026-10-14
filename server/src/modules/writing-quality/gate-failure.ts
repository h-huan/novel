/**
 * 唯一的 Gate 失败分类器 + 唯一的 Gate 拒绝错误类型。
 *
 * 为什么必须唯一：正文链路上有两个 Gate 抛错点——
 *   · real-llm.service 的统一质量 Gate（按创作宪法维度评分后的 issues）
 *   · chain.controller 的本章大纲一致性 / 硬红线 Gate（checkChapterAlignment 的结论）
 * 它们此前各自手写一句报错文案。后果是 chain.controller 侧无论真实成因是什么，
 * 一律打印「本章大纲一致性 Gate 未通过」——于是「硬红线文笔扫描命中」「执行标准根本没设置」
 * 都被读成「大纲不一致」。用户按报错去改大纲，改完仍然失败，报错一字不变，
 * 这就是「同一个问题反反复复出现」的直接原因。
 *
 * 分类只做归类：不降级 severity、不改 status、不把 blocking 变 advisory、
 * 不为缺标准填默认值。分类结果决定文案与 HTTP 状态，不决定是否阻断（阻断与否由上游 pass 决定）。
 */

import { isMissingStandardFinding } from './quality-issue';

/** 哪个 Gate 在报错。两个 Gate 的措辞不同，必须显式区分，否则同一句话会在两边各错一次。 */
export type GateTopic = 'quality_gate' | 'outline_alignment';

export type GateFailureKind =
  | 'missing_standard'
  | 'prose_hardline'
  | 'outline_alignment'
  | 'review_incomplete';

export interface GateFailureInput {
  evaluationStatus: 'evaluated' | 'not_evaluated';
  /** 默认 outline_alignment（chain.controller 的本章大纲一致性 Gate）。 */
  topic?: GateTopic;
  /** 质量 Gate 的原始状态字（如 failed）。用于保留既有的「质量 Gate <status>」前缀契约。 */
  gateStatus?: string;
  missing?: string[];
  contradictions?: string[];
  /**
   * 结构化分桶：调用方已经用结构化判据（ruleId / source）分好类时传它。
   * 传了就不再对文本做二次猜测——质量 Gate 的 issues 是结构化对象，靠中文文本猜类别会分叉口径。
   */
  buckets?: Partial<Record<GateFailureKind, string[]>>;
}

export interface GateFailureReport {
  topic: GateTopic;
  kinds: GateFailureKind[];
  /** 422 = 正文/标准本身未达标；503 = 评审器故障，可重试，不是正文缺陷 */
  status: number;
  prefix: string;
  /** 每个失败类别一段，供日志与界面分块显示 */
  sections: string[];
  /** 单行摘要，供 logger 输出（日志不能多行，否则 grep 失效） */
  detail: string;
  /** 完整报错正文：前缀 + 分段说明 */
  message: string;
  /**
   * 「重新生成一遍」能否改变结论。
   * false 只用于「执行标准本身为空」这一种：重跑模型只会拿到同样的阻断，多花 2 次全章生成的算力。
   * 它不改变阻断、不改变状态码，只决定要不要把同一次失败再喂回模型一次。
   */
  retryable: boolean;
}

/** 硬红线确定性扫描的统一前缀（hardline-scanner 与 checkChapterAlignment 共用此字面量） */
export const HARDLINE_FINDING_PREFIX = '【硬红线·确定性扫描·';

/** 该条审查结论是否来自确定性硬红线扫描（位置与原文精确可知，可做段落级精修） */
export function isHardlineFinding(text: string): boolean {
  return String(text || '').startsWith(HARDLINE_FINDING_PREFIX);
}

/**
 * 大纲前提缺失的唯一标记文本：本章详细大纲本身不足以作为正文验收依据。
 * 它不是评审器故障——重试评审不会改变结论，必须报成大纲的问题，
 * 否则作者会去反复重试评审，而真正该做的是补全本章详细大纲（这正是「同一个问题反反复复」的一种）。
 */
export const OUTLINE_PRECONDITION_MARKER = '本章详细大纲不足以作为正文验收依据';

const KIND_ORDER: GateFailureKind[] = ['missing_standard', 'prose_hardline', 'outline_alignment', 'review_incomplete'];

const KIND_LABEL: Record<GateTopic, Record<GateFailureKind, string>> = {
  outline_alignment: {
    missing_standard: '执行标准未落实',
    prose_hardline: '正文硬红线',
    outline_alignment: '本章大纲一致性',
    review_incomplete: '评审未完成',
  },
  quality_gate: {
    missing_standard: '执行标准未落实',
    prose_hardline: '正文质量问题',
    outline_alignment: '本章大纲一致性',
    review_incomplete: '评审未完成',
  },
};

const SECTION_TITLE: Record<GateTopic, Record<GateFailureKind, string>> = {
  outline_alignment: {
    missing_standard: '【执行标准未落实】项目卡片的执行标准本身为空，必须补齐后才能继续；这类问题不是正文写得不好，改写正文不会通过',
    prose_hardline: '【正文硬红线】确定性扫描命中的语言硬伤，位置与原文已知，可做段落级精确改写',
    outline_alignment: '【本章大纲一致性】按已设置标准与本章详细大纲评审出的缺失/冲突',
    review_incomplete: '【评审未完成】评审服务未给出可用结论，正文未作废、也未触发改写；请重试评审而不是重写正文',
  },
  quality_gate: {
    missing_standard: '【执行标准未落实】项目卡片的执行标准本身为空，必须补齐后才能继续；这类问题不是正文写得不好，改写正文不会通过',
    prose_hardline: '【正文质量问题】按已设置的执行标准评审出的正文缺陷',
    outline_alignment: '【本章大纲一致性】按已设置标准与本章详细大纲评审出的缺失/冲突',
    review_incomplete: '【评审未完成】正文尚未取得充分的证据化评审结论',
  },
};

function clean(list?: string[]): string[] {
  return (list || []).map(s => String(s).trim()).filter(Boolean);
}

/**
 * 归类一次 Gate 失败。
 *
 * not_evaluated 是唯一会整体改判的情形：评审器故障时我们并不知道正文是否对不上大纲，
 * 此时禁止把「评审调用失败」的原文当成「大纲不一致」的证据报给用户。
 */
export function classifyGateFailure(input: GateFailureInput): GateFailureReport {
  const topic: GateTopic = input.topic || 'outline_alignment';
  const missing = clean(input.missing);
  const contradictions = clean(input.contradictions);
  const all = [...missing, ...contradictions];

  const buckets: Record<GateFailureKind, string[]> = {
    missing_standard: [], prose_hardline: [], outline_alignment: [], review_incomplete: [],
  };
  if (input.buckets) {
    for (const kind of KIND_ORDER) buckets[kind] = clean(input.buckets[kind]);
  } else {
    buckets.prose_hardline = contradictions.filter(isHardlineFinding);
    buckets.missing_standard = all.filter(s => !isHardlineFinding(s) && isMissingStandardFinding(s));
    buckets.outline_alignment = all.filter(s => !isHardlineFinding(s) && !isMissingStandardFinding(s));
  }

  const kinds: GateFailureKind[] = [];
  const put = (kind: GateFailureKind, items: string[]) => {
    if (!items.length) return;
    kinds.push(kind);
    buckets[kind] = items;
  };

  // 大纲前提缺失是「本章详细大纲本身不达标」，与「评审服务挂了」是两码事：前者重试评审永远不会变。
  const outlinePreconditionOnly = input.evaluationStatus === 'not_evaluated'
    && all.length > 0 && all.every(s => s.includes(OUTLINE_PRECONDITION_MARKER));
  if (input.evaluationStatus === 'not_evaluated') {
    if (outlinePreconditionOnly) {
      // 报成大纲本身的问题（422），不冒充评审器故障让作者白等重试。
      put('outline_alignment', all);
    } else {
      // 评审器故障：只报「没评上」，原始失败原因作为证据保留，不冒充大纲结论。
      put('review_incomplete', buckets.review_incomplete.length
        ? buckets.review_incomplete
        : (all.length ? all : ['评审服务未返回可用结论']));
    }
  } else {
    for (const kind of KIND_ORDER) put(kind, buckets[kind]);
    if (kinds.length === 0) {
      // pass=false 但一个理由都没有：属于评审证据不足，按各自 Gate 的口径兜底上报，不静默放行。
      if (topic === 'quality_gate') put('prose_hardline', ['评审器判定未通过，但未给出任何可核对的问题条目']);
      else put('outline_alignment', ['审查器未确认正文执行本章详细大纲，且未给出具体缺失项']);
    }
  }

  const sections = kinds.map(kind => {
    const items = buckets[kind];
    const body = items.slice(0, 4).join('；');
    const more = items.length > 4 ? `（另有 ${items.length - 4} 项同类问题，见矛盾面板）` : '';
    return `${SECTION_TITLE[topic][kind]}：${body}${more}`;
  });

  const prefix = buildGateFailurePrefix(topic, input.gateStatus, kinds, outlinePreconditionOnly);

  return {
    topic,
    kinds,
    status: (input.evaluationStatus === 'not_evaluated' && !outlinePreconditionOnly) ? 503 : 422,
    prefix,
    sections,
    detail: sections.join('；'),
    message: `${prefix}：${sections.join(String.fromCharCode(10))}`,
    retryable: !(kinds.length === 1 && (kinds[0] === 'missing_standard' || (kinds[0] === 'outline_alignment' && outlinePreconditionOnly))),
  };
}

/**
 * 前缀是【机器可读契约】，不是随手写的文案：chain.controller 的重试循环一直靠
 * 「消息是否以 `质量 Gate <状态>` 开头」判断「这是 Gate 拒绝（保留正文、可再试一次）」
 * 还是「传输层故障（立即上抛）」。所以质量 Gate 的前缀必须继续以 `质量 Gate ` 开头。
 */
function buildGateFailurePrefix(topic: GateTopic, gateStatus: string | undefined, kinds: GateFailureKind[], outlinePreconditionOnly = false): string {
  if (outlinePreconditionOnly) {
    // 大纲前提缺失：缺的是大纲，不是正文、也不是评审器。重试评审/重写正文都不会变，直接讲清该做什么。
    return '本章详细大纲不足，正文未保存（大纲本身不达标，重试评审不会改变结论，请补全本章详细大纲）';
  }
  if (kinds.length === 1 && kinds[0] === 'missing_standard') {
    return '执行标准未落实，正文未保存';
  }
  if (topic === 'quality_gate') {
    const status = gateStatus || 'failed';
    if (kinds.includes('missing_standard')) return `质量 Gate ${status}（含执行标准未落实）`;
    if (kinds.length === 1 && kinds[0] === 'review_incomplete') return `质量 Gate ${status}（评审未完成）`;
    return `质量 Gate ${status}`;
  }
  if (kinds.length === 1) {
    switch (kinds[0]) {
      case 'prose_hardline': return '正文硬红线未通过，正文未保存';
      case 'outline_alignment': return '本章大纲一致性未通过，正文未保存';
      case 'review_incomplete': return '章节验收评审未完成，正文未保存且未触发改写（评审器故障，不是正文缺陷）；请重试评审，不要重写正文';
    }
  }
  return `未通过 Gate（${kinds.map(kind => KIND_LABEL[topic][kind]).join(' + ')}），正文未保存`;
}

/** 供日志与错误面板共用的「失败类别」短标签，例如 '执行标准未落实+正文硬红线'。 */
export function gateFailureLabel(report: GateFailureReport): string {
  return report.kinds.map(kind => KIND_LABEL[report.topic][kind]).join('+');
}

/** 正文 Gate 拒绝的唯一错误类型。继承 Error，不改 HTTP 语义；调用方用 isGateRejection 判定。 */
export const GATE_REJECTION_NAME = 'GateRejectionError';

export class GateRejectionError extends Error {
  readonly gateRejection = true;
  constructor(readonly report: GateFailureReport, readonly generatedContent: string = '') {
    super(report.message);
    this.name = GATE_REJECTION_NAME;
  }
  /** 重跑一次生成能否改变结论（见 GateFailureReport.retryable）。 */
  get retryable(): boolean { return this.report.retryable; }
}

/**
 * 是否为本项目抛出的 Gate 拒绝。
 * 只认结构化标记，不再用中文前缀正则嗅探——正则嗅探正是「文案一改、行为就变」的来源。
 */
export function isGateRejection(err: unknown): err is GateRejectionError {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { name?: unknown; gateRejection?: unknown };
  return candidate.gateRejection === true
    && (candidate.name === GATE_REJECTION_NAME || candidate.name === 'GeneratedQualityGateError');
}

/**
 * 判定一个物件是否为可用的 GateFailureReport（跨 Chain 边界回来的报告要做形状校验）。
 *
 * 为什么要校验形状：报告是从 Chain 结果里反序列化回来的普通对象，
 * 缺字段时若当成报告用，会把 undefined 拼进文案里，比不报更糟。
 */
export function isGateFailureReport(value: unknown): value is GateFailureReport {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GateFailureReport>;
  return typeof candidate.message === 'string' && candidate.message.length > 0
    && typeof candidate.detail === 'string'
    && typeof candidate.prefix === 'string'
    && typeof candidate.status === 'number'
    && typeof candidate.retryable === 'boolean'
    && Array.isArray(candidate.kinds)
    && Array.isArray(candidate.sections);
}

/**
 * 从 Chain 执行结果里取出第一个节点级 Gate 拒绝报告。
 *
 * 为什么必须从 Chain 结果里捞：Chain 引擎按节点返回结果，节点里抛出的 Error 实例
 * 会退化成一条 message 字符串，GateFailureReport 随之丢失。上游只剩下「缺少世界观」
 * 「volumes 为空」「没有解析到可保存的章节结构」这类**下游症状**，
 * 而真实成因（执行标准未落实 / 正文硬红线 / 平台分类体量越界 / 时间线自相矛盾）
 * 恰恰写在被丢掉的那份报告里。用户按症状方向去改，改完仍然失败，报错一字不变 ——
 * 这就是「同一个问题反反复复出现」的机制。
 *
 * 只做提取：不改 severity、不改 status、不把 blocking 变 advisory、不填默认值。
 */
export function firstGateReportFromChain(result: unknown): GateFailureReport | null {
  const nodeResults = (result as { nodeResults?: unknown } | null | undefined)?.nodeResults;
  if (!Array.isArray(nodeResults)) return null;
  for (const node of nodeResults) {
    const report = (node as { gateReport?: unknown } | null | undefined)?.gateReport;
    if (isGateFailureReport(report)) return report;
  }
  return null;
}

/**
 * 用链路里带回来的报告重建一份可被 isGateRejection 识别的拒绝。
 *
 * 用途：跨 Chain / 跨层传递后，上层需要按 Gate 语义继续处理（HTTP 状态、是否重试），
 * 但原始 Error 实例已经不存在了。这里只重建载体，报告内容原样透传。
 */
export function gateRejectionFromReport(report: GateFailureReport, generatedContent = ''): GateRejectionError {
  return new GateRejectionError(report, generatedContent);
}
