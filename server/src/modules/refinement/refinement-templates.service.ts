/**
 * 精修模板系统
 * 提供12+种精修模板，每条模板包含替换/添加/删除/重写规则
 */
import { Injectable } from '@nestjs/common';
import type { Template, TemplateRule } from './dto/refinement.dto';

@Injectable()
export class RefinementTemplatesService {
  private readonly templates: Template[] = [
    {
      id: 'concise',
      name: '简洁版',
      description: '删除冗余修饰词，精简句子结构，让表达更直接有力',
      category: 'style',
      tags: ['简洁', '精炼', '去除冗余'],
      rules: [
        { type: 'remove', pattern: '\\s*非常\\s*', description: '删除"非常"类冗余修饰' },
        { type: 'remove', pattern: '\\s*真的\\s*', description: '删除"真的"类冗余修饰' },
        { type: 'remove', pattern: '\\s*确实\\s*', description: '删除"确实"类冗余修饰' },
        { type: 'remove', pattern: '\\s*实际上\\s*', description: '删除"实际上"冗余表达' },
        { type: 'replace', pattern: '\\s*正在\\s*', replacement: '在', description: '"正在"简化为"在"' },
        { type: 'replace', pattern: '能够', replacement: '能', description: '精简为单字' },
        { type: 'replace', pattern: '可以', replacement: '可', description: '精简为单字' },
        { type: 'replace', pattern: '已经', replacement: '已', description: '精简为单字' },
        { type: 'remove', pattern: '\\s*地\\s*', description: '删除冗余的"地"字' },
        { type: 'remove', pattern: '\\s*着\\s*', description: '删除冗余的"着"字' },
        { type: 'rewrite', pattern: '她[的]*(脸上|面色|面容)\\s*', description: '将面部描写简化为直接动作' },
        { type: 'rewrite', pattern: '他[的]*(心里|心中|心底)\\s*', description: '将心理描写简化为直接陈述' },
      ],
      sample: { before: '他的心里感到非常难过和悲伤', after: '他很难过' },
    },
    {
      id: 'vivid',
      name: '生动版',
      description: '增加细节描写和感官体验，让文字更具画面感',
      category: 'style',
      tags: ['生动', '细节', '感官'],
      rules: [
        { type: 'add', pattern: '(天空|风|雨|阳光|月)', description: '在环境描写前增加感官修饰' },
        { type: 'add', pattern: '(听见|听到)', description: '在听觉后增加声音细节' },
        { type: 'add', pattern: '(看见|看到|望见)', description: '在视觉后增加视觉细节' },
        { type: 'add', pattern: '(闻到|嗅到)', description: '在嗅觉后增加气味描述' },
        { type: 'add', pattern: '(感到|觉得|感觉)', description: '在触觉后增加质感描述' },
        { type: 'replace', pattern: '说', replacement: '低语/轻声道/朗声道', description: '多样化"说"的表达' },
        { type: 'replace', pattern: '走', replacement: '踱步/疾行/踱步', description: '多样化"走"的表达' },
        { type: 'replace', pattern: '看', replacement: '凝视/扫视/瞥', description: '多样化"看"的表达' },
        { type: 'rewrite', pattern: '笑[了]', description: '扩展笑的描写' },
        { type: 'rewrite', pattern: '哭[了]', description: '扩展哭的描写' },
      ],
      sample: { before: '天黑了，他走在路上', after: '夜色如墨般倾泻而下，他缓步行走在青石板路上，脚下传来细碎的声响' },
    },
    {
      id: 'dialogue',
      name: '对话强化版',
      description: '增强对话表现力，丰富对话标签和语气',
      category: 'dialogue',
      tags: ['对话', '表现力', '标签'],
      rules: [
        { type: 'replace', pattern: '他说', replacement: '他压低声音道', description: '丰富对话标签' },
        { type: 'replace', pattern: '她说', replacement: '她轻声说道', description: '丰富对话标签' },
        { type: 'replace', pattern: '他问', replacement: '他试探着问', description: '丰富对话标签' },
        { type: 'replace', pattern: '她答', replacement: '她毫不犹豫地回答', description: '丰富对话标签' },
        { type: 'replace', pattern: '他喊', replacement: '他高声喊道', description: '丰富对话标签' },
        { type: 'add', pattern: '"', description: '在对话前增加动作描写' },
        { type: 'add', pattern: '?"', description: '在问句后增加表情描写' },
        { type: 'add', pattern: '!"', description: '在感叹句后增加情绪描写' },
      ],
      sample: { before: '他说："你好。"', after: '他微微颔首，压低声音道："你好。"' },
    },
    {
      id: 'suspense',
      name: '悬念版',
      description: '调整表达方式，增加悬念感和神秘氛围',
      category: 'plot',
      tags: ['悬念', '神秘', '紧张'],
      rules: [
        { type: 'rewrite', pattern: '原来', description: '避免过早揭示真相' },
        { type: 'rewrite', pattern: '是因为', description: '模糊因果关系' },
        { type: 'add', pattern: '[。！]', description: '在句尾添加暗示性省略或停顿' },
        { type: 'replace', pattern: '我知道', replacement: '我隐约感觉到', description: '降低确定性表达' },
        { type: 'replace', pattern: '肯定是', replacement: '恐怕是', description: '降低肯定语气' },
        { type: 'replace', pattern: '就是', replacement: '或许是', description: '增加不确定性' },
        { type: 'add', pattern: '门|窗|角落|暗处', description: '在场景词前增加神秘修饰' },
        { type: 'remove', pattern: '总之|说到底', description: '删除结论性表达' },
      ],
      sample: { before: '原来是有人在跟踪他', after: '暗处似乎有一道目光，如影随形' },
    },
    {
      id: 'emotional',
      name: '情绪版',
      description: '强化情绪渲染，增强情感冲击力',
      category: 'emotion',
      tags: ['情绪', '渲染', '感染力'],
      rules: [
        { type: 'rewrite', pattern: '伤[心心]', description: '扩展悲伤描写' },
        { type: 'rewrite', pattern: '高兴|开心|快乐', description: '扩展喜悦描写' },
        { type: 'rewrite', pattern: '生气|愤怒', description: '扩展愤怒描写' },
        { type: 'rewrite', pattern: '害怕|恐惧|紧张', description: '扩展恐惧描写' },
        { type: 'add', pattern: '(心跳|呼吸)', description: '增加生理反应描写' },
        { type: 'add', pattern: '(手|脚|身体)', description: '增加肢体语言描写' },
        { type: 'replace', pattern: '难过', replacement: '心如刀绞', description: '升级情感表达' },
        { type: 'replace', pattern: '开心', replacement: '欣喜若狂', description: '升级情感表达' },
      ],
      sample: { before: '他很伤心，哭了起来', after: '他的心像被撕裂一般，泪水无声地滑落，整个人瘫坐在地上' },
    },
    {
      id: 'scene',
      name: '场景版',
      description: '增强场景沉浸感，丰富环境描写',
      category: 'scene',
      tags: ['场景', '环境', '沉浸'],
      rules: [
        { type: 'add', pattern: '(房间|屋子|大厅)', description: '增加室内环境细节' },
        { type: 'add', pattern: '(街道|路|巷)', description: '增加室外环境细节' },
        { type: 'add', pattern: '(早上|清晨|黄昏|夜晚)', description: '增加时间氛围描写' },
        { type: 'add', pattern: '(春|夏|秋|冬)', description: '增加季节氛围描写' },
        { type: 'add', pattern: '(雨|风|雪|雾)', description: '增加天气氛围描写' },
        { type: 'add', pattern: '(声音|气味|温度)', description: '增加多感官环境描写' },
        { type: 'rewrite', pattern: '(来到|走进|进入)', description: '扩展进场描写' },
      ],
      sample: { before: '他走进咖啡馆', after: '推开沉重的木门，咖啡的醇香扑面而来，昏黄的灯光下，留声机正放着慵懒的爵士乐' },
    },
    {
      id: 'pacing',
      name: '节奏版',
      description: '调整句子长短和段落节奏，增强阅读韵律',
      category: 'style',
      tags: ['节奏', '长短句', '韵律'],
      rules: [
        { type: 'rewrite', pattern: '[，。]{10,}', description: '拆分过长句子' },
        { type: 'rewrite', pattern: '{2,5}', description: '合并过短句子' },
        { type: 'add', pattern: '。', description: '在连续长句中插入短句制造停顿' },
        { type: 'rewrite', pattern: '，然后|，接着|，随后', description: '删除多余连接词' },
        { type: 'rewrite', pattern: '突然|忽然|猛然', description: '优化突然性表达的位置' },
        { type: 'remove', pattern: '首先|其次|最后|第一|第二', description: '删除序号化表达' },
      ],
      sample: { before: '他走了很久，然后停了下来，接着看了看四周，随后又继续走', after: '他走了很久。忽然停住，扫视四周。片刻后，又继续前行。' },
    },
    {
      id: 'style-unify',
      name: '文风统一版',
      description: '保持全文风格和语体一致，检测并修正风格不匹配',
      category: 'style',
      tags: ['文风', '统一', '一致性'],
      rules: [
        { type: 'rewrite', pattern: '（[^）]*）', description: '统一括号使用风格' },
        { type: 'rewrite', pattern: '－|—|――', description: '统一破折号格式' },
        { type: 'rewrite', pattern: '……|。。|。。。', description: '统一省略号格式' },
        { type: 'rewrite', pattern: '\\d+%', description: '统一数字百分比表达' },
        { type: 'replace', pattern: '您', replacement: '你', description: '统一人称（默认第二人称）' },
        { type: 'remove', pattern: '呵呵|哈哈|嘿嘿', description: '删除口语化笑声音效' },
        { type: 'replace', pattern: '牛逼|尼玛|我靠', description: '过滤不当口语表达' },
      ],
      sample: { before: '他心里想着这件事（其实也不是什么大事）……然后呵呵一笑', after: '他心里想着这件事——其实也不是什么大事——然后轻笑一声' },
    },
    {
      id: 'classical',
      name: '古风版',
      description: '将现代白话转化为古风雅韵，融入文言表达',
      category: 'style',
      tags: ['古风', '文言', '雅致'],
      rules: [
        { type: 'replace', pattern: '我', replacement: '吾', description: '古风人称' },
        { type: 'replace', pattern: '你', replacement: '汝/君/卿', description: '古风人称' },
        { type: 'replace', pattern: '他', replacement: '彼/其', description: '古风人称' },
        { type: 'replace', pattern: '她', replacement: '伊', description: '古风人称' },
        { type: 'replace', pattern: '的', replacement: '之', description: '古风助词' },
        { type: 'replace', pattern: '说', replacement: '曰/言/道', description: '古风动词' },
        { type: 'replace', pattern: '看', replacement: '观/览/望', description: '古风动词' },
        { type: 'replace', pattern: '走', replacement: '行/步/趋', description: '古风动词' },
        { type: 'replace', pattern: '因为', replacement: '盖因/缘', description: '古风连词' },
        { type: 'replace', pattern: '所以', replacement: '故/是以', description: '古风连词' },
        { type: 'replace', pattern: '但是', replacement: '然/然则', description: '古风连词' },
        { type: 'remove', pattern: '了|着|过', description: '删除现代体助词' },
      ],
      sample: { before: '他因为这件事感到很高兴', after: '彼缘此事，心甚悦之' },
    },
    {
      id: 'commercial',
      name: '网文爽感版',
      description: '强化爽感节奏，增加情绪冲击点和期待感',
      category: 'plot',
      tags: ['爽文', '节奏', '期待感'],
      rules: [
        { type: 'rewrite', pattern: '他[终于]+', description: '强化"终于"的达成感' },
        { type: 'rewrite', pattern: '没想到|岂料', description: '强化反转表达' },
        { type: 'add', pattern: '！', description: '在关键处增加感叹句' },
        { type: 'replace', pattern: '有一点', replacement: '竟然', description: '提升意外感强度' },
        { type: 'replace', pattern: '可能', replacement: '必定', description: '增强主角的确定性' },
        { type: 'add', pattern: '(目光|气势|威压)', description: '在关键场景增加气势描写' },
        { type: 'remove', pattern: '或许|大概|似乎', description: '删除犹豫不确定的表述' },
      ],
      sample: { before: '他似乎变强了一点', after: '他的气势竟然暴涨！在场众人无不变色！' },
    },
    {
      id: 'literary',
      name: '文学修辞版',
      description: '运用比喻、拟人、排比等修辞手法提升文学性',
      category: 'style',
      tags: ['文学', '修辞', '比喻'],
      rules: [
        { type: 'add', pattern: '像[是]', description: '增加明确比喻' },
        { type: 'add', pattern: '仿佛|似乎|好似', description: '增加暗喻表达' },
        { type: 'add', pattern: '[，。]', description: '在并列结构中使用排比' },
        { type: 'rewrite', pattern: '(风|雨|夜|月|星)', description: '对自然意象进行拟人化' },
        { type: 'add', pattern: '(记忆|时光|岁月)', description: '增加抽象概念的具象描写' },
      ],
      sample: { before: '夜晚很安静，月亮挂在天上', after: '夜沉静如深海，月是一枚冷银的印章，悬在天鹅绒般的天幕上' },
    },
    {
      id: 'horror',
      name: '悬疑恐怖版',
      description: '营造恐怖氛围，增强心理压迫感和悬念',
      category: 'emotion',
      tags: ['恐怖', '悬疑', '心理'],
      rules: [
        { type: 'add', pattern: '(黑暗|阴影|暗处)', description: '增强黑暗意象' },
        { type: 'add', pattern: '(呼吸|心跳|脚步声)', description: '强化细微声响' },
        { type: 'add', pattern: '[。！]', description: '使用省略制造空白' },
        { type: 'rewrite', pattern: '背后|身后|后面', description: '强化身后的压迫感' },
        { type: 'replace', pattern: '什么', replacement: '什么东西', description: '模糊化的恐怖感' },
        { type: 'add', pattern: '(冰凉|阴冷|寒意)', description: '强化温度相关的恐惧感' },
      ],
      sample: { before: '他觉得背后有人，回头却什么也没看到', after: '背后传来一阵若有若无的凉意。他猛地回头——空无一人。' },
    },
    {
      id: 'logical',
      name: '逻辑一致性版',
      description: '检测和修正逻辑矛盾，确保前后文自洽',
      category: 'plot',
      tags: ['逻辑', '一致性', '自洽'],
      rules: [
        { type: 'rewrite', pattern: '左.*右|右.*左', description: '检查左右手/方向一致性' },
        { type: 'rewrite', pattern: '(先|前)后矛盾', description: '检查时间顺序冲突' },
        { type: 'remove', pattern: '突然.+又', description: '消除突然性重复表达' },
      ],
      sample: { before: '他右手受伤...他伸出右手', after: '他右手受伤...他伸出左手' },
    },
    {
      id: 'action',
      name: '动作强化版',
      description: '增强动作描写的张力和画面感',
      category: 'scene',
      tags: ['动作', '张力', '画面'],
      rules: [
        { type: 'add', pattern: '(拳|掌|腿|刀|剑)', description: '在打斗前增加蓄力描写' },
        { type: 'add', pattern: '(风|声|影)', description: '在动作后增加效果描写' },
        { type: 'replace', pattern: '躲', replacement: '闪/侧身', description: '升级闪避描写' },
        { type: 'replace', pattern: '挡', replacement: '格/架', description: '升级格挡描写' },
      ],
      sample: { before: '他躲开了攻击', after: '他侧身一闪，风声擦耳而过' },
    },
    {
      id: 'dialogue-natural',
      name: '对话自然版',
      description: '让对话更自然流畅，符合角色身份',
      category: 'dialogue',
      tags: ['对话', '自然', '身份'],
      rules: [
        { type: 'add', pattern: '"', description: '对话前增加角色动作或表情' },
        { type: 'replace', pattern: '你说', replacement: '你意思是', description: '更口语化' },
        { type: 'remove', pattern: '根据|鉴于|综上所述', description: '删除正式文书用语' },
      ],
      sample: { before: '"根据目前的情况，我建议我们离开"', after: '他皱着眉头看了看四周："此地不宜久留。"' },
    },
    {
      id: 'exposition',
      name: '背景说明优化版',
      description: '将直白的背景说明转化为自然的叙事融入',
      category: 'plot',
      tags: ['背景', '说明', '融入'],
      rules: [
        { type: 'rewrite', pattern: '他是.*的人|他有着|他拥有', description: '将说明转化为情节体现' },
        { type: 'rewrite', pattern: '要知道|值得一提的是', description: '移除说教式表达' },
        { type: 'add', pattern: '(记得|想起|回忆起)', description: '用回忆方式交代背景' },
      ],
      sample: { before: '要知道，他是个武功高强的人', after: '三招之内，他已制服了对手——这份身手，是他十年苦练的结果' },
    },
    {
      id: 'transitions',
      name: '过渡衔接版',
      description: '优化段落和场景之间的过渡衔接',
      category: 'style',
      tags: ['过渡', '衔接', '流畅'],
      rules: [
        { type: 'add', pattern: '[。！？]', description: '在场景切换处增加过渡句' },
        { type: 'rewrite', pattern: '与此同时|另一方面', description: '优化平行叙事衔接标记' },
        { type: 'add', pattern: '(第二天|次日|翌日)', description: '在时间跳跃前增加时间标记' },
      ],
      sample: { before: '他回到了营地。赵明远正在开会。', after: '他回到营地时，夜色已深。而在将军府内，赵明远的会议才刚刚开始。' },
    },
    {
      id: 'sensory',
      name: '五感增强版',
      description: '增加视觉/听觉/触觉/味觉/嗅觉多感官描写',
      category: 'scene',
      tags: ['五感', '感官', '沉浸'],
      rules: [
        { type: 'add', pattern: '(看|见|望)', description: '增加视觉细节' },
        { type: 'add', pattern: '(听|闻|声)', description: '增加听觉细节' },
        { type: 'add', pattern: '(摸|触|碰)', description: '增加触觉细节' },
        { type: 'add', pattern: '(香|臭|味)', description: '增加嗅觉细节' },
        { type: 'add', pattern: '(甜|苦|辣|咸)', description: '增加味觉细节' },
      ],
      sample: { before: '早晨的市场很热闹', after: '清晨的市场，叫卖声此起彼伏，油条的香气混着露水的清新扑面而来' },
    },
    {
      id: 'rhythm',
      name: '韵律节奏版',
      description: '通过押韵和句式反复增强文字的韵律感',
      category: 'style',
      tags: ['韵律', '押韵', '反复'],
      rules: [
        { type: 'rewrite', pattern: '{6,10}', description: '将关键段落的句子调整到相近字数' },
        { type: 'add', pattern: '[，。]', description: '在并列概念处使用反复句式' },
        { type: 'rewrite', pattern: '不.+不', description: '使用双重否定增强语势' },
      ],
      sample: { before: '他每天都在想这件事，让他很烦躁', after: '他日也想，夜也想，梦中也想——这件事像一根刺，扎在心口，拔不掉，忘不了' },
    },
    {
      id: 'flashback',
      name: '回忆插叙版',
      description: '将平铺直叙中的关键信息转为回忆/插叙手法',
      category: 'plot',
      tags: ['回忆', '插叙', '结构'],
      rules: [
        { type: 'add', pattern: '(记忆|回忆|想起)', description: '在关键信息前插入回忆触发' },
        { type: 'add', pattern: '(那时|当年|曾经)', description: '增加时间跳跃标记' },
        { type: 'rewrite', pattern: '以前曾经', description: '优化回忆引入方式' },
      ],
      sample: { before: '他曾在军队服役十年，练就了一身本领', after: '眼前的场景让他想起了一段往事——十年前，军营里的那些日夜...' },
    },
    {
      id: 'summarize',
      name: '精炼概括版',
      description: '将冗长段落精炼压缩，保留核心信息',
      category: 'style',
      tags: ['精炼', '压缩', '效率'],
      rules: [
        { type: 'remove', pattern: '也就是说|换句话说|简单来说', description: '删除解释性重复' },
        { type: 'rewrite', pattern: '{60,}', description: '将超长段落拆分为2~3个短段落' },
        { type: 'remove', pattern: '的[的]*的', description: '删除冗余的"的"字' },
      ],
      sample: { before: '简单来说，他说的意思也就是说他不同意这个提议', after: '他不同意。' },
    },
  ];

