/**
 * 独立测试 detectForbiddenTells 新规则（32-37）
 *
 * 用法：
 *   cd novel-ai-platform/server
 *   npx tsc src/test/test-detect-forbidden-tells.ts --outDir dist-test --target ES2020 --module commonjs \
 *       --skipLibCheck --esModuleInterop --resolveJsonModule
 *   node dist-test/test-detect-forbidden-tells.js
 *
 * 期望：截图里的违规必须命中≥4 处（按规则号 32/33/34/35）。
 */

const USER_SCREENSHOT_VIOLATIONS = `我靠在墙边，慢慢蹲下来。

赵明会死。除非我改变结局。

但如果改变结局意味着主角从现实里消失——
我重新站起来，走到书桌前，拉开抽屉，拿出那张纸。

在最底下，我加了一行小字：


"如果必须牺牲一个人——该选谁？"

写完之后我盯着这行字看了很久。

外面传来邻居起床的声音，水龙头哗啦啦地响，然后是收音机播放早间新闻的声音。这个世界的每一个角落都那么真实——真实到让人害怕。

我把纸翻过去，扣在桌上`;

const PUNCT_DIVERSITY_TEST = `我靠在墙边，慢慢蹲下来。赵明会死。除非我改变结局。但如果改变结局意味着主角从现实里消失我重新站起来，走到书桌前，拉开抽屉，拿出那张纸。在最底下，我加了一行小字。如果必须牺牲一个人，该选谁。写完之后我盯着这行字看了很久。外面传来邻居起床的声音，水龙头哗啦啦地响，然后是收音机播放早间新闻的声音。这个世界的每一个角落都那么真实，真实到让人害怕。我把纸翻过去，扣在桌上。隔壁的灯还亮着，楼下有人在咳嗽，声音都太真了。我抬头看了一眼天花板，灰白灰白的，什么也没有。我把那张纸重新翻开，纸已经被捏出了折痕。我不知道接下来该怎么办。窗外的天快亮了，窗帘边缘渗出一点灰白的光。我盯着那行字，手指在桌面划了两道白印。我想，大概是想多了。也许没有。`;

const PRONOUN_OVERUSE_TEST = `风吹起他的衣角，他回头看了一眼身后的黑影。他没有说话，他只是静静地站在那里，他似乎在等待什么。夜风吹过来，他打了个寒颤。他不知道自己应该走还是留，他只是站在原地，看着远处的灯火一点点熄灭。他想喊一声，但他没有出声。他转过身，他走开了。`;

const SHORT_SENTENCE_STACK_TEST = `曹征。我的主编。催稿的。我认出来了。这是反派的顶层办公室。隔着玻璃能看见整座城市的轮廓，灯一盏接一盏地灭。曹征从抽屉里拿出一支烟。点上。吸了一口。又放下。

"你来了。"他说。

我站在门口没动。曹征。我的主编。催稿的。这三个词在我脑子里转了一圈，没拼成完整的句子。窗外有警笛声，由远及近，又由近及远地过去了。`;

const FLAT_OPENING_TEST = `清晨六点，闹钟响了。我睁开眼睛，看到天花板上熟悉的灰白颜色。窗外有鸟在叫，远处传来早班公交的声音。我躺在床上想了一会儿今天要做什么。需要去买菜，需要去交水电费，还需要给妈妈打个电话。我慢慢地坐起来，伸了个懒腰。窗外的天色渐渐亮了起来，阳光从窗帘缝隙里透进来，落在木地板上。我穿上拖鞋，走到厨房，烧了一壶水。水开了，我泡了一杯茶，端到客厅的茶几上。茶杯冒着热气，我坐到沙发上，端起茶杯喝了一口。茶叶在水里慢慢展开。我又喝了一口。今天又是平凡的一天。`;

