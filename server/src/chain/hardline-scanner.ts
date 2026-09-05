import { resolveNovelStrategy } from './platform-benchmarks';

/**
 * 硬红线确定性扫描（纯文本、零 IO、零框架依赖）：跨所有平台与长短篇共用同一套判定（单一事实源）。
 * 生成链（ChainController）与写作质量质检（WritingQualityService）都调用本函数，禁止再各写一份。
 * 排版/节奏类规则按 profile.platform/storyType 分化；叙述者跳出、人身/事实矛盾、AI 腔等真硬伤跨平台严格。
 */
export interface HardlineProfile { platform?: string; storyType?: string; }
export interface HardlineFinding { ruleId: string; message: string; snippet: string; position: string; }

/**
 * 跨平台「语言硬伤」规则集合——区别于随平台分化的排版/节奏类（短段、对话占比、开篇冲突等）。
 * 这些是任何平台、长短篇都不允许的语言问题。质检扣分（writing-quality 的 HARDLINE_PENALTY）
 * 与生成端自动精修（refineToPlatformBenchmark）共用这同一份口径，保证「检测到什么就修什么」，
 * 不会出现质检按此扣分、生成阶段却不回炉的检测/修复口径错位。
 */
export const LANGUAGE_HARDLINE_RULE_IDS: readonly string[] = [
  '15b', '15c', '15d', '20a', '34', 'list-enumeration',
  '50-fragment-action-chain', '51-modal-particle-density', '52-env-imagery-repeat',
  '53-same-structure-parallel', '54-measure-word-mismatch',
];

/** 判断某条扫描命中是否属于跨平台语言硬伤（兼容规则号带后缀的情况） */
export function isLanguageHardline(ruleId: string): boolean {
  return LANGUAGE_HARDLINE_RULE_IDS.some(id => ruleId === id || ruleId.startsWith(id));
}

