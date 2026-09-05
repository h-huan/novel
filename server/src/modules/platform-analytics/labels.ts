/**
 * 看板中文字典与"模型场景四大类"归并 —— 单一事实源
 *
 * 背景：数据库里存的是机器 key（fanqie / short_story / writing_climax / reader_hook / high …），
 * 直接展示给作者就是一堆看不懂的黑话。这里集中维护 key→大白话 的映射，以及把底层模型场景
 * 归并成作者在「设置」里能理解的四大类：架构搭建 / 正文写作 / 优化精修 / 日常。
 *
 * 约束：
 *  - 前端只展示这里返回的中文 label，不再各自维护一份词典（避免换 AI/换窗口又冒出英文 key）；
 *  - 未命中字典时回退为原始 key，绝不抛错、绝不伪造数据。
 */

// ───────────────────────── 目标平台 ─────────────────────────
export const PLATFORM_LABELS: Record<string, string> = {
  fanqie: '番茄',
  qimao: '七猫',
  qidian: '起点',
  zhihu: '知乎盐选',
  jinjiang: '晋江',
  douyin: '抖音',
  xiaohongshu: '小红书',
  rules_horror: '规则怪谈',
  custom: '自定义',
  generic: '通用',
  manual: '手动创建',
  '未标注': '未标注',
};
export function platformLabel(key: string | null | undefined): string {
  if (!key) return '未标注';
  return PLATFORM_LABELS[String(key).trim()] || String(key);
}

// ───────────────────────── 长 / 短篇类型 ─────────────────────────
export const STORY_TYPE_LABELS: Record<string, string> = {
  short_story: '短篇',
  long_novel: '长篇',
  script: '剧本',
  '未标注': '未标注',
};
export function storyTypeLabel(key: string | null | undefined): string {
  if (!key) return '未标注';
  return STORY_TYPE_LABELS[String(key).trim()] || String(key);
}

// ───────────────────────── 项目 / 章节状态 ─────────────────────────
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  in_progress: '进行中',
  ongoing: '进行中',
  completed: '已完结',
  finished: '已完结',
  done: '已完结',
  paused: '已暂停',
  archived: '已归档',
  draft: '草稿',
};
export const CHAPTER_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  writing: '写作中',
  in_progress: '写作中',
  reviewing: '质检中',
  completed: '已完成',
  finished: '已完成',
  done: '已完成',
  published: '已发布',
};
export function projectStatusLabel(k: string | null | undefined): string {
  return (k && PROJECT_STATUS_LABELS[String(k)]) || String(k || '未标注');
}
export function chapterStatusLabel(k: string | null | undefined): string {
  return (k && CHAPTER_STATUS_LABELS[String(k)]) || String(k || '未标注');
}

// ───────────────────────── 模型场景四大类 ─────────────────────────
export type ScenarioGroupKey = 'architecture' | 'writing' | 'polish' | 'daily';
export const SCENARIO_GROUP_LABEL: Record<ScenarioGroupKey, string> = {
  architecture: '架构搭建',
  writing: '正文写作',
  polish: '优化精修',
  daily: '日常/其它',
};
export const SCENARIO_GROUP_DESC: Record<ScenarioGroupKey, string> = {
  architecture: '动笔前的骨架：题材灵感、大纲、世界观、角色、组织、伏笔、时间线、标题',
  writing: '正文首版生成与续写（含日常章、高潮章）',
  polish: '写完后的打磨：润色、质检、一致性修订、各类精修',
  daily: '未归入上述三类的常规/兜底调用',
};
export const SCENARIO_GROUP_ORDER: ScenarioGroupKey[] = ['architecture', 'writing', 'polish', 'daily'];

/** 明确属于"架构搭建"的底层场景 / 步骤 key */
const ARCHITECTURE_KEYS = new Set([
  'idea_generate', 'inspiration', 'outline', 'world_building', 'character_design',
  'organization_map', 'foreshadowing', 'timeline', 'title',
]);

/**
 * 把底层 scenario / step_key 归并到四大类。
 * 规则用"包含/前缀"兜底，新增场景也能落进合理大类，而不是散落成一堆英文行。
 */