function detectForbiddenTellsLite(content: string): Array<{ ruleId: string; message: string; snippet: string; position: string }> {
  const findings: Array<{ ruleId: string; message: string; snippet: string; position: string }> = [];
  if (!content) return [];
  const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const slice = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + '...' : s);

  // ===== 32 姓名/称谓独立成段 =====
  const nameParagraphStarters = /^(走|跑|站|坐|看|听|说|想|拿|拉|开|关|写|读|做|回|转|到|去|来|靠|摸|端|捧|托|搬|扔|推|敲|挤|涌|冒|冲|扑|拦|挡|握|抓|按|捏|撕|扯|拽|擦|伸|缩|跨|迈|踩|踏|踢|撞|砸|抖|振|摇|晃|摆|翻|滚|爬|滑|溜|飘|落|沉|浮|倒|塌|断|裂|碎|烧|烤|煮|炒|煎|蒸|炖|熬|沏|泡|灌|注|流|淌|滴|洒|溅|漏|溢)/;
  const nonNameHeads = ['这个', '那个', '什么', '怎么', '为什么', '哪个', '这些', '那些', '如此', '这样', '那样', '一样', '一直', '一下', '一些', '一定', '一次', '一边', '一旦', '万一', '曾经', '已经', '正在', '慢慢', '突然', '然后', '于是', '接着', '此后', '当晚', '今天', '明天', '昨天', '刚才', '此刻', '眼前', '眼里', '心里', '手上', '背上', '肩上', '脸上', '头上', '脚下', '旁边', '对面', '远处', '近处', '身后', '身前'];
  const pronounVerbStarters = new Set(['我靠', '我走', '我看', '我听', '我拿', '我拉', '我坐', '我站', '我回', '我转', '我到', '我去', '我来', '我摸', '我说', '我想', '我低', '我抬', '我盯', '我伸', '我握', '我抓', '我按', '我推', '我敲', '我擦', '我翻', '我爬', '我倒', '我沉', '我开', '我关', '我写', '我读', '我做', '我端', '我搬', '我扔', '我挤', '我握', '他在', '她在', '它在']);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.length > 30) continue;
    if (p.length < 4) continue;
    const headMatch = p.match(/^[\u4e00-\u9fff]{2,4}/);
    if (!headMatch) continue;
    const head = headMatch[0];
    if (nameParagraphStarters.test(head)) continue;
    if (nonNameHeads.includes(head)) continue;
    if (pronounVerbStarters.has(head.slice(0, 2))) continue;
    if (!/[。！？…\.!?]/.test(p)) continue;
    if (i > 0 && (paragraphs[i - 1].endsWith('：') || paragraphs[i - 1].endsWith(':'))) continue;
    if (i > 0 && /["\u201C\u201D]$/.test(paragraphs[i - 1])) continue;
    findings.push({
      ruleId: '32',
      message: '姓名/称谓段' + head + '...独立成段',
      snippet: p,
      position: '第 ' + (i + 1) + ' 段',
    });
  }

  // ===== 33 段后空行 ≥ 2 =====
  const multiBlankLine = /\n[ \t]*\n[ \t]*\n/;
  if (multiBlankLine.test(content)) {
    const m = content.match(multiBlankLine);
    if (m && m.index !== undefined) {
      findings.push({
        ruleId: '33',
        message: '段后空行 ≥ 2',
        snippet: slice(content.slice(Math.max(0, m.index - 30), m.index), 30),
        position: 'offset ' + m.index,
      });
    }
  }

  // ===== 34 排比/动词并列 =====
  const verbRow34 = /[\u4e00-\u9fff]{2}[，。]/g;
  const verbRowMatches: Array<{ start: number; text: string }> = [];
  let vmatch: RegExpExecArray | null;
  while ((vmatch = verbRow34.exec(content)) !== null) {
    verbRowMatches.push({ start: vmatch.index, text: vmatch[0] });
  }
  for (let i = 0; i < verbRowMatches.length - 3; i++) {
    const a = verbRowMatches[i], b = verbRowMatches[i + 1], c = verbRowMatches[i + 2], d = verbRowMatches[i + 3];
    if (b.start - a.start < 40 && c.start - b.start < 40 && d.start - c.start < 40) {
      const combined = content.slice(a.start, d.start + d.text.length);
      findings.push({
        ruleId: '34',
        message: '连续 4 个 2-字动作词排比',
        snippet: slice(combined, 80),
        position: 'offset ' + a.start + '-' + (d.start + d.text.length),
      });
      break;
    }
  }

  // ===== 35 标点单一 =====
  const punctDiversityWindow = 200;
  for (let i = 0; i < content.length - punctDiversityWindow; i += 80) {
    const window = content.slice(i, i + punctDiversityWindow);
    const hasDiversity = /[!?！？…—\u2014\u2013;:：;\u3001]|"[^"\n]{1,40}"|"[^"\n]{1,40}"|\u201C[^\u201D\n]{1,40}\u201D/.test(window);
    if (!hasDiversity) {
      findings.push({
        ruleId: '35',
        message: '连续 ' + punctDiversityWindow + ' 字无非常规标点',
        snippet: slice(window, 80),
        position: 'offset ' + i + '-' + (i + punctDiversityWindow),
      });
      break;
    }
  }

  // ===== 36 热血空洞句 =====
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
    const examples: string[] = [];
    for (const pat of hollowPhrases36) {
      const m = paragraphJoins36.match(pat);
      if (m) examples.push(slice(m[0], 20));
      if (examples.length >= 3) break;
    }
    findings.push({
      ruleId: '36',
      message: '热血空洞句过多（命中 ' + hollowHitCount36 + ' 次）',
      snippet: examples.join(' / '),
      position: '全文',
    });
  }

  // ===== 37 抽象情绪独白段 =====
  const abstractThoughtStart = /^(我(感到|觉得|意识到|明白|懂得|体会到|突然觉悟|突然明白|这才明白))/;
  let consecutiveAbstract = 0;
  let abstractStart = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    if (abstractThoughtStart.test(paragraphs[i])) {
      if (consecutiveAbstract === 0) abstractStart = i;
      consecutiveAbstract++;
    } else {
      if (consecutiveAbstract >= 3) break;
      consecutiveAbstract = 0;
      abstractStart = -1;
    }
  }
  if (consecutiveAbstract >= 3) {
    const excerpt = paragraphs.slice(abstractStart, abstractStart + consecutiveAbstract).map(p => slice(p, 24)).join(' || ');
    findings.push({
      ruleId: '37',
      message: '连续 ' + consecutiveAbstract + ' 段以我感到/我意识到/我明白开头',
      snippet: excerpt,
      position: '第 ' + (abstractStart + 1) + '-' + (abstractStart + consecutiveAbstract) + ' 段',
    });
  }

  // ===== 38 代词过多 =====
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const sentences = p.split(/[。！？\.!?]/).filter(s => s.trim().length > 0);
    let pronounOveruseHits = 0;
    const overuseExamples: string[] = [];
    for (const s of sentences) {
      const pronounSubjectMatches = s.match(/(^|[\u3001，,；;：:、])\s*(他|她|它)(?=[^们])/g) || [];
      if (pronounSubjectMatches.length >= 1) {
        pronounOveruseHits++;
        if (overuseExamples.length < 3) overuseExamples.push(slice(s, 30));
      }
    }
    if (pronounOveruseHits >= 3) {
      findings.push({
        ruleId: '38',
        message: '段内 ' + pronounOveruseHits + ' 句以他/她/它作主语',
        snippet: overuseExamples.join(' / '),
        position: '第 ' + (i + 1) + ' 段',
      });
    } else {
      for (const s of sentences) {
        const pronounSubjectMatches = s.match(/(^|[\u3001，,；;：:、])\s*(他|她|它)(?=[^们])/g) || [];
        if (pronounSubjectMatches.length >= 2) {
          findings.push({
            ruleId: '38',
            message: '同句内 ≥ 2 个他/她/它作主语',
            snippet: slice(s, 60),
            position: '第 ' + (i + 1) + ' 段',
          });
          break;
        }
      }
    }
  }

  // ===== 39 段内短句堆叠 =====
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const sentences = p.split(/(?<=[。！？\.!?])/).filter(s => s.trim().length > 0);
    if (sentences.length < 3) continue;
    for (let j = 0; j < sentences.length - 2; j++) {
      const a = sentences[j].trim();
      const b = sentences[j + 1].trim();
      const c = sentences[j + 2].trim();
      const lenA = a.replace(/[。！？\.!?，,、；;：:]/g, '').length;
      const lenB = b.replace(/[。！？\.!?，,、；;：:]/g, '').length;
      const lenC = c.replace(/[。！？\.!?，,、；;：:]/g, '').length;
      if (lenA <= 8 && lenB <= 8 && lenC <= 8 && lenA >= 2 && lenB >= 2 && lenC >= 2) {
        findings.push({
          ruleId: '39',
          message: '段内连续 3 个超短句堆叠',
          snippet: a + b + c,
          position: '第 ' + (i + 1) + ' 段',
        });
        break;
      }
    }
  }

  // ===== 40 章首无强钩子 =====
  const chapterStart = content.slice(0, 400);
  const chapterStartTrim = chapterStart.trim();
  if (chapterStartTrim.length >= 80) {
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
        message: '章首 200+ 字无强钩子',
        snippet: slice(chapterStartTrim, 100),
        position: '章首',
      });
    }
  }

  return findings;
}