  findAll(category?: string): Template[] {
    if (category) {
      return this.templates.filter((t) => t.category === category);
    }
    return this.templates;
  }

  findById(id: string): Template | undefined {
    return this.templates.find((t) => t.id === id);
  }

  getCategories(): string[] {
    const cats = new Set(this.templates.map((t) => t.category));
    return Array.from(cats);
  }

  /**
   * 应用精修模板到指定内容
   */
  applyTemplate(templateId: string, content: string, options?: Record<string, unknown>): string {
    const template = this.findById(templateId);
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    let result = content;
    const appliedRules: string[] = [];

    for (const rule of template.rules) {
      const applied = this.applyRule(result, rule, options);
      if (applied !== result) {
        appliedRules.push(rule.description || rule.type);
        result = applied;
      }
    }

    return result;
  }

  /**
   * 获取模板的应用规则说明
   */
  getAppliedRules(templateId: string): TemplateRule[] {
    const template = this.findById(templateId);
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }
    return template.rules;
  }

  /**
   * 组合多个模板
   */
  applyTemplates(templateIds: string[], content: string): string {
    let result = content;
    for (const id of templateIds) {
      result = this.applyTemplate(id, result);
    }
    return result;
  }

  private applyRule(content: string, rule: TemplateRule, _options?: Record<string, unknown>): string {
    if (!rule.pattern) return content;

    switch (rule.type) {
      case 'replace': {
        const regex = this.buildRegex(rule.pattern);
        if (regex) {
          return content.replace(regex, rule.replacement || '');
        }
        return content;
      }
      case 'remove': {
        const regex = this.buildRegex(rule.pattern);
        if (regex) {
          return content.replace(regex, '');
        }
        return content;
      }
      case 'add':
        // 添加规则在mock中返回标注
        return content;
      case 'rewrite':
        // 重写规则返回标注
        return content;
      default:
        return content;
    }
  }

  private buildRegex(pattern: string): RegExp | null {
    try {
      return new RegExp(pattern, 'g');
    } catch {
      return null;
    }
  }
}