export function detectForbiddenTells(
    content: string,
    profile?: { platform?: string; storyType?: string },
  ): Array<{ ruleId: string; message: string; snippet: string; position: string }> {
    if (!content) return [];
    const findings: Array<{ ruleId: string; message: string; snippet: string; position: string }> = [];

    // ===== 平台化排版/节奏策略（关键：各平台是各平台风格，扫描器不得一刀切） =====
    // 番茄/抖音/七猫/小红书/规则怪谈等"短段落、快节奏"平台，短段独立成段、人名/称谓短句起段
    // 本就是正当排版（平台生成规则明确要求"段落短、每段不超过3行"）。若仍用"反短段"规则判违规、
    // 回炉要求拼成长段，就会与平台风格自相矛盾，导致第一稿大量误报、反复回炉永远修不干净。
    // 因此：排版/节奏类规则（26-short-para / 26-uniform / 32 / 39 / dialogue-ratio）按平台分化；
    //       作者跳出、人身状态矛盾、事实矛盾、AI 腔等"真硬伤"规则仍跨平台严格，不在此放宽。
    const hardlineStrategy = resolveNovelStrategy({
      platform: profile?.platform,
      storyType: profile?.storyType,
    });
    const shortPacingPlatforms = new Set(['fanqie', 'douyin', 'qimao', 'xiaohongshu', 'rules_horror']);
    const allowShortParagraph =
      hardlineStrategy.pacing === 'very_high' ||
      shortPacingPlatforms.has(hardlineStrategy.id as string);
    // 非短段平台只拦截更碎的片段（18→12），降低对正常短句的误报
    const shortParaMaxLen = allowShortParagraph ? 0 : 12;
    // 连续等长段容忍度：短段平台天然段落都不长、容易等长，放宽到 8%（几乎完全一致才判）
    const uniformTolerance = allowShortParagraph ? 0.08 : 0.15;
    // 第一人称纪实/悬疑内心流（知乎盐选、规则怪谈）对话天然偏少，对话占比红线由 8% 降到 5%
    const lowDialoguePlatform = hardlineStrategy.id === 'zhihu' || hardlineStrategy.id === 'rules_horror';
    // 对话占比红线下限分三档：高对话强推进平台(番茄/七猫/抖音/小红书)15%；第一人称内心流(知乎盐选/规则怪谈)5%；其余 8%
    // 注：此集合须与 platform-benchmarks 平台表的免费短章高对话平台保持同步（rules_horror 虽为 very_high 但走内心流低档）
    const highDialoguePlatforms = new Set(['fanqie', 'qimao', 'douyin', 'xiaohongshu']);
    const isHighDialogue = highDialoguePlatforms.has(hardlineStrategy.id as string);
    const dialogueMinRatio = isHighDialogue ? 0.15 : lowDialoguePlatform ? 0.05 : 0.08;
    // 高对话平台的"期望值"（写进提示，红线 15% 是回炉线，期望冲到 30%）
    const dialogueExpectPct = isHighDialogue ? 30 : Math.round(dialogueMinRatio * 100);
    // 极高节奏平台(番茄/抖音/规则怪谈)：核心冲突/危机必须在前 300 字"实质"出现（不只看标点钩子）
    const requireEarlyConflict = hardlineStrategy.pacing === 'very_high';

    // 段落切分：连续空行视为分段；前后空白 trim
    const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const slice = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

    // ===== 15c 叙述者跳出成为作者评论者（硬红线） =====
    const hardTells15c = [
      // "我写的 / 我本来想写 / 我准备写 + 剧情/场景/角色"
      /我(本来|原本|原想|原准备|本来想|本来准备|一直想)?\s*(想|准备|打算)?\s*写\s*(这|那|个|这场|那个|一个)?/,
      /我(把|把这个|把那|把那个)\s*(故事|结局|剧情|人物|角色|场景|设定)/,
      // 元叙述/作者口吻
      /(作者|编者|笔者)\s*(写|觉得|也|认为|决定|在这里|写到这里)/,
      /作者.{0,6}(为难|为难|叹气|摇头|心里|也很)/,
      /作为(作者|写手|创作者|笔者)/,
      // 评论剧情本身
      /没有(反转|救场|救兵|救赎|第二季|续集|伏笔|埋伏笔)/,
      /(怎么|无论|反正)\s*.{0,8}写\s*都?\s*比.{1,12}强/,
      /这就是\s*(我)?\s*(一)?辈子\s*(写过的?)?(最|写)/,
    ];
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      for (const pat of hardTells15c) {
        if (pat.test(p)) {
          findings.push({
            ruleId: '15c',
            message: '叙述者跳出成为作者评论者（硬红线）',
            snippet: slice(p),
            position: `第 ${i + 1} 段`,
          });
          break;
        }
      }
    }

    // ===== 15b 叙述者解释一切 =====
    const hardTells15b = [
      /我(感到|觉得|意识到|知道|明白|懂得|体会到)\s*[^。！？]{0,15}[，。,]?\s*因为/,
      /我(很难过|很痛苦|很不安|很复杂|很遗憾|很高兴|很开心|很失落|很彷徨|很纠结)\s*[，。,]?\s*因为/,
      // 第三人称"叙述者解释一切"变体：手册/规则解释 + 回溯式"曾经…从那以后"前情交代
      /手册上写(过|着)|维修手册|说明书|操作规范|按照规定|按照规则|从那以后|从此以后/,
      // 叙述者宣布"本该/就该…但…还是"的逻辑洞（"半年前系统就该把这栋楼标成灰色区域，
      // 送单路线自动绕开，但订单还是推了过来"）——刻意制造悬念却留下未交代的因果缺口。
      /(本该|就该|应该|本应|理应|按理).{0,30}(但|却|可).{0,20}(还是|依然|仍然|居然|竟)/,
    ];
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      for (const pat of hardTells15b) {
        if (pat.test(p)) {
          findings.push({
            ruleId: '15b',
            message: '叙述者替读者下结论解释情绪因果',
            snippet: slice(p),
            position: `第 ${i + 1} 段`,
          });
          break;
        }
      }
    }

    // ===== AI 公式句型密度（"不是X而是Y""不仅X而且Y""与其X不如Y"） =====
    // 经济学人/网文编辑：这类公式句是 AI 第一指纹。偶现 1-2 处尚可，全文 ≥3 处即判违规回炉。
    const formulaPatterns = [
      /不是[^，。！？]{1,18}而是/,
      /不仅[^，。！？]{1,18}而且/,
      /与其[^，。！？]{1,18}不如/,
    ];
    const formulaJoins = paragraphs.join('\n');
    const formulaAll = new RegExp(`(${formulaPatterns.map(p => p.source).join('|')})`, 'g');
    let formulaHits = 0;
    const formulaExamples: string[] = [];
    let fmat: RegExpExecArray | null;
    while ((fmat = formulaAll.exec(formulaJoins)) !== null) {
      formulaHits++;
      if (formulaExamples.length < 3) formulaExamples.push(fmat[0].trim().slice(0, 30));
    }
    if (formulaHits >= 3) {
      findings.push({
        ruleId: 'formula-sentence',
        message: `AI 公式句型过多（命中 ${formulaHits} 次"不是X而是Y/不仅X而且Y/与其X不如Y"，应直接陈述正面意思）`,
        snippet: formulaExamples.join(' / '),
        position: '全文',
      });
    }

    // ===== 密度类 AI 指纹（破折号/比喻/时间戳过密，联网实证：人类破折号 1-2/千字，
    //       AI 3-8 倍；比喻"一段最多一个"。密度超阈值即回炉，禁止以标点/修辞堆砌充字数） =====
    const dashCount = (content.match(/——/g) || []).length;
    const dashHanLen = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length || 1;
    const dashPerKilo = dashCount / (dashHanLen / 1000);
    // 与生成端硬红线第15条同口径：每千字≤2处；设6处起判量，避免极短章误判
    if (dashCount >= 6 && dashPerKilo > 2) {
      findings.push({
        ruleId: 'dash-density',
        message: `破折号过密（${dashCount} 处、约 ${dashPerKilo.toFixed(1)} 处/千字，人类约 1-2 处/千字）。绝大多数停顿改用逗号、句号、冒号，单段最多1处，删掉多余破折号让句子自然承接`,
        snippet: slice(content.slice(0, content.length), 60),
        position: '全文',
      });
    }
    const simileDensity = (content.match(/(像|仿佛|如同|宛如|犹如|好像|好似)[^，。；：！？\n]{2,12}/g) || []).length;
    if (simileDensity > 15) {
      const simExamples = (content.match(/(像|仿佛|如同|宛如|犹如|好像|好似)[^，。；：！？\n]{2,12}/g) || []).slice(0, 3).map(s => s.trim()).join(' / ');
      findings.push({
        ruleId: 'simile-density',
        message: `比喻过密（${simileDensity} 处"像/仿佛/如同…"，一段最多 1 个且须服务情绪或画面）。删掉为修辞而修辞的比喻，优先具体动作`,
        snippet: simExamples,
        position: '全文',
      });
    }
    const timeDensity = (content.match(/\d+月\d+日|\d+:\d+|\d+点|凌晨|傍晚|午夜|深夜|上午|下午|早晨|中午|还剩\d+分钟/g) || []).length;
    if (timeDensity > 15) {
      findings.push({
        ruleId: 'time-density',
        message: `时间标签过密（${timeDensity} 处"X点/X月X日/凌晨/傍晚…"）。不必每幕都报时间，让读者从光线/动作/对话自然感知时间流逝；同一地址/专名重复 >5 次也须删改`,
        snippet: slice(content, 60),
        position: '全文',
      });
    }
    // 顿号排比列表：连续 ≥5 项"XX、"（"取餐、核对编号、骑车、等灯、敲门、递出去"）是 AI 动作清单指纹。
    // 阈值保持 {4,}=5 项（N 项并列只有 N-1 个顿号）：4 项同构由规则53专管，此处若降到 4 项会误伤
    // “苹果、香蕉、橘子、葡萄”这类正常名词并列；片段放宽到 2-6 字以容纳动宾短语。
    const listEnumeration = (content.match(/([一-鿿]{2,6}[、]){4,}/g) || []).length;
    if (listEnumeration >= 1) {
      const listEx = (content.match(/([一-鿿]{2,6}[、]){4,}/g) || []).slice(0, 2).map(s => s.trim().slice(0, 30));
      findings.push({
        ruleId: 'list-enumeration',
        message: `顿号动作清单 ${listEnumeration} 处（连续 ≥5 项"XX、"罗列）。只保留 2 个核心项并写出具体结果，其余删掉，避免"罗列清单"；相同动词前缀的同构排比（带了A、带了B…）见规则53`,
        snippet: listEx.join(' / '),
        position: '全文',
      });
    }
    // 对话占比过低：爆款网文对话占比高（用对话推进剧情/交代设定/制造冲突）。
    // 全章几乎无对话=大段独白+环境描写，是 AI 文的典型形态。阈值 8%。
    const dialogueContent = (content.match(/[“"「][^”"」]{1,80}[”"」]/g) || []).join('').replace(/\s/g, '');
    const plainTotal = content.replace(/\s/g, '');
    const dialogueRatio = plainTotal.length > 0 ? dialogueContent.length / plainTotal.length : 0;
    if (dialogueRatio < dialogueMinRatio) {
      findings.push({
        ruleId: 'dialogue-ratio',
        message: `对话占比仅 ${(dialogueRatio * 100).toFixed(1)}%（低于本平台 ${(dialogueMinRatio * 100).toFixed(0)}% 红线下限，期望≥${dialogueExpectPct}%；要用对话推进剧情、交代设定、制造冲突）。当前大段内心独白+环境描写，应把推理、交代、交锋改成一来一回的人物对话（电话、他人搭话、自言自语、多人场面），连续叙述不超过2段就用对话打断`,
        snippet: slice(content, 60),
        position: '全文',
      });
    }

    // ===== 15d 第一人称对话框里偷切作者口吻 =====
    // 抓所有对话引号内容（含 ""/""/「」），检查是否混入作者口吻
    const dialoguePattern = /"[^"\n]{1,200}"|"[^"\n]{1,200}"|「[^」\n]{1,200}」/g;
    let dialogueMatch: RegExpExecArray | null;
    while ((dialogueMatch = dialoguePattern.exec(content)) !== null) {
      const inside = dialogueMatch[0];
      if (/(作为作者|作为创作者|作者的我|我的写作|我写的故事|反正怎么写|我怎么写|我来写这|我来写这个)/.test(inside)) {
        findings.push({
          ruleId: '15d',
          message: '第一人称对话框里偷切作者口吻',
          snippet: slice(inside, 60),
          position: `对话段`,
        });
      }
    }

    // ===== 20a 场景内人身状态前后矛盾 =====
    const sleepIndicators = /(睡着|睡过去|闭眼|眼皮打架|困得要死|昏过去|晕倒|失明|失聪|什么都看不见|眼前一黑|失去意识)/;
    // 唤醒感知不仅限于屏幕：盯书本/盯字/盯人/盯周围/睁眼看都算"需要视觉通道开启"，
    // 把"眼皮打架/睡着了"与"盯着那行字看了十秒"组合视为矛盾，是用户截图里反复命中的模式。
    const awakePerceiveScreen = /(盯\s*.{0,4}(屏幕|手机|电脑|笔记本|行|字|书|脸|人|周围|那|这)|睁眼\s*(看|盯|望)|看\s*.{0,4}(屏幕|手机|电脑|笔记本|行|字|书|脸))/;
    // 同段
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (sleepIndicators.test(p) && awakePerceiveScreen.test(p)) {
        findings.push({
          ruleId: '20a',
          message: '场景内人身状态前后矛盾（同段"睡着/眼皮打架"+盯着屏幕/书本/字）',
          snippet: slice(p),
          position: `第 ${i + 1} 段`,
        });
      }
    }
    // 跨段：上段睡/困，下段立刻盯屏幕/书本/字
    for (let i = 0; i < paragraphs.length - 1; i++) {
      const prev = paragraphs[i];
      const nextStart = paragraphs[i + 1].slice(0, 24);
      if (sleepIndicators.test(prev) && /^(我)?\s*(盯|睁|看)\s*.{0,4}(屏幕|手机|电脑|笔记本|行|字|书|脸|周围)/.test(nextStart)) {
        findings.push({
          ruleId: '20a',
          message: '跨段人身状态矛盾（前段"睡着/眼皮打架"紧接下段"盯着屏幕/书本/字"）',
          snippet: `${slice(prev, 24)} || ${slice(nextStart, 24)}`,
          position: `第 ${i + 1}-${i + 2} 段`,
        });
      }
    }

    // ===== 26 短句独立成段后跟空行 =====
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      // 短段快节奏平台整类放行（短句独立成段是其正当排版）；其余平台只拦截 <12 字的极短碎片
      if (!allowShortParagraph && p.length < shortParaMaxLen && /[。.!！？?]$/.test(p) && i < paragraphs.length - 1) {
        findings.push({
          ruleId: '26-short-para',
          message: `短句"${p}"独立成段后跟空行（应与上下文拼接为一段）`,
          snippet: p,
          position: `第 ${i + 1} 段`,
        });
      }
    }

    // ===== 26 连续 3 段同等字符长度 =====
    const lens = paragraphs.map(p => p.length);
    for (let i = 0; i < paragraphs.length - 2; i++) {
      const a = lens[i], b = lens[i + 1], c = lens[i + 2];
      if (a < 8 || b < 8 || c < 8) continue; // 跳过极短段
      const avg = (a + b + c) / 3;
      if (
        Math.abs(a - avg) / avg < uniformTolerance &&
        Math.abs(b - avg) / avg < uniformTolerance &&
        Math.abs(c - avg) / avg < uniformTolerance
      ) {
        findings.push({
          ruleId: '26-uniform',
          message: `连续 3 段同等长度（均约 ${Math.round(avg)} 字），缺乏节奏变化`,
          snippet: `${slice(paragraphs[i], 20)} || ${slice(paragraphs[i + 1], 20)} || ${slice(paragraphs[i + 2], 20)}`,
          position: `第 ${i + 1}-${i + 3} 段`,
        });
        break; // 只报一次避免噪音
      }
    }

    // ===== 28a 冗余 filter words =====
    // 含第三人称变体（"他记得…""她看到…"）并纳入"记得"，且在全文子句级检测（不限于段首）：
    // AI 常用"X记得/看到…"给前情加滤镜，删掉后信息照样成立（"这个信号的节奏——是那个人
    // 惯用的发报习惯"），保留反而拖沓。命中 ≥1 处即回炉。
    const filterWordUse = /(我|他|她)\s*(看到|听到|意识到|注意到|感受到|发觉|察觉到|发现|记得)\s*[^。！？]{0,25}[，。]/g;
    let fwMatch: RegExpExecArray | null;
    let fwCount = 0;
    const fwExamples: string[] = [];
    while ((fwMatch = filterWordUse.exec(content)) !== null) {
      fwCount++;
      if (fwExamples.length < 3) fwExamples.push(fwMatch[0].trim().slice(0, 40));
    }
    if (fwCount >= 1) {
      findings.push({
        ruleId: '28a',
        message: `冗余 filter words（"X记得/看到/意识到…"作主语框架，命中 ${fwCount} 处）`,
        snippet: fwExamples.join(' / '),
        position: '全文',
      });
    }

    // ===== 32 姓名/角色独占一行（用户截图反复出现的"姓名莫名其妙独占一行"） =====
    // 模式：段落以 2-4 字中文姓名/称谓开头 + 段落较短（≤ 30 字）+ 段落有完整标点收尾——
    // 视觉上"姓名被孤立"成段，与上下文分离。区分真正的姓名段（"赵明会死。""老爷进来了。"）
    // 与合理短句（"我靠在墙边。"），用动作/介词/代词白名单排除。
    const nameParagraphStarters = /^(走|跑|站|坐|看|听|说|想|拿|拉|开|关|写|读|做|回|转|到|去|来|靠|摸|端|捧|托|搬|扔|推|敲|挤|涌|冒|冲|扑|拦|挡|握|抓|按|捏|撕|扯|拽|擦|伸|缩|跨|迈|踩|踏|踢|撞|砸|抖|振|摇|晃|摆|翻|滚|爬|滑|溜|飘|落|沉|浮|倒|塌|断|裂|碎|烧|烤|煮|炒|煎|蒸|炖|熬|沏|泡|灌|注|流|淌|滴|洒|溅|漏|溢)/;
    const nonNameHeads = ['这个', '那个', '什么', '怎么', '为什么', '哪个', '这些', '那些', '如此', '这样', '那样', '一样', '一直', '一下', '一些', '一定', '一次', '一边', '一旦', '万一', '曾经', '已经', '正在', '慢慢', '突然', '然后', '于是', '接着', '此后', '当晚', '今天', '明天', '昨天', '刚才', '此刻', '眼前', '眼里', '心里', '手上', '背上', '肩上', '脸上', '头上', '脚下', '旁边', '对面', '远处', '近处', '身后', '身前'];
    // 代词 + 动词开头（第一人称动作段常见模式），排除这种"我靠在/我走到..."
    const pronounVerbStarters = new Set(['我靠', '我走', '我看', '我听', '我拿', '我拉', '我坐', '我站', '我回', '我转', '我到', '我去', '我来', '我摸', '我说', '我想', '我低', '我抬', '我盯', '我伸', '我握', '我抓', '我按', '我推', '我敲', '我擦', '我翻', '我爬', '我倒', '我沉', '我开', '我关', '我写', '我读', '我做', '我端', '我搬', '我扔', '我挤', '我握', '他在', '她在', '它在']);
    for (let i = 0; i < paragraphs.length; i++) {
      if (allowShortParagraph) continue; // 短段快节奏平台：人名/称谓短段独立成段是正当排版，整类放行
      const p = paragraphs[i];
      if (p.length > 30) continue;
      if (p.length < 4) continue;
      const headMatch = p.match(/^[\u4e00-\u9fff]{2,4}/);
      if (!headMatch) continue;
      const head = headMatch[0];
      // 排除明显是动作/介词/代词开头
      if (nameParagraphStarters.test(head)) continue;
      if (nonNameHeads.includes(head)) continue;
      if (pronounVerbStarters.has(head.slice(0, 2))) continue;
      // 段以中文/英文句末标点收尾说明段已结束（不是被截断的中间句）
      if (!/[。！？…\.!?]/.test(p)) continue;
      // 排除：上一段以冒号/引号结尾（"我说：赵明。" 是引语后接补充，并非姓名独立成段）
      if (i > 0 && (paragraphs[i - 1].endsWith('：') || paragraphs[i - 1].endsWith(':'))) continue;
      if (i > 0 && /["\u201C\u201D]$/.test(paragraphs[i - 1])) continue;
      findings.push({
        ruleId: '32',
        message: `姓名/称谓段"${head}..."独立成段（应与上下文合并）`,
        snippet: p,
        position: `第 ${i + 1} 段`,
      });
    }

    // ===== 33 段后空行 ≥ 2（连续 \n\n+） =====
    // 规则 26 已禁"短句独立成段"，但 LLM 有时用 "\n\n\n" 这种连空行来"视觉分段"，
    // Markdown 渲染后是大段空白，是 AI 诗歌式排版的物理指纹。
    const multiBlankLine = /\n[ \t]*\n[ \t]*\n/;
    if (multiBlankLine.test(content)) {
      // 找到第一个位置
      const m = content.match(multiBlankLine);
      if (m && m.index !== undefined) {
        const before = content.slice(Math.max(0, m.index - 30), m.index);
        findings.push({
          ruleId: '33',
          message: '段后空行 ≥ 2（连续 \\n\\n\\n），应只保留 1 个空行作为段落分隔',
          snippet: slice(before, 30) + '⟨⟨多空行⟩⟩',
          position: `offset ${m.index}`,
        });
      }
    }

    // ===== 34 连续动作动词链排比（同一句内 ≥4 个“动作动词领起”的短碎片） =====
    // 用户截图："我重新站起来，走到书桌前，拉开抽屉，拿出那张纸。" —— 同一主语的动作清单/分镜脚本，
    // 是 AI 写作物理指纹。旧实现用“任意 2 汉字+逗号”近似动作词，会把正常叙述（“瓷盘里，换了鞋…”）
    // 和人物对话大面积误伤；这里收紧为：必须由动作动词领起、且几个碎片在同一句内紧凑相连（中间不被
    // 句末标点/换行/引号/冒号隔断）才判，跨平台一致、但不冤枉普通句子。
    {
      // 多字词优先（站起来 先于 站）；均为“人能直接做出的动作动词”，名词/方位/状态词不入表
      const ACTION_HEAD = '(?:站起来|站起身|站起|起身|坐下|坐回|坐|走过去|走到|走进|走上|迈步|迈出|迈|跨|退|冲|跑|转身|回过头|回头|转过|抬|低|点|摇|伸|缩|举|放|抓|握|接|推|拉开|拉|抽出|抽|拿出|取出|拿|取|掏|摸|按|靠|蹲|跪|趴|迎|躲|闪|翻|合上|关上|关|打开|掀开|掀|抹|擦|搓|攥|捏|递|塞|拽|拖|扛|抱|搂|牵|挽)';
      const actionSeg = new RegExp(ACTION_HEAD + '[一-龥]{0,8}[，,。！？!?]', 'g');
      const segs34: Array<{ start: number; end: number }> = [];
      let vm34: RegExpExecArray | null;
      while ((vm34 = actionSeg.exec(content)) !== null) {
        segs34.push({ start: vm34.index, end: vm34.index + vm34[0].length });
      }
      for (let i = 0; i + 3 < segs34.length; i++) {
        const grp = segs34.slice(i, i + 4);
        let sameClause = true;
        for (let k = 1; k < grp.length; k++) {
          const between = content.slice(grp[k - 1].end, grp[k].start);
          // 相邻动作碎片必须紧挨在同一动作流里：不被句末/换行/引号/冒号隔断，且中间至多 6 字连接词
          if (between.length > 6 || /[。！？!?…\n“”"」「：:]/.test(between)) { sameClause = false; break; }
        }
        const span = grp[3].end - grp[0].start;
        if (sameClause && span < 60) {
          const combined = content.slice(grp[0].start, grp[3].end);
          findings.push({
            ruleId: '34',
            message: '连续 4 个动作动词领起的短句排比（"' + slice(combined, 60) + '"——像动作清单/分镜脚本，是AI排比物理指纹）。把其中至少两个动作合并进带目的或感受的完整句，只保留真正推进剧情的关键动作',
            snippet: slice(combined, 80),
            position: `offset ${grp[0].start}-${grp[3].end}`,
          });
          break; // 报一次避免噪音
        }
      }
    }

    // ===== 35 标点单一（连续 200 字无引号/问号/破折号/感叹号/分号/省略号） =====
    // 标点多元化规则 27 的确定性兜底：滑动窗口 200 字，扫到一段完全没有问号/感叹号/分号/
    // 省略号/破折号/引号对，就视为"标点单一"。
    // 注意：对话引号按对算（"…"算 1 组），连续 200 字里至少出现 1 种"非常规标点"才算合规。
    const punctDiversityWindow = 200;
    for (let i = 0; i < content.length - punctDiversityWindow; i += 80) {
      const window = content.slice(i, i + punctDiversityWindow);
      // 兼容中英文引号：\u201C \u201D \u2018 \u2019 是智能引号
      const hasDiversity = /[!?！？…—\u2014\u2013;:：;\u3001]|"[^"\n]{1,40}"|"[^"\n]{1,40}"|\u201C[^\u201D\n]{1,40}\u201D/.test(window);
      if (!hasDiversity) {
        findings.push({
          ruleId: '35',
          message: `连续 ${punctDiversityWindow} 字无问号/感叹号/分号/省略号/破折号/对话引号（标点单一硬约束）`,
          snippet: slice(window, 80),
          position: `offset ${i}-${i + punctDiversityWindow}`,
        });
        break;
      }
    }

    // ===== 36 热血空洞句（"这一刻""我终于""我必须""我不能""唯一能""最好的""只有……才能"） =====
    // AI 反思段的特征签名：通篇"我必须""我不能""我终于明白""这一刻我才""唯一能"——这些
    // 是 AI 在第一人称反思段最常用的"端正觉醒"句式，澎湃新闻/sudowrite/dailytopai 都点名。
    const hollowPhrases36 = [
      /这一刻[，,\s]*我?[才终学]/,
      /我(终于|才(真正)?明白|才(真正)?意识|才(真正)?觉悟)/,
      /我(必须|一定要|只能|不得不)/,
      /我(不能|无法|绝不能)/,
      /(唯一|只有)[^，。！？\n]{0,12}(才能|可以|能)/,
      /(最好|最优|最佳)的?(办法|方式|选择|出路)/,
      /这是(我)?(人生|命运|一生)?(中)?(最|唯一)/,
    ];
    const paragraphJoins36 = paragraphs.join('\n');
    let hollowHitCount36 = 0;
    for (const pat of hollowPhrases36) {
      const matches = paragraphJoins36.match(new RegExp(pat.source, pat.flags + 'g')) || [];
      hollowHitCount36 += matches.length;
    }
    if (hollowHitCount36 >= 4) {
      // 抽几个示例
      const examples: string[] = [];
      for (const pat of hollowPhrases36) {
        const m = paragraphJoins36.match(pat);
        if (m) examples.push(slice(m[0], 20));
        if (examples.length >= 3) break;
      }
      findings.push({
        ruleId: '36',
        message: `热血空洞句过多（命中 ${hollowHitCount36} 次"我必须/我不能/我终于/这一刻/唯一能/最好"等 AI 反思签名）`,
        snippet: examples.join(' / '),
        position: '全文',
      });
    }

    // ===== 37 抽象情绪独白段（连续 3 段以"我感到/我意识到/我明白/我突然觉悟"开头） =====
    // 这是 AI 端正觉醒段的另一种物理指纹：连续多段开头都是"我意识到""我明白""我突然觉悟"。
    const abstractThoughtStart = /^(我(感到|觉得|意识到|明白|懂得|体会到|突然觉悟|突然明白|这才明白))/;
    let consecutiveAbstract = 0;
    let abstractStart = -1;
    for (let i = 0; i < paragraphs.length; i++) {
      if (abstractThoughtStart.test(paragraphs[i])) {
        if (consecutiveAbstract === 0) abstractStart = i;
        consecutiveAbstract++;
      } else {
        if (consecutiveAbstract >= 3) break; // 已命中即停
        consecutiveAbstract = 0;
        abstractStart = -1;
      }
    }
    if (consecutiveAbstract >= 3) {
      const excerpt = paragraphs.slice(abstractStart, abstractStart + consecutiveAbstract).map(p => slice(p, 24)).join(' || ');
      findings.push({
        ruleId: '37',
        message: `连续 ${consecutiveAbstract} 段以"我感到/我意识到/我明白"开头（AI 端正觉醒段）`,
        snippet: excerpt,
        position: `第 ${abstractStart + 1}-${abstractStart + consecutiveAbstract} 段`,
      });
    }

    // ===== 38 代词过多（用户截图："风吹起他的衣角，他回头看了一眼身后的黑影" — 同句 2 个"他"主语） =====
    // 规则 10 已禁"相邻句/段以同一主语起头"，但 LLM 在长 prompt 下仍违规。
    // 确定性扫描：① 同句内"他/她/它"主语 ≥ 2 次（句首或逗号后）；② 同段内"他/她/它" ≥ 3 次。
    // 联网实证 yeyulingfeng："替换重复助词、人称指代"是 AI 写作通病，"他说道/然后/接着"泛滥。
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      // 句子切分（按。！？.!?）
      const sentences = p.split(/[。！？\.!?]/).filter(s => s.trim().length > 0);
      // 检测每句中"他/她/它"作为主语出现次数（句首或逗号/顿号后）
      let pronounOveruseHits = 0;
      const overuseExamples: string[] = [];
      for (const s of sentences) {
        // 句首"他/她/它"开头，或"，他/，她/，它"等逗号后接代词作主语
        const pronounSubjectMatches = s.match(/(^|[\u3001，,；;：:、])\s*(他|她|它)(?=[^们])/g) || [];
        if (pronounSubjectMatches.length >= 1) {
          // 该句以代词作主语
          pronounOveruseHits++;
          if (overuseExamples.length < 3) overuseExamples.push(slice(s, 30));
        }
      }
      // 同段 ≥ 3 句以代词作主语 → 违规
      if (pronounOveruseHits >= 3) {
        findings.push({
          ruleId: '38',
          message: `段内 ${pronounOveruseHits} 句以"他/她/它"作主语（代词过多，应轮换主语或用环境/物件/对话切入）`,
          snippet: overuseExamples.join(' / '),
          position: `第 ${i + 1} 段`,
        });
      } else {
        // 同句内 ≥ 2 个"他/她/它"作主语（"风吹起他的衣角，他回头看了一眼"）
        for (const s of sentences) {
          const pronounSubjectMatches = s.match(/(^|[\u3001，,；;：:、])\s*(他|她|它)(?=[^们])/g) || [];
          if (pronounSubjectMatches.length >= 2) {
            findings.push({
              ruleId: '38',
              message: `同句内 ≥ 2 个"他/她/它"作主语（"风吹起他的衣角，他回头看了一眼身后的黑影"式代词堆叠）`,
              snippet: slice(s, 60),
              position: `第 ${i + 1} 段`,
            });
            break;
          }
        }
      }
    }

    // ===== 39 段内短句堆叠（用户截图："曹征。我的主编。催稿的。" / "我认出来了。这是反派的顶层办公室。"） =====
    // 规则 26-short-para 只检测段+空行，没检测段内连续短句堆叠。
    // 模式：段内连续 ≥ 3 个 ≤ 8 字短句（句号结尾），节奏感像"诗歌断行"——AI 写作物理指纹。
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      // 按句号/感叹号/问号切句
      const sentences = p.split(/(?<=[。！？\.!?])/).filter(s => s.trim().length > 0);
      // 短段快节奏平台放宽：需连续 4 句且每句 ≤6 字才算"诗歌断行"；其余平台维持连续 3 句、每句 ≤8 字
      const stackNeed = allowShortParagraph ? 4 : 3;
      const stackMaxLen = allowShortParagraph ? 6 : 8;
      if (sentences.length < stackNeed) continue;
      for (let j = 0; j <= sentences.length - stackNeed; j++) {
        const stack = sentences.slice(j, j + stackNeed).map(s => s.trim());
        const lens = stack.map(s => s.replace(/[。！？\.!?，,、；;：:]/g, '').length);
        if (lens.every(l => l >= 2 && l <= stackMaxLen)) {
          const joined = stack.join('');
          findings.push({
            ruleId: '39',
            message: `段内连续 ${stackNeed} 个超短句堆叠（"${joined}"——AI"诗歌断行"式节奏，应合并为完整长句）`,
            snippet: joined,
            position: `第 ${i + 1} 段`,
          });
          break; // 一段只报一次
        }
      }
    }

    // ===== 26b 连续一句一段（机械强行换行）=====
    // 允许【单个】有冲击力的短句独立成段（短段平台的正当节奏），但禁止【连续多个】一句一段把正文切成碎条。
    // 上一轮把短段整类放行后出现"每句都换行"的副作用，本规则即用来收口：对话一来一回的短段不计入。
    {
      const cjkLen = (s: string) => (s.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
      const endMarkCnt = (s: string) => (s.match(/[。！？!?]/g) || []).length;
      const isDialoguePara = (s: string) => /^[“"「]/.test(s.trim()) || /[”"」]\s*$/.test(s.trim());
      // 一句一段：非对话段、恰好 1 个句末标点、汉字 ≤20
      const isOneLine = (s: string) => !isDialoguePara(s) && endMarkCnt(s) === 1 && cjkLen(s) > 0 && cjkLen(s) <= 20;
      const STACCATO_NEED = 3; // 连续 ≥3 段一句一段才判（孤立强调短段不判）
      let runStart = -1;
      let runLen = 0;
      const flushStaccato = (endIdx: number) => {
        if (runLen >= STACCATO_NEED) {
          const seg = paragraphs.slice(runStart, endIdx);
          findings.push({
            ruleId: '26b-staccato',
            message: `连续 ${runLen} 段都是"一句话就换行"（机械强行换行、读着发碎发机械）。短段必须和中长段错落：把相邻短句合并成段，只留 1 个最有冲击力的短句独立强调，严禁每一句都另起一段`,
            snippet: seg.map(p => slice(p, 16)).join(' / '),
            position: `第 ${runStart + 1}-${endIdx} 段`,
          });
        }
        runLen = 0;
        runStart = -1;
      };
      for (let i = 0; i < paragraphs.length; i++) {
        if (isOneLine(paragraphs[i])) {
          if (runLen === 0) runStart = i;
          runLen++;
        } else {
          flushStaccato(i);
        }
      }
      flushStaccato(paragraphs.length);
    }

    // ===== 40 章首无强钩子（用户反馈："没有代入感、剧情文字很平淡、完全没吸引力"） =====
    // 联网实证：番茄 5月公告"空洞水文"、澎湃"AI 不会主动推进剧情"、toutiao"读者三章就跑"。
    // 章首 200 字必须有"反常细节/冲突直给/未完成动作/悬念悬置"——AI 典型平淡开头是
    // "环境描写+主角感知+心声"循环，看似有字但没钩子。
    const chapterStart = content.slice(0, 400); // 前 400 字
    const chapterStartTrim = chapterStart.trim();
    if (chapterStartTrim.length >= 80) {
      // 强钩子标志：① 对话引号 ≥ 1 对；② 问号 ≥ 1；③ 感叹号 ≥ 1；④ 破折号 ≥ 1；
      // ⑤ 动作词"突然/猛地/瞬间/冲/扑/摔/砸/吼/喊"≥ 1；⑥ "为什么/谁/怎么回事"等悬念词 ≥ 1
      const hasDialogue = /"[^"\n]{1,40}"|"[^"\n]{1,40}"|\u201C[^\u201D\n]{1,40}\u201D/.test(chapterStartTrim);
      const hasQuestion = /[？?]/.test(chapterStartTrim);
      const hasExclamation = /[！!]/.test(chapterStartTrim);
      const hasDash = /[—\u2014]/.test(chapterStartTrim);
      const hasActionBurst = /(突然|猛地|瞬间|冲过去|扑过去|摔|砸|吼|喊|拽|抢)/.test(chapterStartTrim);
      const hasSuspenseWord = /(为什么|谁|怎么回事|为何|凭什么是|怎么会|到底)/.test(chapterStartTrim);
      const hookCount = [hasDialogue, hasQuestion, hasExclamation, hasDash, hasActionBurst, hasSuspenseWord].filter(Boolean).length;
      if (hookCount === 0) {
        findings.push({
          ruleId: '40',
          message: `章首 200+ 字无强钩子（无对话/问号/感叹号/破折号/突发动作/悬念词——平淡开头是 AI 写作最显眼的破绽，读者三章就跑）`,
          snippet: slice(chapterStartTrim, 100),
          position: '章首',
        });
      }
    }

    // ===== 40b 极高节奏平台：核心冲突/危机必须在前300字"实质"出现（补规则40只看标点钩子的不足） =====
    if (requireEarlyConflict) {
      const earlyWindow = content.slice(0, 300);
      // 强冲突/危机/反常事件词，或前300字内已有一段冲突对话，即视为冲突已前置
      const strongEvent = /(死|尸|血|枪|刀|毒|绑|逃|追|杀|凶|爆炸|着火|车祸|报警|警笛|手铐|威胁|争吵|吵架|打斗|晕倒|坠|劫持|绑架|尸体|死者|遇害|被杀|出事|不对劲|有问题|反常|异常|不该出现|怎么会|凭什么|是谁|谁在)/;
      const earlyDialogue = /[“"「][^”"」]{2,60}[”"」]/.test(earlyWindow);
      if (!strongEvent.test(earlyWindow) && !earlyDialogue) {
        findings.push({
          ruleId: '40b-opening-conflict',
          message: '番茄/极高节奏平台要求开篇前300字直接出现核心矛盾、危机或反常事件本身（或一段冲突对话）；当前前300字是身份/履历/户型/环境/日常动作铺垫，核心冲突出现过晚（读者前300字决定去留）。把最抓人的冲突或异常提到第一段，背景一律用后文动作和对话带出',
          snippet: slice(earlyWindow.replace(/\s/g, ''), 100),
          position: '开篇前300字',
        });
      }
    }

    // ===== 41 300字/3段无情绪点（联网实证：番茄300字一爽点/500字一钩子，开头300字流失率30%） =====
    // 两层检测：
    //   a) 字符级：滑动窗口 300 字符无 ?！…—;:：等及两位数数字；
    //   b) 段落级：连续 3 段无问号/感叹号/破折号/省略号/分号/数字——比字符级更准确
    //      （3 段环境+心声无情绪=AI"环境+心声循环零推进"的典型模式）
    const emotionRichChars = /[？！\uFF01\uFF1F…—\u2014\u2013;:：；;\u3001]|\d{2,}/;
    const emotionDeadZone = 300;
    let emotionDeadHit = false;
    for (let i = 0; i < content.length - emotionDeadZone; i += 100) {
      if (!emotionRichChars.test(content.slice(i, i + emotionDeadZone))) {
        emotionDeadHit = true;
        findings.push({
          ruleId: '41',
          message: `连续 ${emotionDeadZone} 字符无情绪波动（无?/!/—/…/数字——纯描述无情绪段，番茄300字一爽点公式不可违反）`,
          snippet: slice(content.slice(i, i + emotionDeadZone), 80),
          position: `offset ${i}-${i + emotionDeadZone}`,
        });
        break;
      }
    }
    // 段落级检测：连续 3 段无情绪标志
    if (!emotionDeadHit && paragraphs.length >= 3) {
      for (let i = 0; i < paragraphs.length - 2; i++) {
        const trio = paragraphs[i] + paragraphs[i + 1] + paragraphs[i + 2];
        if (!emotionRichChars.test(trio)) {
          findings.push({
            ruleId: '41',
            message: `连续 3 段无情绪波动（无?/!/—/…/数字——"环境描写+主角心声循环零推进"的 AI 典型模式）`,
            snippet: slice(paragraphs[i], 30) + ' | ' + slice(paragraphs[i + 1], 30) + ' | ' + slice(paragraphs[i + 2], 30),
            position: `第 ${i + 1}-${i + 3} 段`,
          });
          break;
        }
      }
    }

    // ===== 42 对话全圆滑对答（禁止客服式对话） =====
    // 三段检测：
    //   a) 全章级别：≥4 个对话引号对且无人味标志 → 整体违规；
    //   b) 段落级别：连续 ≥4 段含 quotes 的段落无人味标志 → 局部违规（比全局检测更精确）；
    //   c) 段内级别：单段 3 句对话全是"xx说/xx问/xx答" → 段内违规（经典客服式对答）。
    // 人味标志：打断（破折号）/ 沉默（没说话/没出声/不回答/没理）/ 答非所问 / 吞吞吐吐 /
    //           语气词（嗯/啧/哼/嘶/操/呸/啊？/呀！/我去）/ 重复（不行不行/不是不是）
    const hasInterruption42 = /[—\u2014]/.test(content);
    const hasSilence42 = /(没说话|没出声|没回答|沉默|没理|没接|没回|不回答|不说|没吭|没响|没应)/.test(content);
    const hasEvasion42 = /(你看|那个|这怎么|什么呀|不会吧|瞎说|哪有|骗人|不信|谁信|别闹|去你的|少来|呸|没这|没那)/.test(content);
    const hasHesitation42 = /(我…|也…|不…|可能|大概|也许|好像|算是|差不多|也…也|我我|他他)/.test(content);
    const hasToneWords42 = /([嗯啧哼嘶呸啊哎嘿哈哦呜]{1,2}[！。，、… ])/.test(content);
    const hasRepetition42 = /((.{1,3})\2\2)/.test(content);
    const humanMarkers42 = [hasInterruption42, hasSilence42, hasEvasion42, hasHesitation42, hasToneWords42, hasRepetition42].filter(Boolean).length;
    const dialogueQuotes42 = (content.match(/[\u201C\u201D""]/g) || []).length;
    if (dialogueQuotes42 >= 6 && humanMarkers42 === 0) {
      findings.push({
        ruleId: '42',
        message: `全章 ${dialogueQuotes42} 个对话引号对，但无人味标志（无打断/沉默/答非所问/吞吞吐吐/语气词/重复）——纯"xx说/xx回答"客服式对话`,
        snippet: '全章',
        position: '全文',
      });
    } else {
      // 段落级检测：连续 ≥4 段含对话引号的段落无人味标志
      const dialogueParaIndices: number[] = [];
      for (let i = 0; i < paragraphs.length; i++) {
        if (/[\u201C\u201D""]/.test(paragraphs[i])) dialogueParaIndices.push(i);
      }
      if (dialogueParaIndices.length >= 4) {
        let consecutiveNoHuman = 0;
        let maxConsecutive = 0;
        let maxStart = 0;
        let currentStart = 0;
        for (let j = 0; j < dialogueParaIndices.length; j++) {
          const p = paragraphs[dialogueParaIndices[j]];
          const localHuman = /([—\u2014]|没说话|没出声|没回答|沉默|没理|没接|没回|不回答|不说|你看|那个|这怎么|什么呀|不会吧|瞎说|哪有|骗人|不信|[嗯啧哼嘶呸啊哎嘿哈哈哦呜]{1,2}[！。，、… ]|…|我我|他他|也…也)/.test(p);
          if (!localHuman) {
            if (consecutiveNoHuman === 0) currentStart = dialogueParaIndices[j];
            consecutiveNoHuman++;
          } else {
            if (consecutiveNoHuman >= 4 && consecutiveNoHuman > maxConsecutive) {
              maxConsecutive = consecutiveNoHuman;
              maxStart = currentStart;
            }
            consecutiveNoHuman = 0;
          }
        }
        if (consecutiveNoHuman >= 4 && consecutiveNoHuman > maxConsecutive) {
          maxConsecutive = consecutiveNoHuman;
          maxStart = currentStart;
        }
        if (maxConsecutive >= 4) {
          findings.push({
            ruleId: '42',
            message: `连续 ${maxConsecutive} 段对话无人味标志（无打断/沉默/语气词/重复——圆滑交替对答）`,
            snippet: paragraphs.slice(maxStart, maxStart + maxConsecutive).map(p => slice(p, 24)).join(' | '),
            position: `第 ${maxStart + 1}-${maxStart + maxConsecutive} 段`,
          });
        }
      }
    }

    // ===== 43 无不完美细节（AI的"过度干净"物理指纹） =====
    // 词表已从 38 扩到 60+ 项，覆盖身体缺陷/环境反常/物件异常/时间错感/意外干扰
    const imperfectDetailWords = /(黑泥|线头|扣子|鞋带|口红|汗渍|指甲缝|腋下|松了|没系|缺了一角|裂口|雪花屏|闪烁|滴水|关不上|后盖不见了|划了一道|照片里没人|录音里有杂音|歪了|斜了|破洞|褪色|掉了漆|磨破了|起了毛|卷了边|糊了|没信号|空号|占线|没电|只剩2%|误触|按错了|多按了|发错了|打错了|走错了|坐过了|指甲油斑|鞋垫磨薄|茶垢|毛衣起球|拉链卡住|鞋底脱胶|扣子掉了|领口泛黄|袖口磨白|裤腿卷边|墙皮|剥落|发霉|漏气|蜘蛛网|打卷|糊边|裂纹|锈迹|卡壳|卡住|推开时嘎吱|扭不紧|旋钮打滑|糊味|焦味|酸味|霉味|有只蚊子|有只蟑螂|飞蛾扑灯|空调漏水|漏水了|下雨没关窗|被风吹倒|被风吹落|渗水|渗着|洇出|洇着|黄渍|水渍|污渍|灰渍|油渍|泥印|积灰|灰尘|橘子皮|果皮|纸屑|烟头|闪了两|闪了闪|嗡了一声|暗下去|薄得透光|露着灰|脱线|起球|泛黄|发黑|斑驳|划痕|掉漆|锈住|打不开|拧不开|皱巴巴|边角磨损)/g;
    const imperfectCount = (content.match(imperfectDetailWords) || []).length;
    // 阈值按章节长度分：>2000 字 → ≥3 处，500-2000 字 → ≥2 处，<500 字 → ≥1 处
    const imperfectThreshold = content.length > 2000 ? 3 : content.length > 500 ? 2 : 1;
    if (imperfectCount < imperfectThreshold) {
      findings.push({
        ruleId: '43',
        message: `全章 ${imperfectCount} 处不完美/反常识细节（需 ≥${imperfectThreshold} 处——AI "过度干净"物理指纹：人物小缺陷/环境反常/物件异常/意外干扰）`,
        snippet: `检测到的不完美细节: ${imperfectCount} / 至少 ${imperfectThreshold}`,
        position: '全文',
      });
    }

    // ===== 44 转场机械词过多 =====
    const mechTransitions44 = /(接着|然后|之后|随即|不久后|不一会儿|片刻后|过了一会儿|很快|马上|立刻|不一会儿的功夫|接下来|话说|于是乎|说到这|话又说回来|再然后|之后不久|片刻之间)/g;
    const mechMatches = content.match(mechTransitions44) || [];
    if (mechMatches.length >= 3) {
      const samples = mechMatches.slice(0, 3).join(', ');
      findings.push({
        ruleId: '44',
        message: `转场机械词 ≥ 3 次（"${samples}"——应改用环境切入/时间锚点/感官切入/身体状态替代）`,
        snippet: samples,
        position: '全文',
      });
    }

    // ===== 45 无具体数字（AI极少主动用数字） =====
    // 阈值按章节长度分：>2000 字 → 需 ≥1 处，800-2000 字 → 需 ≥1 处但 threshold 放宽，<800 字 → 跳过
    // 排除序数词（第X/其一/其二）和纯"一/二/三"单字
    const specificNumbers45 = /\d{2,}|[零一二三四五六七八九十百千万亿两]+(件|个|次|句|根|天|年|岁|块|毛|分|度|米|斤|步|遍|页|行|层|级|次|轮|趟|拳|脚|口|声|刻|秒)?/g;
    const specificCandidates = content.match(specificNumbers45) || [];
    const specificCount = specificCandidates.filter(n => {
      // 排除序数词（"第X"）、纯单字序数、以及"一些/几个/很多/好久"
      if (n.length < 2) return false;
      if (/^第/.test(n)) return false;
      if (/^(一些|几个|很多|好久|一些)$/.test(n)) return false;
      if (/^[一二三四五六七八九十]{1}$/.test(n)) return false;
      if (/^[一两]$/.test(n) && n.length === 1) return false;
      return true;
    }).length;
    const numThreshold = content.length > 2000 ? 1 : 1;
    const numMinLength = content.length > 2000 ? 800 : content.length > 500 ? 500 : 150;
    if (specificCount === 0 && content.length > numMinLength) {
      findings.push({
        ruleId: '45',
        message: `全章无具体数字锚点（正文 ${content.length} 字 ≥ ${numMinLength} 字阈值）——"第三十七根雨丝""坐了三天三夜""第十一个电话"：具体数字是真实感物理指纹，AI极少主动调用`,
        snippet: `检测到的具体数字: ${specificCount} / 至少 ${numThreshold}`,
        position: '全文',
      });
    }

    // ===== 46 刻意感官描写（AI最爱，新增） =====
    // "凉意贴着皮肤往上爬""炸开一朵光""过电似的传到手腕""心跳漏了一拍""喉咙发紧""手心冒汗"
    const sensoryPatterns46 = [
      /(凉意|暖意|寒意|热气|冷气|风)[^。]{0,8}(贴着|顺着|沿着|爬上|漫上)[^。]{0,8}(皮肤|脊背|后背|身体|手臂|小腿|脖子|脸颊)[^。]{0,8}(往上|往下|向上|向下)?(爬|蔓延|窜|流)/,
      /(炸开|绽放|绽开|迸开)[^。]{0,8}(一朵|一片|一团)?(光|光芒|光亮|白光|红光)/,
      /过电似的|过电一样|触电似的|触电一样/,
      /(心跳|心脏|心)[^。]{0,6}(漏了一拍|漏掉一拍|骤停|猛地一跳|咯噔一下)/,
      /(喉咙|嗓子|喉头)[^。]{0,6}(发紧|一紧|哽住|哽咽)/,
      /(手心|手掌|额头|后背|脊背)[^。]{0,6}(冒汗|出汗|渗汗|浸出冷汗)/,
    ];
    const sensoryMatches: string[] = [];
    for (const pat of sensoryPatterns46) {
      const m = content.match(pat);
      if (m) sensoryMatches.push(m[0]);
    }
    if (sensoryMatches.length > 0) {
      findings.push({
        ruleId: '46',
        message: `刻意感官描写 ${sensoryMatches.length} 处（AI最爱套路："凉意贴着皮肤往上爬""炸开一朵光""过电似的""心跳漏了一拍"等）——冷就说冷，疼就说疼，用直白动作代替`,
        snippet: sensoryMatches.slice(0, 3).join('；'),
        position: '全文',
      });
    }

    // ===== 47 拟人化比喻（新增） =====
    // "回音吞掉了尾音""风声绕了道""黑暗吞噬了一切""时间飞逝"
    const personificationPatterns47 = [
      /(回音|回声|声音|声响)[^。]{0,6}(吞掉|吃掉|吞噬|吞没|淹没)/,
      /(风|风声)[^。]{0,6}(绕了道|绕道|躲开|避开|绕开)/,
      /(黑暗|夜色|夜)[^。]{0,6}(吞噬|吞没|包裹|笼罩|张开大嘴)/,
      /(时间|时光|岁月)[^。]{0,6}(流逝|溜走|飞逝|匆匆|奔跑)/,
    ];
    const personificationMatches: string[] = [];
    for (const pat of personificationPatterns47) {
      const m = content.match(pat);
      if (m) personificationMatches.push(m[0]);
    }
    if (personificationMatches.length > 0) {
      findings.push({
        ruleId: '47',
        message: `拟人化比喻 ${personificationMatches.length} 处（"回音吞掉了尾音""风声绕了道""黑暗吞噬了一切"等非人事物做人才有的动作）——直接描写事实，不用拟人`,
        snippet: personificationMatches.slice(0, 3).join('；'),
        position: '全文',
      });
    }

    // ===== 48 套路化表达（新增） =====
    // "记忆清晰得像刚发生的事""不像梦""那一刻我突然明白""时间仿佛静止""眼中闪过一丝复杂"
    const clichePatterns48 = [
      /(记忆|回忆|画面)[^。]{0,6}(清晰得像|清晰如同|清楚得像|清楚如同)[^。]{0,10}(刚发生|昨天|眼前)/,
      /不像梦|不是梦|不是做梦|不像做梦/,
      /(那一刻|这一瞬间|就在这时)[^。]{0,10}(我|他|她)[^。]{0,10}(突然|忽然|猛地)[^。]{0,10}(明白|懂得|知道|意识到)/,
      /(时间|世界|一切)[^。]{0,6}(仿佛|好像|似乎)[^。]{0,6}(静止|停止|凝固|定格)/,
      /(眼中|眼里|眼眶)[^。]{0,6}(闪过|掠过|浮现|露出)[^。]{0,10}(一丝|一抹|一缕)?(复杂|异样|不明|难以言喻)/,
    ];
    const clicheMatches: string[] = [];
    for (const pat of clichePatterns48) {
      const m = content.match(pat);
      if (m) clicheMatches.push(m[0]);
    }
    if (clicheMatches.length > 0) {
      findings.push({
        ruleId: '48',
        message: `套路化表达 ${clicheMatches.length} 处（"记忆清晰得像刚发生""不像梦""那一刻我突然明白""时间仿佛静止""眼中闪过一丝复杂"等AI常用句式）——用具体场景和动作代替`,
        snippet: clicheMatches.slice(0, 3).join('；'),
        position: '全文',
      });
    }

    // ===== 49 同类生理反应/动作短距离密集重复（用户反馈：手抖/胃里翻涌/喉头发紧反复出现） =====
    // AI 高频特征：同一身体反应在短距离内反复用同一写法（"手有点抖""手还在抖""手在抖"）。
    // 规则：同一类反应 1200 字内 ≥ 3 次即判违规，避免用单一动作母题充情绪。
    const reactionPatterns49: Array<{ re: RegExp; name: string }> = [
      { re: /手[^。！？；\n]{0,12}(抖|颤|冒汗|出汗|攥|握紧)/g, name: '手部紧张反应' },
      { re: /(胃|腹)[^。！？；\n]{0,10}(翻|紧|抽|绞|堵|涌)/g, name: '胃部不适反应' },
      { re: /(喉|嗓)[^。！？；\n]{0,10}(发紧|堵|干|哽|涩)/g, name: '喉咙反应' },
      { re: /(心跳|心)[^。！？；\n]{0,10}(漏了|加速|狂跳|怦怦|揪|一紧)/g, name: '心跳紧张反应' },
    ];
    for (const rp of reactionPatterns49) {
      const hits: number[] = [];
      const mAll = [...content.matchAll(rp.re)];
      for (const m of mAll) hits.push(m.index || 0);
      let dense = false;
      for (let i = 0; i + 2 < hits.length; i++) {
        if (hits[i + 2] - hits[i] <= 1200) { dense = true; break; }
      }
      if (dense) {
        const samples = mAll.slice(0, 4).map(m => m[0].trim()).join(' / ');
        findings.push({
          ruleId: '49',
          message: `同类${rp.name}在短距离内密集重复（1200字内出现≥3次：${samples}）——同一身体反应反复出现是AI高频特征，删掉多余处，用对话/环境/动作替代`,
          snippet: samples,
          position: '全文',
        });
      }
    }

    // ===== 50 “X了，Y了”两字残句动作链（用户点名：“退了账，走了。”“闪了两下，灭了。”） =====
    // 一个连贯动作被逗号/句号切成多个 1-6 字“动词+了”碎片，是机械碎句硬指纹。
    // 双片段链命中≥2处、或出现三连同（X了，Y了，Z了。）即判；单个正常短句不判，避免误伤。
    {
      // 允许“了”与逗号之间夹 0-3 字补语/宾语（真实病例“退了账，走了”=退了+账；“闪了两下，灭了”=闪了+两下）
      const fragChain = /[一-龥]{1,5}了[一-龥]{0,3}[，,][一-龥]{1,5}了(?=[。！])/g;
      const chainHits: string[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = fragChain.exec(content)) !== null) chainHits.push(cm[0]);
      const triple = /[一-龥]{1,5}了[一-龥]{0,3}[，,][一-龥]{1,5}了[一-龥]{0,3}[，,][一-龥]{1,5}了[一-龥]{0,3}[。！]/;
      const tripleHit = triple.test(content);
      if (chainHits.length >= 2 || tripleHit) {
        findings.push({
          ruleId: '50-fragment-action-chain',
          message: `“X了，Y了”式两字残句动作链 ${chainHits.length + (tripleHit ? 1 : 0)} 处（如“${(chainHits[0] || 'X了，Y了。').slice(0, 16)}”——把连贯动作切成两字碎片，读着机械发碎）。应合并为完整句子、补足主语或成分（如“他结了账转身离开”），严禁用句号把连续动作切成残句`,
          snippet: chainHits.slice(0, 3).join(' / '),
          position: '全文',
        });
      }
    }

    // ===== 51 句末语气词密度过高（靠嗯/啊/呀/吧/呢凑口语，显机械） =====
    {
      const hanLen51 = (content.match(/[一-龥]/g) || []).length || 1;
      const toneWords51 = (content.match(/[嗯啊呀吧呢呗喽嘛哦哈啦哟噻](?=[。！？，,\s”"]|$)/g) || []).length;
      const perHundred = toneWords51 / (hanLen51 / 100);
      if (toneWords51 >= 8 && perHundred > 1.2) {
        findings.push({
          ruleId: '51-modal-particle-density',
          message: `句末语气词过密（${toneWords51} 处、约 ${perHundred.toFixed(1)} 处/百字）。语气词只在贴合人物声线时偶用，删掉为凑口语而堆的嗯/啊/呀/吧/呢，用动作和具体台词代替`,
          snippet: `语气词 ${toneWords51} 处 / ${hanLen51} 汉字`,
          position: '全文',
        });
      }
    }

    // ===== 52 同一环境意象近距离重复铺陈（用户点名：黑车/夜色/灯反复渲染、过渡环境描写重复） =====
    // 阈值保守：同一意象相邻 4 段内≥4次且全文≥6次才判（关键道具正常复现不判）。
    {
      const envWords52 = ['黑车', '车灯', '路灯', '夜色', '晚风', '冷风', '烟雾', '霓虹', '月光', '雾气'];
      const envRepeatExamples: string[] = [];
      for (const w of envWords52) {
        let near = 0;
        for (let i = 0; i <= Math.max(0, paragraphs.length - 4); i++) {
          const window4 = paragraphs.slice(i, i + 4).join('');
          const c = (window4.match(new RegExp(w, 'g')) || []).length;
          if (c >= 4) { near = c; break; }
        }
        const total = (content.match(new RegExp(w, 'g')) || []).length;
        if (near >= 4 && total >= 6) envRepeatExamples.push(`“${w}”全文${total}次且相邻4段≥${near}次`);
        if (envRepeatExamples.length >= 3) break;
      }
      if (envRepeatExamples.length > 0) {
        findings.push({
          ruleId: '52-env-imagery-repeat',
          message: `同一环境意象近距离重复铺陈（${envRepeatExamples.join('；')}）。过渡环境描写只承担转场与情绪锚点，同一意象相邻段落最多 1-2 次，重复渲染处删掉或换成推进剧情的动作/对话`,
          snippet: envRepeatExamples.join('；'),
          position: '全文',
        });
      }
    }

    // ===== 53 同字/同构短并列（用户点名：“带了人、带了花、带了钻戒、带了协议”） =====
    // 正常名词并列（苹果、香蕉、橘子）不是问题；相同动词/前缀反复铺排的同构排比才是 AI 腔。
    {
      // 反向引用 \1 强制“同一 1-2 字前缀”复现：带噪声的起点（“结果你带了人”）因无法满足前缀重复，
      // 引擎会自动滑到真正的并列起点（“带了人、带了花、带了钻戒”），避免被前句残字破坏同构判断。
      const structRe = /([一-龥]{1,2})[一-龥]{0,5}[、，,]\1[一-龥]{0,5}[、，,]\1([一-龥]{0,5}(?:[、，,]\1[一-龥]{0,5})*)/g;
      const structHits: string[] = [];
      let sm: RegExpExecArray | null;
      while ((sm = structRe.exec(content)) !== null) {
        const prefix = sm[1];
        const extra = (sm[2].match(new RegExp(prefix, 'g')) || []).length; // 第 3 段之后的前缀复现次数
        const total = 3 + extra;
        // 2 字动词前缀（带了/想到）≥3 连即判；1 字前缀（你/我）放宽到 ≥4 连，容忍对话里短情绪排比
        if (prefix.length === 2 || total >= 4) structHits.push(sm[0]);
      }
      if (structHits.length > 0) {
        findings.push({
          ruleId: '53-same-structure-parallel',
          message: `同构排比 ${structHits.length} 处（如“${structHits[0].slice(0, 24)}”——相同动词/前缀连续铺排是AI腔）。只保留最有力的一项，其余改成有动作结果、有差异的具体句子，禁止“V了A、V了B、V了C…”式罗列`,
          snippet: structHits.slice(0, 3).join(' / '),
          position: '全文',
        });
      }
    }

    // ===== 54 形象量词与名词错配（用户点名：“那束粉白奶油蛋糕”——束用于花/光，不用于块状物） =====
    // 只做高频且误伤极低的“束”：要求“束”前是数词/指量词（排除“约束/束缚/结束”等成词），后接块状个状物即错。
    {
      const measureRe = /(?:[一二三四五六七八九十百千万两半几那这每整]|\d+)束[一-龥]{0,4}?(蛋糕|面包|米饭|饭|菜|汤|桌子|椅子|杯子|盒子|文件|协议|合同|手机|电脑|书本|笔|衣服|裙|鞋|包包|汽车|车子|房子|门|窗|戒指|钻戒|项链|手表|沙发|床)/g;
      const measureHits: string[] = [];
      let mm54: RegExpExecArray | null;
      while ((mm54 = measureRe.exec(content)) !== null) measureHits.push(mm54[0]);
      if (measureHits.length > 0) {
        findings.push({
          ruleId: '54-measure-word-mismatch',
          message: `量词与名词搭配错误 ${measureHits.length} 处（如“${measureHits[0].slice(0, 14)}”——“束”只用于花、光、发丝、柴草等成束细长物，蛋糕/文件/戒指等块状、个状物要用“个/只/份”）。逐处核对量词与名词是否匹配，禁止把甲物的量词套到乙物`,
          snippet: measureHits.slice(0, 3).join(' / '),
          position: '全文',
        });
      }
    }

    return findings;
}