export function scenarioGroupOf(scenario?: string | null, stepKey?: string | null): ScenarioGroupKey {
  const keys = [stepKey, scenario].filter(Boolean).map(k => String(k).toLowerCase());
  for (const k of keys) {
    if (ARCHITECTURE_KEYS.has(k)) return 'architecture';
    // 正文写作：writing / writing_daily / writing_climax / body_first / body_length_retry /
    // body_alignment_repair / body_benchmark_refine / chapter_synthesis —— 同一章正文的首版与内部补轮全部算"正文写作"
    if (/^(writing|body_|chapter_synthesis)/.test(k)) return 'writing';
    // 优化精修：polish / refinement / review / *_repair（正文内部对齐轮已在上面归入写作）/ enhance_* / adapt_platform
    // quality_auto 是章节自动质检（语义评分），属打磨环节，不能落进"日常/其它"污染一次成功率。
    if (/^(polish|refinement|review|character_review|consistency_repair|quality_refine|quality_auto|enhance_|adapt_platform)/.test(k)) return 'polish';
    if (k === 'daily') return 'daily';
  }
  return 'daily';
}

// 底层场景 → 中文名（覆盖代码中实际会出现的 scenario / step_key）
export const SCENARIO_LABELS: Record<string, string> = {
  idea_generate: '题材/灵感生成',
  inspiration: '题材/灵感生成',
  outline: '大纲规划',
  world_building: '世界观设定',
  character_design: '角色设计',
  organization_map: '组织地图',
  foreshadowing: '伏笔设计',
  timeline: '时间线编排',
  title: '标题生成',
  writing: '正文写作',
  writing_daily: '正文写作·日常章',
  writing_climax: '正文写作·高潮章',
  body_first: '正文·首版',
  body_length_retry: '正文·补足字数',
  body_alignment_repair: '正文·对齐大纲精修',
  body_benchmark_refine: '正文·平台基准精修',
  chapter_synthesis: '章节综合',
  consistency_repair: '一致性修订',
  polish: '润色',
  refinement: '精修',
  review: '质检/一致性',
  character_review: '角色/一致性审查',
  quality_refine: '质检精修',
  quality_auto: '自动质检（语义评分）',
  enhance_opening: '开篇强化',
  enhance_reversal: '反转强化',
  adapt_platform: '平台风格改写',
  daily: '其它/日常生成',
  summary: '内容摘要/归纳',
  continuation: '正文续写',
  cross_chapter: '跨章归纳',
};
export function scenarioLabel(key: string | null | undefined): string {
  if (!key) return '未知步骤';
  return SCENARIO_LABELS[String(key)] || String(key);
}

// ───────────────────────── 质检问题类型（大白话） ─────────────────────────
export const QUALITY_ISSUE_LABELS: Record<string, string> = {
  reader_hook: '开篇抓不住读者',
  needs_hook: '缺少钩子',
  chapter_hook: '章尾钩子不足',
  low_retention: '留存点不足、容易弃读',
  retention_point: '留存点不足',
  emotional_payoff: '情绪回报/爽点不足',
  meme_point: '记忆点/爽点不足',
  needs_payoff: '缺少回报/爽点',
  pacing_risk: '节奏拖沓/失衡',
  flat_dialogue: '对话平淡',
  same_voice_characters: '角色说话一个腔调',
  needs_character_voice: '人物声音不鲜明',
  needs_asymmetry: '人物缺少反差',
  lack_of_subtext: '缺少潜台词、太直白',
  low_specificity: '描写空泛不具体',
  needs_detail: '细节不足',
  too_abstract: '过于抽象、没画面',
  too_expository: '背景/说明堆砌',
  over_explained: '讲太多、不会留白',
  ai_pattern_risk: 'AI 腔/套路感',
  template_repetition: '模板化重复',
  repeated_emotion_action: '情绪动作重复',
  event_sequence_risk: '事件顺序有风险',
  time_order_error: '时间顺序错误',
  timeline_conflict: '时间线冲突',
  causality_gap: '因果链断裂',
  label_fit: '平台/基调/风格/流派契合不足',
  punctuation: '标点符号不规范',
};
export function qualityIssueLabel(key: string | null | undefined): string {
  return (key && QUALITY_ISSUE_LABELS[String(key)]) || String(key || '未知');
}

// ───────────────────────── 一致性矛盾类型 / 严重级 ─────────────────────────
export const CHECK_TYPE_LABELS: Record<string, string> = {
  outline_alignment: '正文与大纲不符',
  character_consistency: '角色前后矛盾',
  world_rule: '世界观规则冲突',
  timeline: '时间线矛盾',
  foreshadow: '伏笔矛盾',
  hardline: '硬红线违规',
};
export function checkTypeLabel(key: string | null | undefined): string {
  return (key && CHECK_TYPE_LABELS[String(key)]) || String(key || '未知');
}
export const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  high: '较重',
  medium: '中等',
  low: '轻微',
};
export function severityLabel(key: string | null | undefined): string {
  return (key && SEVERITY_LABELS[String(key)]) || String(key || '未知');
}