// 主测试
console.log('\n=== Test 1: 用户截图正文（含 32/33/34 违规）===');
const findings1 = detectForbiddenTellsLite(USER_SCREENSHOT_VIOLATIONS);
console.log('命中 ' + findings1.length + ' 处违规：');
findings1.forEach((f, i) => {
  console.log((i + 1) + '. [' + f.ruleId + '] ' + f.message);
  console.log('   位置: ' + f.position + ' | 原文: ' + f.snippet);
});

console.log('\n=== Test 2: 标点单一正文（35 违规）===');
const findings2 = detectForbiddenTellsLite(PUNCT_DIVERSITY_TEST);
console.log('命中 ' + findings2.length + ' 处违规：');
findings2.forEach((f, i) => {
  console.log((i + 1) + '. [' + f.ruleId + '] ' + f.message);
  console.log('   位置: ' + f.position + ' | 原文: ' + f.snippet);
});

console.log('\n=== Test 3: 代词过多（38 违规，用户实证"他他他"）===');
const findings3 = detectForbiddenTellsLite(PRONOUN_OVERUSE_TEST);
console.log('命中 ' + findings3.length + ' 处违规：');
findings3.forEach((f, i) => {
  console.log((i + 1) + '. [' + f.ruleId + '] ' + f.message);
  console.log('   位置: ' + f.position + ' | 原文: ' + f.snippet);
});

