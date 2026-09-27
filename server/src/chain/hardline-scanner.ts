import { HIGH_DIALOGUE_PLATFORMS, resolveNovelStrategy, targetForLength } from './platform-benchmarks';
import { STYLE_PUNCTUATION_RELAX_KEYWORDS } from '../../shared/src';

/**
 * 「白描/朴素」类文风的标点宽松判定（阈值分化，不是豁免、不是降级）。
 * 关键词表来自执行标准唯一事实源（shared STYLE_PUNCTUATION_RELAX_KEYWORDS），
 * 本文件不再内联正则字面量 —— 阈值分化本来就是执行标准的分支，必须与标准同源，否则
 * 新增一个天然克制的文风时，只改了标准、漏了这里，规则就会按通用窗口误报。
 */
const PUNCTUATION_RELAX_STYLE_PATTERN = new RegExp(STYLE_PUNCTUATION_RELAX_KEYWORDS.join('|'));

/**
 * 硬红线确定性扫描（纯文本、零 IO、零框架依赖）：跨所有平台与长短篇共用同一套判定（单一事实源）。
 * 生成链（ChainController）与写作质量质检（WritingQualityService）都调用本函数，禁止再各写一份。
 * 排版/节奏类规则按 profile.platform/storyType 分化；叙述者跳出、人身/事实矛盾、AI 腔等真硬伤跨平台严格。
 */
export interface HardlineProfile {
  platform?: string;
  storyType?: string;
  /**
   * 创建前确认的执行标准（项目卡片）：分类 / 基调 / 文风 / 流派 / 视角。
   * resolveNovelStrategy 用这些标签微调节奏与回报间距（悬疑收紧回报间距、言情允许柔性回报、
   * 爽文提高密度、白描放宽间距）；缺了它们，这些微调在生产里全部退化成通用值，
   * 用户选了分类/基调却不生效——这是「正文不符合创建前的平台和标签」的根因之一。
   */
  storyCategory?: string;
  storyTone?: string[];
  writingStyle?: string[];
  webNovelGenre?: string[];
  /**
   * 本书人物姓名/称谓白名单（来自 characters 表；唯一取法 = modules/character/character-names）。
   * 规则 32「人名/称谓独占一行」的判据只能建立在这份白名单上，且整段只能是姓名与句末标点：
   * 缺了白名单就只能靠「短段 + 段首 2-4 汉字」
   * 去猜，而猜词表永远不完备（实测一本番茄短篇第一稿被判 32 条，命中原文全是普通叙述句），
   * 误报互相矛盾导致精修无法收敛、正文 422 不保存。缺省时规则 32 不猜词（宁可少报）。
   */
  characterNames?: string[];
}
export interface HardlineFinding {
  ruleId: string; message: string; snippet: string; position: string;
  /** 同一条规则内部的确定性命中数；只用于比较局部修复进展，保存仍要求硬红线为零。 */
  occurrenceCount?: number;
  /**
   * 可还原的段落切片：命中的原始段落（未做 ` | ` 折叠），以及它们在正文段落列表中的 0 基下标。
   * 局部精修必须有精确位置才能就地改（整章重写会让位置漂移，是规则 42 反复误报的根因）。
   */
  paragraphs?: string[];
  paragraphIndices?: number[];
  /**
   * 命中处的正文真实字符下标（唯一来源：规则自己匹配到的位置）。
   *
   * 防复发：此前锚定只有「position 精确位置」与「snippet 反查」两条路，而很多规则的 snippet
   * 是计数摘要（「语气词 12 处 / 1245 汉字」「仿佛×5」）或短词拼接（"接着, 然后, 之后"），
   * 在正文里逐字不存在 → 锚定落空或落到错误段落 → 段落级精修改错地方 / 直接中止保留上一版
   * （用户看到「同一章反复命中、正文 422 存不下来」）。规则匹配时已知精确位置的一律回填本字段，
   * 锚定阶段以它为最高优先级；判不了位置就留空（宁可无锚，不用猜的位置改正文）。
   */
  hitCharOffsets?: number[];
}

/**
 * 跨平台「语言硬伤」规则集合：全系统唯一的阻断清单（单一事实源）。生成端验收 Gate + 段落级精修
 * 与质检端扣分只认这一份，禁止任何模块另写规则号清单或另一套严重度。清单内命中 = 阻断保存 + 精确
 * 改写并触发回炉，不存在「只提示不阻断」的降级路径。平台/风格分化的是阈值（番茄/抖音的短段是正当
 * 排版、白描风格的标点窗口更长），不是「查不查」：没有任何规则会因为平台或风格而完全不检查。
 */
export const LANGUAGE_HARDLINE_RULE_IDS: readonly string[] = [
  '15b', '15c', '15d', '20a', '34', 'list-enumeration',
  '50-fragment-action-chain', '51-modal-particle-density', '52-env-imagery-repeat',
  '53-same-structure-parallel', '54-measure-word-mismatch', '56-punct-stacking', '57-ellipsis-density',
  // AI 痕迹指纹：公式句、破折号/比喻过密、热血空洞反思、觉醒段、超短句堆叠、
  // 客服式对话、机械转场、刻意感官、拟人比喻、套路化表达、密集生理反应、AI 高频模糊词。
  // 这类命中在生成验收与质检中都按"语言硬伤"处理（阻断保存 + 精修精确改写）。
  'formula-sentence', 'dash-density', 'simile-density',
  // 文笔/排版硬伤：此前列在「只进 advisories 的降级区」，现全部收进本清单、同样阻断保存 + 精确改写。
  // 26-short-para 短句独立成段 / 26-uniform 连续三段等长 / 26b-staccato 连续一句一段 /
  // 32 人名或称谓独占一行 / 33 段后连续空行 / 35 标点单一窗口 / 35b 叙述标点平板窗口。
  // 平台与风格分化的是阈值（短段平台 threshold=0、白描类风格窗口加长），不是「查不查」：
  // 清单内任何一条都不会因为平台或风格而完全不检查，也不存在「只提示不阻断」的旁路。
  '26-short-para', '26-uniform', '26b-staccato',
  '32', '33', '35', '35b',
  '36', '37', '39', '42', '44', '46', '47', '48', '49', '55',
];

/** 判断某条扫描命中是否属于跨平台语言硬伤（兼容规则号带后缀的情况） */
export function isLanguageHardline(ruleId: string): boolean {
  return LANGUAGE_HARDLINE_RULE_IDS.some(id => ruleId === id || ruleId.startsWith(id));
}