// ───────────────────────── 生成失败分类 ─────────────────────────
export const ERROR_KIND_LABELS: Record<string, string> = {
  success: '成功',
  empty: '生成空白',
  truncated: '输出被截断',
  network_error: '网络错误',
  failed: '生成失败',
  '空内容': '生成空白',
  '输出截断': '输出被截断',
  '网络错误': '网络错误',
  '结构校验': '结构/格式不合格',
};
export function errorKindLabel(key: string | null | undefined): string {
  return (key && ERROR_KIND_LABELS[String(key)]) || String(key || '未知');
}

// ───────────────────────── 写作质量维度归并（作者视角，按网文重要性排序） ─────────────────────────
// 把 20+ 种底层 issue_type 归并成作者一眼能懂的几大写作维度，用于质量画像。
export type QualityDim =
  | 'hook' | 'pacing' | 'dialogue' | 'ai' | 'detail' | 'logic' | 'punctuation' | 'other';
export const QUALITY_DIM_LABEL: Record<QualityDim, string> = {
  hook: '开篇与钩子（读者留不留得住）',
  pacing: '节奏与信息密度',
  dialogue: '对话与人物',
  ai: 'AI痕迹与套路感',
  detail: '细节与画面感',
  logic: '时间线/因果逻辑',
  punctuation: '标点规范',
  other: '其它问题',
};
// 排序即看板展示顺序（越靠前越影响读者去留）
export const QUALITY_DIM_ORDER: QualityDim[] = ['hook', 'pacing', 'dialogue', 'ai', 'logic', 'detail', 'punctuation', 'other'];
const DIM_MAP: Record<string, QualityDim> = {
  reader_hook: 'hook', needs_hook: 'hook', chapter_hook: 'hook', low_retention: 'hook',
  retention_point: 'hook', emotional_payoff: 'hook', meme_point: 'hook', needs_payoff: 'hook',
  pacing_risk: 'pacing', too_expository: 'pacing', over_explained: 'pacing',
  flat_dialogue: 'dialogue', same_voice_characters: 'dialogue', needs_character_voice: 'dialogue',
  lack_of_subtext: 'dialogue', needs_asymmetry: 'dialogue',
  ai_pattern_risk: 'ai', template_repetition: 'ai', repeated_emotion_action: 'ai',
  low_specificity: 'detail', needs_detail: 'detail', too_abstract: 'detail',
  timeline_conflict: 'logic', time_order_error: 'logic', causality_gap: 'logic', event_sequence_risk: 'logic',
  label_fit: 'other',
  punctuation: 'punctuation',
};
export function qualityDimensionOf(issueType?: string | null): QualityDim {
  return (issueType && DIM_MAP[String(issueType)]) || 'other';
}

// ───────── 硬红线规则号 → 大白话（解释正文为什么被反复回炉） ─────────
export const HARDLINE_RULE_LABELS: Record<string, string> = {
  '15b': '叙述者解释一切（作者跳出来讲）',
  '15c': '叙述者跳出成作者评论',
  '15d': '对话里偷切作者口吻',
  '20a': '场景内人身状态自相矛盾',
  '26-short-para': '短句独立成段后多余空行',
  '26-uniform': '连续段落一样长、机械',
  '26b-staccato': '每句都强行换行（机械换行）',
  '28a': '冗余口头禅（我看到/我意识到）',
  '32': '姓名/称谓独占一行',
  '33': '段后空行过多',
  '34': '排比/动词堆砌',
  '35': '标点单一、逗号句号到底',
  '36': '热血空洞口号句',
  '37': '抽象情绪独白段',
  '38': '代词过多（他他他）',
  '39': '段内短句堆叠',
  '40': '章首缺强钩子',
  '40b-opening-conflict': '开篇冲突来得太晚',
  '41': '连续300字没有情绪起伏',
  '42': '对话太圆滑、不像真人',
  '43': '缺不完美/反常识细节',
  '44': '转场机械词（接着/然后）',
  '45': '缺具体数字、不真实',
  'dialogue-ratio': '对话占比过低',
  'dash-density': '破折号过密',
  'simile-density': '比喻过密',
  'time-density': '时间标签过密',
  'formula-sentence': '公式化句型（不是X而是Y）',
  'list-enumeration': '顿号排比罗列',
};
export function hardlineRuleLabel(ruleId: string | null | undefined): string {
  const k = String(ruleId || '').trim();
  return HARDLINE_RULE_LABELS[k] || (k ? `硬红线 ${k}` : '硬红线违规');
}