console.log('\n=== Test 4: 段内短句堆叠（39 违规，用户实证"曹征。我的主编。催稿的。"）===');
const findings4 = detectForbiddenTellsLite(SHORT_SENTENCE_STACK_TEST);
console.log('命中 ' + findings4.length + ' 处违规：');
findings4.forEach((f, i) => {
  console.log((i + 1) + '. [' + f.ruleId + '] ' + f.message);
  console.log('   位置: ' + f.position + ' | 原文: ' + f.snippet);
});

console.log('\n=== Test 5: 章首平淡无钩子（40 违规，用户实证"清晨六点闹钟响..."）===');
const findings5 = detectForbiddenTellsLite(FLAT_OPENING_TEST);
console.log('命中 ' + findings5.length + ' 处违规：');
findings5.forEach((f, i) => {
  console.log((i + 1) + '. [' + f.ruleId + '] ' + f.message);
  console.log('   位置: ' + f.position + ' | 原文: ' + f.snippet);
});

// 综合验证
const hitRules1 = new Set(findings1.map(f => f.ruleId));
const hitRules2 = new Set(findings2.map(f => f.ruleId));
const hitRules3 = new Set(findings3.map(f => f.ruleId));
const hitRules4 = new Set(findings4.map(f => f.ruleId));
const hitRules5 = new Set(findings5.map(f => f.ruleId));

// Test 1 必须命中 32/33/34
const expected1 = ['32', '33', '34'];
const missing1 = expected1.filter(r => !hitRules1.has(r));
// Test 2 必须命中 35
const expected2 = ['35'];
const missing2 = expected2.filter(r => !hitRules2.has(r));
// Test 3 必须命中 38
const expected3 = ['38'];
const missing3 = expected3.filter(r => !hitRules3.has(r));
// Test 4 必须命中 39
const expected4 = ['39'];
const missing4 = expected4.filter(r => !hitRules4.has(r));
// Test 5 必须命中 40
const expected5 = ['40'];
const missing5 = expected5.filter(r => !hitRules5.has(r));

if (missing1.length === 0 && missing2.length === 0 && missing3.length === 0 && missing4.length === 0 && missing5.length === 0) {
  console.log('\nPASS: 全部 5 个测试通过');
  console.log('  Test 1 命中 [32, 33, 34]');
  console.log('  Test 2 命中 [35]');
  console.log('  Test 3 命中 [38]');
  console.log('  Test 4 命中 [39]');
  console.log('  Test 5 命中 [40]');
  process.exit(0);
} else {
  console.log('\nFAIL');
  if (missing1.length > 0) console.log('Test 1 缺失规则: ' + JSON.stringify(missing1));
  if (missing2.length > 0) console.log('Test 2 缺失规则: ' + JSON.stringify(missing2));
  if (missing3.length > 0) console.log('Test 3 缺失规则: ' + JSON.stringify(missing3));
  if (missing4.length > 0) console.log('Test 4 缺失规则: ' + JSON.stringify(missing4));
  if (missing5.length > 0) console.log('Test 5 缺失规则: ' + JSON.stringify(missing5));
  process.exit(1);
}