export function detectForbiddenTells(
    content: string,
    profile?: HardlineProfile,
  ): HardlineFinding[] {
    if (!content) return [];
    const findings: HardlineFinding[] = [];

    // ===== 平台化排版/节奏策略（关键：各平台是各平台风格，扫描器不得一刀切） =====
    // 番茄/抖音/七猫/小红书/规则怪谈等"短段落、快节奏"平台，短段独立成段、人名/称谓短句起段
    // 本就是正当排版（平台生成规则明确要求"段落短、每段不超过3行"）。若仍用"反短段"规则判违规、
    // 回炉要求拼成长段，就会与平台风格自相矛盾，导致第一稿大量误报、反复回炉永远修不干净。
    // 因此：排版/节奏类规则（26-short-para / 26-uniform / 32 / 39 / dialogue-ratio）按平台分化阈值——
    //       短段平台的短段是正当排版、等长段容差更宽，但规则本身同样进阻断清单，不再是「只提示不阻断」；
    //       作者跳出、人身状态矛盾、事实矛盾、AI 腔等「真硬伤」规则则跨平台用同一套严格阈值。
    const hardlineStrategy = resolveNovelStrategy({
      platform: profile?.platform,
      storyType: profile?.storyType,
      storyCategory: profile?.storyCategory,
      storyTone: profile?.storyTone,
      writingStyle: profile?.writingStyle,
      webNovelGenre: profile?.webNovelGenre,
    });
    // 短段平台集合 = 平台表里 pacing==='very_high' 的平台（逐值核对过：番茄/七猫/抖音/小红书/规则怪谈）。
    // 此前这里另抄了一份同名单，与 pacing 判定是「或」关系，等于同一事实写两遍；
    // 平台表调整节奏档后，两份会各自漂移，所以只保留 pacing 这一个判据。
    const allowShortParagraph = hardlineStrategy.pacing === 'very_high';
    // 非短段平台只拦截更碎的片段（18→12），降低对正常短句的误报
    const shortParaMaxLen = allowShortParagraph ? 0 : 12;
    // 连续等长段容忍度：短段平台天然段落都不长、容易等长，放宽到 8%（几乎完全一致才判）
    const uniformTolerance = allowShortParagraph ? 0.08 : 0.15;
    // 第一人称纪实/悬疑内心流（知乎盐选、规则怪谈）对话天然偏少，对话占比红线由 8% 降到 5%
    const lowDialoguePlatform = hardlineStrategy.id === 'zhihu' || hardlineStrategy.id === 'rules_horror';
    // 对话占比红线下限分三档：高对话强推进平台(番茄/七猫/抖音/小红书)15%；第一人称内心流(知乎盐选/规则怪谈)5%；其余 8%
    // 集合来自平台表唯一事实源 HIGH_DIALOGUE_PLATFORMS，本文件不再自建副本（rules_horror 虽为 very_high 但走内心流低档）
    const isHighDialogue = HIGH_DIALOGUE_PLATFORMS.has(hardlineStrategy.id as string);
    const dialogueMinRatio = isHighDialogue ? 0.15 : lowDialoguePlatform ? 0.05 : 0.08;
    // 高对话平台的"期望值"（写进提示：期望值 = 平台表本篇幅目标区间下限）
    // 期望值与开篇钩子窗口取自平台表本篇幅目标（唯一源 platform-benchmarks，禁止写死）：
    // 期望值 = 该平台该篇幅对话占比目标区间下限（番茄短篇 35%、起点 25%…）。
    // 此前这里写死 30%，与平台表的 35%–65% 是两套数字，同一章会同时被"期望≥30%"与"目标 35%"评判。
    // 红线 15%/5%/8% 仍是回炉线（阻断线），与目标区间不是同一个量。
    const metricTarget = targetForLength(
      hardlineStrategy,
      String(profile?.storyType || '') === 'long_novel' ? 'long_novel' : 'short_story',
    );
    const dialogueExpectPct = Math.round(metricTarget.dialogueRatio[0] * 100);
    // 开篇钩子窗口（唯一源：平台表 openingHookChars，随平台与长短篇变化）。
    // 此前 40 用写死的 400、40b 用写死的 300，与平台表（番茄短篇 300、知乎 200、起点 600、抖音 200）是两套数字。
    const openingHookChars = metricTarget.openingHookChars;
    // 极高节奏平台(番茄/抖音/规则怪谈)：核心冲突/危机必须在前 300 字"实质"出现（不只看标点钩子）
    const requireEarlyConflict = hardlineStrategy.pacing === 'very_high';

    // 文笔层硬线的风格分化（分化的是阈值，不是查不查）：白描/朴素/现实/日常是作者在项目卡片里选定的
    // 执行标准，platform-benchmarks 的 resolveNovelStrategy 已把这一组定义为节奏放宽维度（标点天然克制）。
    // 因此标点类硬线的检测窗口按该风格加长，规则本身照常生效、照常阻断保存。
    const styleStandard = [...(profile?.writingStyle || []), ...(profile?.storyTone || [])].join(String.fromCharCode(12289));
    const bareStyleStandard = PUNCTUATION_RELAX_STYLE_PATTERN.test(styleStandard);
    // 对话段判定：全文件唯一一份，26-short-para / 26-uniform / 26b-staccato 共用同一口径。
    const isDialogueParaText = (s: string) => /^[“"「]/.test(s.trim()) || /[”"」]\s*$/.test(s.trim());

    // 段落切分：连续空行视为分段；前后空白 trim
    const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const slice = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

    // 段落起止字符区间（paragraphs 是 trim 后的切片，按顺序在 content 中定位）。
    // 唯一实现：规则命中处要落段、集中锚定要落段，两边必须用同一份区间，否则又会出现「两套坐标」。
    const paraSpans: Array<{ start: number; end: number }> = [];
    {
      let cursor = 0;
      for (const p of paragraphs) {
        const at = content.indexOf(p, cursor);
        const start = at >= 0 ? at : cursor;
        paraSpans.push({ start, end: start + p.length });
        cursor = start + p.length;
      }
    }

    // ===== 命中处真实下标 / 派生串映射（唯一实现，勿在规则里各写一份） =====
    // 规则的摘要 snippet 常是「计数文字」或「多项拼接」，在正文里逐字不存在，拿它当坐标必然锚空。
    // charOffsetsOf：把规则匹配到的字面串还原成正文真实下标（找不到就跳过，绝不猜位置）。
    const charOffsetsOf = (needles: ReadonlyArray<string | undefined | null>): number[] => {
      const out: number[] = [];
      for (const rawNeedle of needles) {
        const t = String(rawNeedle ?? '').replace(/[…]+$/, '').trim();
        if (t.length < 2) continue;
        const at = content.indexOf(t);
        if (at >= 0) out.push(at);
      }
      return out;
    };
    /**
     * 剥离对话引号，同时产出「派生串下标 → 正文真实下标」映射。
     * mode '35b'：引号本身保留（引号算标点多样性）、引号内文字剔除、内文 1-60 字；
     * mode '55' ：整段引号连引号一起剔除（只统计叙述层）、内文 1-80 字。两种口径与原实现逐字一致。
     *
     * 防复发：此前 35b 直接用 replace() 后的派生串当坐标——派生串比正文短，
     * `offset 700-1180` 在正文里落在完全另一批段落上，精修照着错段落改，命中数不降 → 中止 →
     * 保留上一版正文（正文 422 存不下来）。凡「先派生再判定」的规则，坐标必须回映射。
     */
    const stripQuotedWithMap = (mode: '35b' | '55') => {
      const maxInner = mode === '35b' ? 60 : 80;
      const isOpen = (c: string) => (mode === '35b' ? c === '“' || c === '"' : c === '“' || c === '"' || c === '「');
      const isClose = (c: string, open: string) => (mode === '35b' ? c === (open === '“' ? '”' : '"') : c === '”' || c === '"' || c === '」');
      const text: string[] = [];
      const map: number[] = [];
      let k = 0;
      while (k < content.length) {
        const ch = content[k];
        if (isOpen(ch)) {
          let end = -1;
          const limit = Math.min(content.length - 1, k + maxInner);
          for (let j = k + 1; j <= limit; j++) {
            if (content[j] === '\n') break;
            if (isClose(content[j], ch)) { end = j; break; }
          }
          if (end > k + 1) {
            if (mode === '35b') { text.push(ch, content[end]); map.push(k, end); }
            k = end + 1;
            continue;
          }
        }
        text.push(ch);
        map.push(k);
        k += 1;
      }
      return { text: text.join(''), map };
    };
    // ===== 15c 叙述者跳出成为作者评论者（硬红线） =====
    // 判定收紧（本轮修复根因）：旧正则把"我写"裸匹配当元叙述，导致故事内人物的
    // 写字/记录/笔迹辨认动作（"我写的，横画都往上抬""那一笔我写不出来"）被误判为
    // "作者跳出评论"。真元叙述只可能是：①创作反思修饰+写（我本来想写…）；
    // ②写+创作宾语（我写这个结局/我写的这个故事）；③把/将故事元素如何（我把结局改了）。
    // 故事内"写字动作"（写号码/写不出来/写了两行字）全部放行。
    const hardTells15c = [
      // 元叙述①：创作反思修饰 + 写（"我本来想写""我原本打算写"——作者反思语气，故事内人物不会这样说话）
      /我\s*(本来|原本|原想|原准备|本来想|本来准备|一直想|也曾想|想过要)\s*(想|准备|打算)?\s*写/,
      // 元叙述②：写 + 创作对象（"我写这个结局""我写的这个故事""我准备写一场对峙"）
      /我\s*写\s*的?\s*(这|那)?\s*(个|篇|本|场)?\s*(结局|故事|剧情|开头|结尾|章节|番外|续集|小说|文章|伏笔|反转|对峙|场景|设定|人物|角色)/,
      // 元叙述③：把/将故事元素如何（"我把结局改成了""我把这个故事写完了"）
      /我\s*(把|将)\s*(这|那|个|这场|那个|一个)?\s*(故事|结局|剧情|人物|角色|场景|设定)/,
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
        hitCharOffsets: charOffsetsOf(formulaExamples),
      });
    }

    // ===== 密度类 AI 指纹（破折号/比喻/时间戳过密，联网实证：人类破折号 1-2/千字，
    //       AI 3-8 倍；比喻"一段最多一个"。密度超阈值即回炉，禁止以标点/修辞堆砌充字数） =====
    const dashCount = (content.match(/——/g) || []).length;
    const dashHanLen = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length || 1;
    const dashPerKilo = dashCount / (dashHanLen / 1000);
    // 与生成端硬红线第15条同口径：每千字≤2处；设6处起判量，避免极短章误判
    const dashDensityExceeded = dashCount >= 6 && dashPerKilo > 2;
    if (dashDensityExceeded) {
      findings.push({
        ruleId: 'dash-density',
        message: `破折号过密（${dashCount} 处、约 ${dashPerKilo.toFixed(1)} 处/千字，人类约 1-2 处/千字）。绝大多数停顿改用逗号、句号、冒号，单段最多1处，删掉多余破折号让句子自然承接`,
        snippet: slice(content.slice(0, content.length), 60),
        position: '全文',
        occurrenceCount: dashCount,
        // 这里曾只给第一个破折号坐标，后果是全章 11 处只允许精修 1 处，密度必然不降到阈值以下。
        // 全部真实命中位置交给同一段落锚定器；局部精修会按补丁预算分批选取。
        hitCharOffsets: [...content.matchAll(/——/g)].map(match => match.index ?? -1).filter(index => index >= 0),
      });
    }
    const simileMatches = content.match(/(像|仿佛|如同|宛如|犹如|好像|好似)[^，。；：！？\n]{2,12}/g) || [];
    const simileDensity = simileMatches.length;
    if (simileDensity > 15) {
      const simExamples = simileMatches.slice(0, 3).map(s => s.trim()).join(' / ');
      findings.push({
        ruleId: 'simile-density',
        message: `比喻过密（${simileDensity} 处"像/仿佛/如同…"，一段最多 1 个且须服务情绪或画面）。删掉为修辞而修辞的比喻，优先具体动作`,
        snippet: simExamples,
        position: '全文',
        hitCharOffsets: charOffsetsOf(simileMatches.slice(0, 3)),
      });
    }
    const timeDensity = (content.match(/\d+月\d+日|\d+:\d+|\d+点|凌晨|傍晚|午夜|深夜|上午|下午|早晨|中午|还剩\d+分钟/g) || []).length;
    if (timeDensity > 15) {
      findings.push({
        ruleId: 'time-density',
        message: `时间标签过密（${timeDensity} 处"X点/X月X日/凌晨/傍晚…"）。不必每幕都报时间，让读者从光线/动作/对话自然感知时间流逝；同一地址/专名重复 >5 次也须删改`,
        snippet: slice(content, 60),
        position: '全文',
        hitCharOffsets: charOffsetsOf([content.match(/\d+月\d+日|\d+:\d+|\d+点|凌晨|傍晚|午夜|深夜|上午|下午|早晨|中午|还剩\d+分钟/)?.[0]]),
      });
    }
    // 顿号排比列表：连续 ≥5 项"XX、"（"取餐、核对编号、骑车、等灯、敲门、递出去"）是 AI 动作清单指纹。
    // 本轮修复根因：旧实现只按"顿号并列 ≥5 项"判，把点名/花名册等人名清单（"周雨、贺小满、莫婷…
    // 韦家宝、陶然、龙秀、简宁、石佳、殷宇"）误判成"动作清单"——人名/物品/地名等名词并列是合法
    // 叙事元素。因此必须验证并列项中"动作项"过半才算动作清单：动作项 = 项以动作动词领起（复用规则34
    // 的动作动词表，刻意不含姓氏字，避免人名单误伤）。纯名词清单一律放行。
    {
      const LIST_ACTION_HEADS = new Set(
        '站起来|站起身|站起|起身|坐下|坐回|坐|走过去|走到|走进|走上|迈步|迈出|迈|跨|退|冲|跑|转身|回过头|回头|转过|抬|低|点|摇|伸|缩|举|放|抓|握|接|推|拉开|拉|抽出|抽|拿出|取出|拿|取|掏|摸|按|靠|蹲|跪|趴|迎|躲|闪|翻|合上|关上|关|打开|掀开|掀|抹|擦|搓|攥|捏|递|塞|拽|拖|扛|抱|搂|牵|挽|核对|骑车|骑|等灯|等|敲门|敲|写|画|记|数|签|付|收|递出去|拾|捡|拆|装|拧|撕|叠|铺|盖|扔|丢|抛|投|掷|拍|揉|扎|钉|缝|补|剪|裁|切|剁|削|刮|挖|铲|浇|灌|洒|泼|倒|泡|沏|煮|炒|煎|蒸|炖|烤|烧|炸|搬|运|扛|挑|驮|驾|驶|蹬|滑|漂|游|潜|爬|攀|登|跃|蹦|弹|射|发|传|抢|夺|偷|骗|哄|劝|诱|逼|催|盯|瞅|瞄|瞟|瞥|望|瞧|看|观|察|探|访|拜|会|见|约|邀|请|送|迎|陪|跟|随|领|带|引|导|教|授|学|练|习|试|验|测|量|称|算|计|估|料|想|思|谋|划|规|设|建|造|修|理|组|解|析|辨|别|认|懂|悟|醒|感|体|审|批|准|许|允|诺|应|答|复|谢|骂|吼|嚷|呼|唤|挥|扬|摇|晃|舞|动|移|挪|改|调|整|正|纠|删|除|加|增|减|缩|扩|张|合|闭|启|止|歇|息|睡|眠|梦|幻|念|忆|忘|失|寻|觅|搜|索|询|阅|读|览|抄|录|述|讲|谈|论|议|辩|争|吵|闹|斗|击|攻|防|守|护|救|援|助|帮|扶|携|持|执|掌|控|制|管|理|治|置|玩|耍|戏|逗|乐|笑|哭|泣|嚎|啼|鸣|吠|啸|吸|吐|纳|咽|吞|嚼|咬|啃|饮|喝|品|尝|闻|嗅|触|碰|撞|压|扭|扳|撬|掘|凿|钻|穿|刺|插|拔|扯|裂|破|碎|断|折|弯|曲|直|展|摊|衬|托|架|支|撑|顶|搂|拥|揽|攥|掐|搓|磨|蹭|拭|拂|刷|涤|冲|淋|浴|浸|润|湿|滴|淌|流|涌|喷|射|溅|落|坠|跌|摔|倒|伏|卧|倚|靠|立|滚|腾|窜|蹿|闯|挤|拥|簇|围|拢|聚|散|离|行|步|奔|驰|骋|御|乘|翔|翱|泅|浮|沉|荡|悠|旋|绕|环|巡|逛|踏|践|履|涉|渡|趟|蹚|踹|踢|碾|轧|磕|划|割|锯|砍|劈|斩|截|拦|堵|塞|遮|掩|蔽|覆|裹|包|缠|捆|绑|扎|结|拴|套|罩|蒙|捂|填|补|更|替|代|轮|值|卫|抵|抗|袭|杀|戮|屠|宰|绞|勒|扼|牵|挈|拎|挎|担|擎|捧|端|摘|采|揪|掰|启|揭|掀|撩|拨|挑|剔|剥|褪|卸|解|拆|散|分|离|别|隔|锯|剪|纫|绣|织|编|扣|缚|盘|折|返|归|还|撤|趋|赴|往|升|降|抖|颤|震|输|寄|邮|甩|弃|陈|列|整|拾|清|除|抹|涂|订|改|易|充|藏|隐|匿|避|让|防|维|持|坚|继|延|终|结|了|算|量|检|验|复|校|对|较|鉴|认|证|核|实|求|探|究|调|研|剖|释|阐|讲|介|描|叙|陈|报|汇|呈|交|移|手|承|任|负|经|营|运|操|执|实|施|落|贯|遵|服|从|顺|依|据|基|着|立|抓|紧|加|快|推|深|完|健|促|升|引|牵|组|举|办|召|进|启|程|赴|达|返|归'.split('|')
      );
      const listMatches = content.match(/([一-鿿]{2,6}[、]){4,}[一-鿿]{2,6}/g) || [];
      const actionListHits: string[] = [];
      for (const lm of listMatches) {
        const items = lm.split('、').map(s => s.trim()).filter(Boolean);
        // 动作项 = 项以动作动词领起（先 2 字动词再 1 字动词）；并列项 ≥5 且动作项过半才判动作清单
        const actionItems = items.filter(it => LIST_ACTION_HEADS.has(it.slice(0, 2)) || LIST_ACTION_HEADS.has(it.slice(0, 1)));
        if (items.length >= 5 && actionItems.length >= Math.ceil(items.length / 2)) {
          actionListHits.push(lm);
        }
      }
      if (actionListHits.length > 0) {
        findings.push({
          ruleId: 'list-enumeration',
          message: `顿号动作清单 ${actionListHits.length} 处（连续 ≥5 项动作"XX、"罗列：${actionListHits[0].slice(0, 24)}）。只保留 2 个核心动作并写出具体结果，其余删掉，避免"罗列动作清单"；相同动词前缀的同构排比（带了A、带了B…）见规则53；人名/物品/地名等名词并列（点名、菜单、花名册）是合法叙事，不是动作清单，不得改动`,
          snippet: actionListHits.slice(0, 2).map(s => s.trim().slice(0, 30)).join(' / '),
          position: '全文',
          hitCharOffsets: charOffsetsOf(actionListHits.slice(0, 2)),
        });
      }
    }
    // 对话占比过低：爆款网文对话占比高（用对话推进剧情/交代设定/制造冲突）。
    // 全章几乎无对话=大段独白+环境描写，是 AI 文的典型形态。阻断线下限分三档：高对话平台 15%/第一人称内心流 5%/其余 8%（见上方 dialogueMinRatio）。
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
      // 短段快节奏平台整类放行（短句独立成段是其正当排版）；其余平台只拦截 <12 字的极短碎片。
      // 本规则已在阻断清单内：命中进 contradictions 并触发段落级精修。平台分化的只是阈值（短段平台阈值=0），
      // 短段平台上「连续一句一段」由 26b-staccato 收口，不存在「平台豁免后完全看不见」。
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
      // 对话一来一回天然长度接近，是合法排版（尤其番茄对话节拍），不参与等长段判定；
      // 否则连续 3 段长度相近的对话会被判「等长段」，属于对平台正当排版的误伤。
      if (isDialogueParaText(paragraphs[i]) || isDialogueParaText(paragraphs[i + 1]) || isDialogueParaText(paragraphs[i + 2])) continue;
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

    // ===== 32 人名/称谓独占一行（用户截图反复出现的「姓名莫名其妙独占一行」） =====
    // ⚠️ 防复发（勿再退回反向判据）：本规则此前用「短段 + 段首 2-4 汉字 + 动作/介词/代词黑名单」的
    // 反向排除法。黑名单永远不可能完备 —— 实测一本番茄短篇第一稿被判出 32 条，命中原文【全部】是
    // 普通叙述句（"报站的女声从显示屏后面出来时，我的手搭在制动手柄上。""又按一次。还是它。"
    // "不是电流串音。""几秒后。""东堤到站，0:52。"…），一条真姓名段都没有。更致命的是这 32 条
    // 【互相矛盾】（每一条都要求「与上下文合并」，而它们分散在全章各处），段落级精修不可能同时满足
    // → repairHardlineFindingsLocally 判为无进展 → 正文 422 不保存（作者侧表现为"改了还是不过"）。
    // 因此唯一肯定式判据是【整段只有】本书 characters 表里的人物名/称谓和句末标点。
    // 这里曾有过第二份「段首是姓名 + 段长≤12」判据，后果是「林野抬脚，跨过门槛。」
    // 「林野往前走。」被误报，精修耗尽后正文 422 不保存；本轮删除这个长度猜测。
    // 白名单来源唯一：character-names.loadCharacterNames（生成链与质检链同一份，见该文件防复发注释）。
    // 没有白名单时本规则不猜词（宁可少报，也不制造无法收敛的误报风暴）；活体路径必传本书白名单。
    const characterNames = (profile?.characterNames || [])
      .map(n => String(n || '').trim())
      .filter(n => n.length >= 2)
      .sort((a, b) => b.length - a.length);
    if (characterNames.length > 0) {
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const head = characterNames.find(n => p.startsWith(n) && /^[。！？.!?]*$/.test(p.slice(n.length)));
        if (!head) continue;
        // 上一段是问句/引语时，本段是应答式独立成段（「谁去？」「赵明。」），不算姓名孤立。
        if (i > 0 && (/[？?]\s*$/.test(paragraphs[i - 1]) || /[\u201C\u201D"]/.test(paragraphs[i - 1]))) continue;
        // 上一段以冒号结尾（「他把东西分给三个人：」）说明本段是列表项/引语补充，不是姓名孤立。
        if (i > 0 && (paragraphs[i - 1].endsWith('：') || paragraphs[i - 1].endsWith(':'))) continue;
        findings.push({
          ruleId: '32',
          message: `人名/称谓段"${head}"独占一行（应与上下文合并）`,
          snippet: p,
          position: `第 ${i + 1} 段`,
        });
      }
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
      // 片段只匹配动作词+后续汉字（不吞结尾标点）：标点留给 between 隔断检查。
      // 修复误报根因：旧实现吞掉结尾标点（"坐下。"），使"坐下。坐下以后"两个独立句
      // 因 end=start 被误判为同一动作流；标点不吞后，句号/感叹号/问号恢复为隔断，
      // 逗号连接的紧凑动作链（"站起来，走到桌前，拉开抽屉，拿出纸"）仍正常命中。
      const actionSeg = new RegExp(ACTION_HEAD + '[一-龥]{0,8}', 'g');
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
    const punctDiversityWindow = bareStyleStandard ? 320 : 200; // 白描/朴素类风格按执行标准加长窗口，规则照常阻断
    let firstPunctFinding: HardlineFinding | undefined;
    let punctFailureWindows = 0;
    const punctHitParagraphs = new Set<number>();
    for (let i = 0; i < content.length - punctDiversityWindow; i += 80) {
      const window = content.slice(i, i + punctDiversityWindow);
      // 兼容中英文引号：\u201C \u201D \u2018 \u2019 是智能引号
      const hasDiversity = /[!?！？…—\u2014\u2013;:：;\u3001]|"[^"\n]{1,40}"|"[^"\n]{1,40}"|\u201C[^\u201D\n]{1,40}\u201D/.test(window);
      if (!hasDiversity) {
        punctFailureWindows++;
        for (const span of paraSpans) {
          if (span.start < i + punctDiversityWindow && span.end > i) punctHitParagraphs.add(span.start);
        }
        firstPunctFinding ??= {
          ruleId: '35',
          message: `连续 ${punctDiversityWindow} 字无问号/感叹号/分号/省略号/破折号/对话引号（标点单一硬约束）。标点必须符合句意${dashDensityExceeded ? '；本章破折号已过密，不得靠新增破折号修复此项' : ''}`,
          snippet: slice(window, 80),
          position: `offset ${i}-${i + punctDiversityWindow}`,
        };
      }
    }
    if (firstPunctFinding) {
      firstPunctFinding.occurrenceCount = punctFailureWindows;
      firstPunctFinding.hitCharOffsets = [...punctHitParagraphs].sort((a, b) => a - b);
      findings.push(firstPunctFinding);
    }

    // ===== 35b 叙述标点平板（引号外叙述连续 300 字无问号/感叹/破折号/省略号/分号） =====
    // 规则 35 的盲区：对话引号算"多样性"，导致"满篇对话 + 平板叙述"漏检。本规则只看
    // 引号外的叙述文本：连续 300 字叙述只用逗号句号、无任何情绪/停顿标点，读起来平板机械
    // （AI 收敛标点的指纹）。本规则已在阻断清单内：命中进 contradictions 触发段落级精修；
    // 白描/朴素/现实/日常类风格按项目卡片执行标准加长窗口（300→480），是阈值分化，不是豁免、不是降级。
    // 坐标修复：派生串只用于「判定」（与旧实现逐字等价），证据与坐标一律回映射到正文真实下标。
    const { text: narrationOnly, map: narrationMap } = stripQuotedWithMap('35b');
    const narrationWindow = bareStyleStandard ? 480 : 300;
    let firstNarrationFinding: HardlineFinding | undefined;
    let narrationFailureWindows = 0;
    const narrationHitParagraphs = new Set<number>();
    for (let i = 0; i < narrationOnly.length - narrationWindow; i += 100) {
      const w = narrationOnly.slice(i, i + narrationWindow);
      const hasNarrationDiversity = /[!?！？…—\u2014;:：;]/.test(w);
      if (!hasNarrationDiversity) {
        narrationFailureWindows++;
        const realStart = narrationMap[i] ?? 0;
        const realEnd = (narrationMap[Math.min(i + narrationWindow - 1, narrationMap.length - 1)] ?? realStart) + 1;
        for (const span of paraSpans) {
          if (span.start < realEnd && span.end > realStart) narrationHitParagraphs.add(span.start);
        }
        firstNarrationFinding ??= {
          ruleId: '35b',
          message: `叙述段连续 ${narrationWindow} 字只用逗号句号、无问号/感叹号/破折号/省略号/分号（标点平板，节奏机械）。仅在语义需要时用真实问句、停顿或分号调整节奏${dashDensityExceeded ? '；本章破折号已过密，不得靠新增破折号修复此项' : ''}`,
          snippet: slice(content.slice(realStart, realEnd), 80),
          position: `offset ${realStart}-${realEnd}`,
          // 命中窗覆盖的【全部】段落都给出真实下标：精修一轮就能把整段平板区改完，
          // 否则每次只改起始段、下一轮又命中相邻窗（用户看到的「反复回炉」正是这个）。
          hitCharOffsets: [],
        };
      }
    }
    if (firstNarrationFinding) {
      firstNarrationFinding.occurrenceCount = narrationFailureWindows;
      firstNarrationFinding.hitCharOffsets = [...narrationHitParagraphs].sort((a, b) => a - b);
      findings.push(firstNarrationFinding);
    }

    // ===== 56 标点连用滥用（！！！/？？/！？/？！，叠用标点非规范用法） =====
    // GB/T 15834 规定感叹号/问号不得叠用；网络 AI 输出常用"！！""？？""！？"渲染色调，
    // 是机器情绪化的物理指纹。任何一处叠用即阻断。
    const stackedPunct = content.match(/[！？!?]{2,}/g) || [];
    if (stackedPunct.length > 0) {
      findings.push({
        ruleId: '56-punct-stacking',
        message: `标点叠用 ${stackedPunct.length} 处（"！！""？？""！？"等，感叹号/问号叠用非规范用法，是 AI 情绪渲染指纹）。全部改单标点，用句子本身传达情绪`,
        snippet: slice(stackedPunct[0] ?? '', 20),
        position: '全文',
        hitCharOffsets: charOffsetsOf([stackedPunct[0]]),
      });
    }

    // ===== 57 省略号过密（>5 处/千字 = AI 欲言又止指纹） =====
    // 人类网文省略号 0-2 处/千字；AI 惯用"……"制造沉默/意味深长，密度常达 8-15/千字。
    // 阈值 5/千字（约人类 2.5 倍）才阻断，正常写作不会触线；只保留真正需要中断/沉默处。
    const ellipsisCount = (content.match(/……/g) || []).length;
    const ellipsisPerKilo = ellipsisCount / (content.length / 1000);
    if (ellipsisPerKilo > 5) {
      findings.push({
        ruleId: '57-ellipsis-density',
        message: `省略号过密（${ellipsisCount} 处、约 ${ellipsisPerKilo.toFixed(1)} 处/千字，人类约 0-2 处/千字）。绝大多数停顿改用逗号/句号或直接写动作，只保留真正欲言又止/中断的 1-2 处`,
        snippet: slice((content.match(/[^。！？\n]*……[^。！？\n]*/g) || [''])[0], 40),
        position: '全文',
        hitCharOffsets: charOffsetsOf([(content.match(/[^。！？\n]*……[^。！？\n]*/g) || [''])[0]]),
      });
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
        hitCharOffsets: charOffsetsOf(examples),
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
          // 并列清单豁免（修复误杀根因）：整组短句都是"名称+逗号/顿号+名称。"式名词对
          // （名单/账目/对照表，如"周雨，周红。贺小满，贺家。"）属正文需要的信息清单，
          // 不是 AI"诗歌断行"节奏；含谓语/虚词的叙事短句（"我认出来了。这是反派的办公室。"）不豁免。
          const isListStack = stack.every(s => {
            const t = s.trim().replace(/[。！？.!?]$/, '');
            const parts = t.split(/[，,、]/);
            if (parts.length !== 2) return false;
            const a = parts[0].trim(), b = parts[1].trim();
            if (!a || !b) return false;
            if (/[的了地得是有了也又还不就都正在把被给向为对从和与及或但则吗呢吧啊]/.test(t)) return false;
            return t.length <= 14;
          });
          if (isListStack) break; // 名单清单不判 39
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
      const isDialoguePara = isDialogueParaText; // 与 26-short-para / 26-uniform 共用同一份对话段口径
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
    // 章首（开篇钩子窗口内）必须有"反常细节/冲突直给/未完成动作/悬念悬置"——AI 典型平淡开头是
    // "环境描写+主角感知+心声"循环，看似有字但没钩子。
    const chapterStart = content.slice(0, openingHookChars); // 开篇钩子窗口（唯一源：平台表 openingHookChars）
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
          message: `章首 ${openingHookChars} 字内无强钩子（无对话/问号/感叹号/破折号/突发动作/悬念词——平淡开头是 AI 写作最显眼的破绽，读者三章就跑）`,
          snippet: slice(chapterStartTrim, 100),
          position: '章首',
        });
      }
    }

    // ===== 40b 极高节奏平台：核心冲突/危机必须在开篇钩子窗口内"实质"出现（补规则40只看标点钩子的不足） =====
    if (requireEarlyConflict) {
      const earlyWindow = content.slice(0, openingHookChars);
      // 强冲突/危机/反常事件词，或开篇钩子窗口内已有一段冲突对话，即视为冲突已前置
      const strongEvent = /(死|尸|血|枪|刀|毒|绑|逃|追|杀|凶|爆炸|着火|车祸|报警|警笛|手铐|威胁|争吵|吵架|打斗|晕倒|坠|劫持|绑架|尸体|死者|遇害|被杀|出事|不对劲|有问题|反常|异常|不该出现|怎么会|凭什么|是谁|谁在)/;
      const earlyDialogue = /[“"「][^”"」]{2,60}[”"」]/.test(earlyWindow);
      if (!strongEvent.test(earlyWindow) && !earlyDialogue) {
        findings.push({
          ruleId: '40b-opening-conflict',
          message: `本平台（极高节奏）要求开篇前 ${openingHookChars} 字内直接出现核心矛盾、危机或反常事件本身（或一段冲突对话）；当前开篇钩子窗口内是身份/履历/户型/环境/日常动作铺垫，核心冲突出现过晚（读者在前 ${openingHookChars} 字决定去留）。把最抓人的冲突或异常提到第一段，背景一律用后文动作和对话带出`,
          snippet: slice(earlyWindow.replace(/\s/g, ''), 100),
          position: `开篇前${openingHookChars}字`,
        });
      }
    }

    // ===== 41 情绪死区：连续 3 段平淡，或约 300 字符无情绪标志 =====
    // 300 字符是保守阻断线（真人网文也常超过），平台推进密度目标见平台表 payoffGapChars，
    // 两者不是一个量：这里只拦"连续 3 段零情绪"的 AI 环境+心声循环，不按固定字数硬塞反转。
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
    // 动作介入（对话伴随身体动作，是人类书写的强信号；AI 圆滑客服对话不会出现）
    const hasAction42 = /(磨了半天|磨了磨|抬起脸|抬起头|低下头|顿了一下|顿了顿|愣住|愣了愣|愣了半天|没动|张了张嘴|张张嘴|欲言又止|别过脸|侧过身|背过身|转过身|站住|停住|停下|清了清嗓子|咳了一声|看了一眼|看了看|瞄了一眼|盯着|摸了摸|攥紧|握了握|扯了扯|拉了拉|拽了拽|按了按|揉了揉|推了推|撞了一下|推了一下|拍了拍|咬了咬|咽了口|咽了咽|吸了口气|深吸一口气|叹了口气)/.test(content);
    const humanMarkers42 = [hasInterruption42, hasSilence42, hasEvasion42, hasHesitation42, hasToneWords42, hasRepetition42, hasAction42].filter(Boolean).length;
    // 真对话段判定（本轮修复根因）：旧实现只要段落里出现任意引号就计入"对话段落"，把叙述段中的
    // 引用称呼/记录词（"2016年秋季那一张，'贺小满'后面写着'叔叔'"）误判成对话，导致"连续 N 段
    // 对话无人味"大面积误报。真对话段只有两种：① 段首即引语（"…"开头）；② 段内成对引号且
    // 引号前紧邻说话动词（他说："…"）。"写着/改成/叫做"等记录性动词不是说话，一律不计入。
    const isDialoguePara42 = (p: string): boolean => {
      if (/^[\u201C"「]/.test(p)) return true;
      // 转述/称谓引用（"一个说'我姨妈'，另一个说'我姑姑'"）：说话者非具体人物，
      // 属叙述性转述而非现场对答，不算对话段。
      if (/(?:一个|另一个|有人说?|有人|别人|谁都没|没人|大家)[^。！？\n]{0,10}?(?:说|答|应|回|叫|喊|问)[：:，,]?\s*[\u201C"「][^\u201C"「\n]{1,6}[\u201D"」]/.test(p)) return false;
      return /(说|问|答|道|喊|叫|吼|嚷|应|回|念|读|讲|骂|哭|笑|叹|叹口气)[：:，,]?\s*[\u201C"「][^\u201C"「\n]{1,80}[\u201D"」]/.test(p);
    };
    const dialogueParaIndices: number[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      if (isDialoguePara42(paragraphs[i])) dialogueParaIndices.push(i);
    }
    // 这里曾只认「嗯/沉默/破折号」等表面标志，后果是「提前十天？」
    // 「报给谁？」配合「你管放线，我管时间表」的真实权责对抗被判客服式对答。
    // 两次追问须与同一段内的权责对立同时存在，普通登记问答仍由 42 阻断。
    const hasAdversarialExchange42 = (parts: string[]): boolean =>
      parts.filter(p => /[？?]/.test(p)).length >= 2
      && parts.some(p => /你(?:管|负责|决定)[\s\S]{0,80}我(?:管|负责|决定)/.test(p));
    // 全局：真对话段 ≥3 且全章无人味标志 → 客服式对话整体违规。
    // 豁免口径（与实现一致）：全章任意一个非疑问答句命中【闪避/模糊回答】或【X就是X 同义反复】，
    // 即认为存在对抗张力，不判"客服式"；注意这不是"去重问句 ≥3"。
    let globalEvasion = false;
    const globalEvasionRe = /(那边|这边|就那样|那样|不知道|不清楚|说不清|说不上|忘了|记不清|没记住|再说吧|再说|随便|都行|看情况|外头|里头|别问了|别问|不想说|不记得|没听清|在镇上|在乡下|在城里|在厂里|在外面|来不了|没空|忙着呢|走不开|说不准|没准|说不定|说不好)/;
  const tautologyRe = /^([^，。！？、；：\s]{1,8})(?:就是|还是|不还是|不就是)\1/;
      for (const di of dialogueParaIndices) {
        const inner = (paragraphs[di].match(/[\u201C"「][^\u201C"「\n]{1,60}[\u201D"」]/) || [''])[0];
        if (!(/[？?]$/.test(inner) || /(谁|什么|哪儿|哪里|哪|怎么|为什么|多少|几|吗|呢|啥)/.test(inner)) && (globalEvasionRe.test(inner) || tautologyRe.test(inner))) {
          globalEvasion = true;
        }
      }
    const globalExempt = globalEvasion || hasAdversarialExchange42(dialogueParaIndices.map(i => paragraphs[i]));
    if (dialogueParaIndices.length >= 3 && humanMarkers42 === 0 && !globalExempt) {
      findings.push({
        ruleId: '42',
        occurrenceCount: dialogueParaIndices.length,
        message: `全章 ${dialogueParaIndices.length} 段真实对话，但无人味标志（无打断/沉默/答非所问/吞吞吐吐/语气词/重复）——纯"xx说/xx回答"客服式对话`,
        snippet: '全章',
        position: '全文',
        paragraphs: dialogueParaIndices.map(i => paragraphs[i]),
        paragraphIndices: [...dialogueParaIndices],
      });
    } else if (dialogueParaIndices.length >= 4) {
      // 段落级检测：连续 ≥4 段真实对话无人味标志。
      // 关键口径（本轮修复）：只统计【物理相邻】的对话段——中间只要插入叙述/动作段，
      // 对话就被打断（叙述本身即场景感/人味），连续计数立即重置，而不是按对话段列表
      // 相邻跳过叙述段继续累加（旧口径把隔段对话误判为"连续圆滑对答"，是 42 反复
      // 误报的根因）。
      let consecutiveNoHuman = 0;
      let maxConsecutive = 0;
      let maxStart = 0;
      let currentStart = 0;
      for (let j = 0; j < dialogueParaIndices.length; j++) {
        // 物理相邻检查：当前对话段与上一对话段之间若隔着非对话段，视为被打断
        if (j > 0 && dialogueParaIndices[j] !== dialogueParaIndices[j - 1] + 1) {
          if (consecutiveNoHuman >= 4 && consecutiveNoHuman > maxConsecutive) {
            maxConsecutive = consecutiveNoHuman;
            maxStart = currentStart;
          }
          consecutiveNoHuman = 0;
        }
        const p = paragraphs[dialogueParaIndices[j]];
        // 混合段人味（修复误报根因）：对话段内【引号外叙述文字 ≥6 个汉字】（去掉标点后）即视为
        // 动作/场景/心理叙述介入，天然具有叙事人味——"小满的目光往窗外偏了一下。然后她把书包带子
        // 往肩上一提，说：'老师，阿岩来了。'"属动作介入的叙事段，不是"纯客服式对答"；
        // 纯"他说：'…'""她问：'…'"（引号外仅说话标签，<6 字）仍按原逻辑判无人味。
        const quoteOutside = p.replace(/[\u201C\u201D"「」][^\u201C\u201D"「」]*[\u201C\u201D"「」]/g, '');
        const narrationLen = quoteOutside.replace(/[，。！？、；：…\s]/g, '').length;
        const hasMixedNarration = narrationLen >= 6;
        const localHuman = hasMixedNarration || /([—\u2014]|没说话|没出声|没回答|沉默|没理|没接|没回|不回答|不说|你看|那个|这怎么|什么呀|不会吧|瞎说|哪有|骗人|不信|[嗯啧哼嘶呸啊哎嘿哈哈哦呜]{1,2}[！。，、… ]|…|我我|他他|也…也|磨了半天|磨了磨|抬起脸|抬起头|低下头|顿了一下|顿了顿|愣住|愣了愣|愣了半天|没动|张了张嘴|张张嘴|欲言又止|别过脸|侧过身|背过身|转过身|站住|停住|停下|清了清嗓子|咳了一声|看了一眼|看了看|瞄了一眼|盯着|摸了摸|攥紧|握了握|扯了扯|拉了拉|拽了拽|按了按|揉了揉|推了推|撞了一下|推了一下|拍了拍|咬了咬|咽了口|咽了咽|吸了口气|深吸一口气|叹了口气)/.test(p);
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
        // 追问推进豁免（修复误杀根因）：规则 42 本意是拦截"无信息推进的客服式寒暄对答"；
        // 而"信息推进的追问/对峙"——老师连续换问句逼问、对方敷衍回避（如"就来接你的是谁。/
        // 我姨妈。/她在哪儿住。/在那边。/哪边。"）——每轮问句都在推进新信息，是有戏剧张力的
        // 正文，LLM 评审确认合格。判定口径：连续区内【去重问句 ≥3 个】即视为追问推进区，豁免 42；
        // 问句少（<3）的机械套问（"你妈在哪儿？""广东。""你爸呢？""也在外头。"）不豁免。
        let hasEvasionAnswer = false;
        {
          const evasionAnswerRe = /(那边|这边|就那样|那样|不知道|不清楚|说不清|说不上|忘了|记不清|没记住|再说吧|再说|随便|都行|看情况|外头|里头|别问了|别问|不想说|不记得|没听清|在镇上|在乡下|在城里|在厂里|在外面|来不了|没空|忙着呢|走不开|说不准|没准|说不定|说不好)/;
          const tautologyRe = /^([^，。！？、；：\s]{1,8})(?:就是|还是|不还是|不就是)\1/;
          for (let k = maxStart; k < maxStart + maxConsecutive; k++) {
            const inner = (paragraphs[k].match(/[\u201C"「][^\u201C"「\n]{1,60}[\u201D"」]/) || [''])[0];
            if (!(/[？?]$/.test(inner) || /(谁|什么|哪儿|哪里|哪|怎么|为什么|多少|几|吗|呢|啥)/.test(inner)) && (evasionAnswerRe.test(inner) || tautologyRe.test(inner))) {
              hasEvasionAnswer = true;
            }
          }
        }
        // 豁免条件：连续区内至少一个答句为模糊/闪避（"那边""不知道"——有对抗张力，是追问/对峙
        // 场景的物理指纹，不是客服式配合回答）。登记式一问一答（"你叫什么名字？""周雨。"）无
        // 闪避，仍判圆滑交替对答。
        if (!hasEvasionAnswer && !hasAdversarialExchange42(paragraphs.slice(maxStart, maxStart + maxConsecutive))) {
          findings.push({
            ruleId: '42',
            occurrenceCount: maxConsecutive - 3,
            message: `连续 ${maxConsecutive} 段对话无人味标志（无打断/沉默/语气词/重复——圆滑交替对答）`,
            snippet: paragraphs.slice(maxStart, maxStart + maxConsecutive).map(p => slice(p, 24)).join(' | '),
            position: `第 ${maxStart + 1}-${maxStart + maxConsecutive} 段`,
            // 精确位置随结论一起返回：局部精修必须就地改这几段，不能靠整章重写（位置会漂移，
            // 是规则 42 反复误报的根因）。paragraphs 为未折叠的原始段落原文。
            paragraphs: paragraphs.slice(maxStart, maxStart + maxConsecutive),
            paragraphIndices: Array.from({ length: maxConsecutive }, (_, i) => maxStart + i),
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
    // 本规则判「缺失」（全章没有不完美细节），正文里没有可锚定的命中处 → 不带 hitCharOffsets；
    // 它不在 LANGUAGE_HARDLINE_RULE_IDS 内，只进 advisories，不会阻断保存。
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
        hitCharOffsets: charOffsetsOf(mechMatches.slice(0, 3)),
      });
    }

    // ===== 45 无具体数字（AI极少主动用数字） =====
    // 阈值：全文至少 1 处具体数字锚点（规则 45 恒为 1 处）；numMinLength 分档只决定"正文多短才不判"，
    // 不影响所需数量。此前写成 >2000?1:1 的恒等三元，看起来像有分档其实没有，已改为常量。
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
    const numThreshold = 1;
    const numMinLength = content.length > 2000 ? 800 : content.length > 500 ? 500 : 150;
    // 同 43：判的是「缺失」（全章无具体数字），无命中处可锚 → 不带 hitCharOffsets，只进 advisories。
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
        hitCharOffsets: charOffsetsOf(sensoryMatches.slice(0, 3)),
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
        hitCharOffsets: charOffsetsOf(personificationMatches.slice(0, 3)),
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
        hitCharOffsets: charOffsetsOf(clicheMatches.slice(0, 3)),
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
          hitCharOffsets: hits.slice(0, 4),
        });
      }
    }

    // ===== 50 “X了，Y了”两字残句动作链（用户点名：“退了账，走了。”“闪了两下，灭了。”） =====
    // 一个连贯动作被逗号/句号切成多个 1-6 字“动词+了”碎片，是机械碎句硬指纹。
    // 双片段链命中≥2处、或出现三连同（X了，Y了，Z了。）即判；单个正常短句不判，避免误伤。
    {
      // 允许“了”与逗号之间夹 0-3 字补语/宾语（真实病例“退了账，走了”=退了+账；“闪了两下，灭了”=闪了+两下）
      const fragChain = /[一-龥]{1,5}了[一-龥]{0,3}[，,][一-龥]{1,5}了(?=[。！])/g;
      // 这里曾对全文裸跑正则，后果是把“协议你们签了，房号也分了”之类
      // 人物对话误报为叙述者的碎片动作链，导致正文反复 422。复用 35b 的
      // 引号剥离及原文坐标映射；跨引号拼接出的假命中必须拒绝。
      const isNarrationMatch = (start: number, length: number) =>
        Array.from({ length }, (_, i) => narrationMap[start + i]).every((real, i) =>
          real !== undefined && (i === 0 || real === narrationMap[start + i - 1] + 1));
      const chainHits: string[] = [];
      const chainOffsets: number[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = fragChain.exec(narrationOnly)) !== null) {
        if (!isNarrationMatch(cm.index, cm[0].length)) continue;
        chainHits.push(cm[0]);
        chainOffsets.push(narrationMap[cm.index]);
      }
      const triple = /[一-龥]{1,5}了[一-龥]{0,3}[，,][一-龥]{1,5}了[一-龥]{0,3}[，,][一-龥]{1,5}了[一-龥]{0,3}[。！]/g;
      const tripleHits = [...narrationOnly.matchAll(triple)].filter(m => isNarrationMatch(m.index, m[0].length));
      const tripleHit = tripleHits.length > 0;
      if (chainHits.length >= 2 || tripleHit) {
        findings.push({
          ruleId: '50-fragment-action-chain',
          occurrenceCount: chainHits.length + (tripleHit ? 1 : 0),
          message: `“X了，Y了”式两字残句动作链 ${chainHits.length + (tripleHit ? 1 : 0)} 处（如“${(chainHits[0] || 'X了，Y了。').slice(0, 16)}”——把连贯动作切成两字碎片，读着机械发碎）。应合并为完整句子、补足主语或成分（如“他结了账转身离开”），严禁用句号把连续动作切成残句`,
          snippet: chainHits.slice(0, 3).join(' / '),
          position: '全文',
          hitCharOffsets: chainOffsets.length > 0 ? chainOffsets.slice(0, 3) : tripleHits.map(m => narrationMap[m.index]).slice(0, 3),
        });
      }
    }

    // ===== 51 句末语气词密度过高（靠嗯/啊/呀/吧/呢凑口语，显机械） =====
    {
      const hanLen51 = (content.match(/[一-龥]/g) || []).length || 1;
      const toneWordMatches51 = [...content.matchAll(/[嗯啊呀吧呢呗喽嘛哦哈啦哟噻](?=[。！？，,\s”"]|$)/g)];
      const toneWords51 = toneWordMatches51.length;
      const toneWordOffsets51 = toneWordMatches51.map(m => m.index ?? 0);
      const perHundred = toneWords51 / (hanLen51 / 100);
      if (toneWords51 >= 8 && perHundred > 1.2) {
        findings.push({
          ruleId: '51-modal-particle-density',
          message: `句末语气词过密（${toneWords51} 处、约 ${perHundred.toFixed(1)} 处/百字）。语气词只在贴合人物声线时偶用，删掉为凑口语而堆的嗯/啊/呀/吧/呢，用动作和具体台词代替`,
          snippet: `语气词 ${toneWords51} 处 / ${hanLen51} 汉字`,
          position: '全文',
          hitCharOffsets: toneWordOffsets51.slice(0, 3),
        });
      }
    }

    // ===== 52 同一环境意象近距离重复铺陈（用户点名：黑车/夜色/灯反复渲染、过渡环境描写重复） =====
    // 阈值保守：同一意象相邻 4 段内≥4次且全文≥6次才判（关键道具正常复现不判）。
    {
      const envWords52 = ['黑车', '车灯', '路灯', '夜色', '晚风', '冷风', '烟雾', '霓虹', '月光', '雾气'];
      const envRepeatExamples: string[] = [];
      const envRepeatOffsets: number[] = [];
      for (const w of envWords52) {
        let near = 0;
        for (let i = 0; i <= Math.max(0, paragraphs.length - 4); i++) {
          const window4 = paragraphs.slice(i, i + 4).join('');
          const c = (window4.match(new RegExp(w, 'g')) || []).length;
          if (c >= 4) { near = c; break; }
        }
        const total = (content.match(new RegExp(w, 'g')) || []).length;
        if (near >= 4 && total >= 6) {
          envRepeatExamples.push(`“${w}”全文${total}次且相邻4段≥${near}次`);
          envRepeatOffsets.push(content.indexOf(w));
        }
        if (envRepeatExamples.length >= 3) break;
      }
      if (envRepeatExamples.length > 0) {
        findings.push({
          ruleId: '52-env-imagery-repeat',
          message: `同一环境意象近距离重复铺陈（${envRepeatExamples.join('；')}）。过渡环境描写只承担转场与情绪锚点，同一意象相邻段落最多 1-2 次，重复渲染处删掉或换成推进剧情的动作/对话`,
          snippet: envRepeatExamples.join('；'),
          position: '全文',
          hitCharOffsets: envRepeatOffsets.filter(i => i >= 0),
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
      const structOffsets: number[] = [];
      let sm: RegExpExecArray | null;
      while ((sm = structRe.exec(content)) !== null) {
        const prefix = sm[1];
        const extra = (sm[2].match(new RegExp(prefix, 'g')) || []).length; // 第 3 段之后的前缀复现次数
        const total = 3 + extra;
        // 2 字动词前缀（带了/想到）≥3 连即判；1 字前缀（你/我）放宽到 ≥4 连，容忍对话里短情绪排比
        if (prefix.length === 2 || total >= 4) { structHits.push(sm[0]); structOffsets.push(sm.index); }
      }
      if (structHits.length > 0) {
        findings.push({
          ruleId: '53-same-structure-parallel',
          occurrenceCount: structHits.length,
          message: `同构排比 ${structHits.length} 处（如“${structHits[0].slice(0, 24)}”——相同动词/前缀连续铺排是AI腔）。只保留最有力的一项，其余改成有动作结果、有差异的具体句子，禁止“V了A、V了B、V了C…”式罗列`,
          snippet: structHits.slice(0, 3).join(' / '),
          position: '全文',
          hitCharOffsets: structOffsets.slice(0, 3),
        });
      }
    }

    // ===== 54 形象量词与名词错配（用户点名：“那束粉白奶油蛋糕”——束用于花/光，不用于块状物） =====
    // 只做高频且误伤极低的“束”：要求“束”前是数词/指量词（排除“约束/束缚/结束”等成词），后接块状个状物即错。
    {
      const measureRe = /(?:[一二三四五六七八九十百千万两半几那这每整]|\d+)束[一-龥]{0,4}?(蛋糕|面包|米饭|饭|菜|汤|桌子|椅子|杯子|盒子|文件|协议|合同|手机|电脑|书本|笔|衣服|裙|鞋|包包|汽车|车子|房子|门|窗|戒指|钻戒|项链|手表|沙发|床)/g;
      const measureHits: string[] = [];
      let mm54: RegExpExecArray | null;
      const measureOffsets: number[] = [];
      while ((mm54 = measureRe.exec(content)) !== null) { measureHits.push(mm54[0]); measureOffsets.push(mm54.index); }
      if (measureHits.length > 0) {
        findings.push({
          ruleId: '54-measure-word-mismatch',
          message: `量词与名词搭配错误 ${measureHits.length} 处（如“${measureHits[0].slice(0, 14)}”——“束”只用于花、光、发丝、柴草等成束细长物，蛋糕/文件/戒指等块状、个状物要用“个/只/份”）。逐处核对量词与名词是否匹配，禁止把甲物的量词套到乙物`,
          snippet: measureHits.slice(0, 3).join(' / '),
          position: '全文',
          hitCharOffsets: measureOffsets.slice(0, 3),
        });
      }
    }


    // ===== 55 AI 高频模糊词密度（用户反馈"正文 AI 痕迹太重"的感知层：仿佛/似乎/不禁/缓缓/微微…） =====
    // 统计时剥离对话引号内容（口语里"仿佛/似乎"合法），只统计叙述层；
    // 阈值保守：每千字 ≥5 处、或同一词单章 ≥4 处才判，避免误伤正常文笔。
    {
      const aiVagueWords55 = [
        '仿佛', '似乎', '不禁', '不由得', '不由', '缓缓', '微微', '静静', '默默', '悄然', '无声',
        '一丝', '一缕', '一抹', '某种', '些许', '莫名', '隐约', '隐隐', '略带',
      ];
      const { text: narrativeOnly, map: narrationMap55 } = stripQuotedWithMap('55');
      const hanLen55 = (narrativeOnly.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length || 1;
      let totalHits55 = 0;
      let maxWord55 = 0;
      let maxWordName55 = '';
      const hitExamples55: string[] = [];
      const hitOffsets55: number[] = [];
      for (const w of aiVagueWords55) {
        const cnt = (narrativeOnly.match(new RegExp(w, 'g')) || []).length;
        totalHits55 += cnt;
        if (cnt > maxWord55) { maxWord55 = cnt; maxWordName55 = w; }
        if (cnt > 0 && hitExamples55.length < 3) {
          hitExamples55.push(`${w}×${cnt}`);
          const at55 = narrativeOnly.indexOf(w);
          if (at55 >= 0) hitOffsets55.push(narrationMap55[at55] ?? 0);
        }
      }
      const perKilo55 = totalHits55 / (hanLen55 / 1000);
      if ((perKilo55 >= 5 && totalHits55 >= 8) || maxWord55 >= 4) {
        findings.push({
          ruleId: '55',
          message: `AI 高频模糊词过密（叙述层 ${totalHits55} 处、约 ${perKilo55.toFixed(1)} 处/千字${maxWordName55 ? `，最多是“${maxWordName55}”${maxWord55} 次` : ''}）。仿佛/似乎/不禁/缓缓/微微/一丝/一缕/某种/莫名/隐约这类模糊渲染是 AI 腔指纹：能用具体动作、数字、物件与对话说清的，一律删掉模糊词直说；同一情绪点最多保留 1 处`,
          snippet: hitExamples55.join(' / '),
          position: '全文',
          hitCharOffsets: hitOffsets55,
        });
      }
    }

    // ===== 命中段落集中锚定（唯一实现，勿在规则里各写一份） =====
    // 为什么在这里做：Gate 的「硬红线段落级精修」（chain.controller.repairHardlineFindingsLocally）
    // 只允许改【命中段落】——它要求每条 finding 带上命中段落的逐字原文（paragraphs）与段号
    // （paragraphIndices）。此前只有规则 42 自己填了这两个字段，其余规则命中时精修锚不出证据，
    // 只能中止并保留上一版正文，用户看到的就是「同一条规则反复命中、正文永远存不下来」。
    // 这里在扫描结束后集中补锚，规则判定/阈值一字不改：
    //   ⓪ 规则自报命中下标（hitCharOffsets）→ 直接映射到所属段落（最高优先级、唯一可信坐标）；
    //   ① 位置精确：position 为「第 X 段」「第 X-Y 段」→ 直接用段号；
    //   ② 位置为「offset N-M」→ 用字符区间与段落区间求交，映射成涉及到的段落；
    //   ③ 位置模糊（全文/章首/开篇前300字/对话段）→ 用 snippet 里逐字可核验的片段反查所属段落。
    // 三条都以「该片段在 content 中逐字存在」为前置：锚不上的宁可留空（调用方据此保留上一版正文），
    // 绝不用猜出来的位置去改正文——那是无证据改写。规则本身报什么、判什么，这里一概不动。
    {
      // 段落区间 paraSpans 已在扫描开始时统一计算（唯一实现），此处直接复用，勿再算一份。
      const spansFromCharRange = (start: number, end: number): number[] => {
        const hit: number[] = [];
        for (let i = 0; i < paraSpans.length; i++) {
          if (paraSpans[i].start < end && paraSpans[i].end > start) hit.push(i);
        }
        return hit;
      };
      // snippet 里的逐字片段：规则摘要可能被 slice 截断（带 …）、用 | / || / ／ 折叠、
      // 或夹带 ⟨⟨多空行⟩⟩ 这类标记——全部剥掉后再要求「逐字命中 content」才算证据。
      const MIN_ANCHOR_CHARS = 8;
      const spansFromSnippet = (snippet: string): number[] => {
        const hit = new Set<number>();
        for (const rawPart of String(snippet || '').split(/[|/；;]+|\s{2,}/)) {
          const part = rawPart.replace(/⟨⟨[^⟩]*⟩⟩/g, '').replace(/[…]+$/, '').trim();
          if (part.length < MIN_ANCHOR_CHARS) continue;
          if (!content.includes(part)) continue;
          for (let i = 0; i < paragraphs.length; i++) {
            if (paragraphs[i].includes(part)) hit.add(i);
          }
        }
        return [...hit].sort((a, b) => a - b);
      };
      const indicesFromPosition = (position: string): number[] => {
        const trimmed = String(position || '').trim();
        const byParagraph = /^第\s*(\d+)(?:\s*-\s*(\d+))?\s*段$/.exec(trimmed);
        if (byParagraph) {
          const from = Number(byParagraph[1]) - 1;
          const to = byParagraph[2] ? Number(byParagraph[2]) - 1 : from;
          const hit: number[] = [];
          for (let i = Math.max(0, from); i <= Math.min(paragraphs.length - 1, to); i++) hit.push(i);
          return hit;
        }
        const byCharOffset = /^offset\s*(\d+)\s*-\s*(\d+)$/.exec(trimmed);
        if (byCharOffset) return spansFromCharRange(Number(byCharOffset[1]), Number(byCharOffset[2]));
        return [];
      };
      // 命中处真实下标（规则自报，最高优先级）：规则匹配时已知精确位置的一律走这条。
      // position/snippet 反查对「计数摘要型 snippet」必然锚空（见 HardlineFinding.hitCharOffsets 注释）。
      const spansFromHitOffsets = (offsets: ReadonlyArray<number>): number[] => {
        const hit = new Set<number>();
        for (const idx of offsets) {
          if (!Number.isFinite(idx) || idx < 0) continue;
          for (let i = 0; i < paraSpans.length; i++) {
            if (idx >= paraSpans[i].start && idx < paraSpans[i].end) { hit.add(i); break; }
          }
        }
        return [...hit].sort((a, b) => a - b);
      };
      for (const finding of findings) {
        if (finding.paragraphs?.length) continue;
        const byOffsets = spansFromHitOffsets(finding.hitCharOffsets || []);
        const byPosition = indicesFromPosition(finding.position);
        const resolved = byOffsets.length > 0 ? byOffsets
          : byPosition.length > 0 ? byPosition
            : spansFromSnippet(finding.snippet);
        if (resolved.length === 0) continue;
        finding.paragraphs = resolved.map(i => paragraphs[i]);
        finding.paragraphIndices = resolved;
      }
    }

    return findings;
}

/**
 * normalizeProseLayout — 确定性「仅排版层」规整：只重排换行，不增删、不改写任何正文字符。
 *
 * 存在理由：规则 33（段后连续空行）、26-short-para / 26b-staccato（短句逐句换行）已在阻断清单内，
 * 但它们是纯排版问题——先由确定性层在落库前直接收口，模型就不必为「多打了一个空行」白烧一轮精修
 * （这属于「减少重复流程」）。落库后仍残留的少量碎片，才由阻断清单触发段落级精修精确改写。
 * 排版问题在落库前直接收口：
 *   ① 连续空行 ≥2 → 折叠为 1 个空行（规则 33 口径）；
 *   ② 相邻的「叙述碎片段」合并为一段：非对话（不含引号）、以句号收尾、且符合平台口径的极短
 *      叙述段，连续出现时并入同一段（累计不超过 MERGE_MAX 汉字）。对话段、长叙述段一律不动，
 *      单个孤立碎片也不动（保留正常强调节奏）——只消除「连续多段一句一行」的机械换行。
 * 合并只删除段间空行，正文汉字与标点数量严格守恒，字数统计（只数汉字/英文）不受影响。
 */
export const PROSE_LAYOUT_MERGE_MAX_CJK = 60;

export function normalizeProseLayout(
  content: string,
  profile?: HardlineProfile,
): string {
  if (!content) return content;
  const strategy = resolveNovelStrategy({
    platform: profile?.platform, storyType: profile?.storyType,
    storyCategory: profile?.storyCategory, storyTone: profile?.storyTone,
    writingStyle: profile?.writingStyle, webNovelGenre: profile?.webNovelGenre,
  });
  // 与上方同一判据：短段平台就是 pacing==='very_high' 的平台，不再内联第二份同名单。
  const shortPacing = strategy.pacing === 'very_high';
  // 短段平台按 26b 口径（一句一段、≤20 汉字）收口；其余平台按 26 口径（<12 字的极短碎片）收口
  const fragmentMaxCjk = shortPacing ? 20 : 12;
  const cjkLen = (s: string) => (s.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const hasQuote = (s: string) => /[“”"「」]/.test(s);
  const endMarkCount = (s: string) => (s.match(/[。！？!?]/g) || []).length;
  const isFragment = (s: string) => {
    if (hasQuote(s) || !/[。]$/.test(s)) return false;
    const len = cjkLen(s);
    if (len === 0 || len > fragmentMaxCjk) return false;
    return shortPacing ? endMarkCount(s) === 1 : true;
  };
  // ① 规则 33：连续空行 ≥2 折叠为单个空行
  const text = content.replace(/\r\n/g, '\n').replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n');
  // ② 规则 26 / 26b：相邻叙述碎片段合并
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buffer = '';
  const flush = () => { if (buffer) { out.push(buffer); buffer = ''; } };
  for (const para of paragraphs) {
    if (!isFragment(para)) { flush(); out.push(para); continue; }
    const merged = buffer ? buffer + para : para;
    if (cjkLen(merged) <= PROSE_LAYOUT_MERGE_MAX_CJK) { buffer = merged; continue; }
    flush();
    buffer = para;
  }
  flush();
  return out.join('\n\n');
}
