import { describe, it, expect } from 'vitest';
import { detectForbiddenTells, isLanguageHardline, normalizeProseLayout } from './hardline-scanner';

const ids = (text: string, platform = 'fanqie', storyType = 'short_novel') =>
  detectForbiddenTells(text, { platform, storyType }).map(f => f.ruleId);

describe('硬红线50只判叙述动作残句', () => {
  it('不把真实人物对话中的完整事实句当作碎片动作链', () => {
    const text = '“协议你们签了，房号也分了。”他按住礼簿。\n\n“你进去了，楼就记住你了。”孙婆说。';
    expect(ids(text)).not.toContain('50-fragment-action-chain');
  });

  it('仍阻断叙述层两处真实碎片动作链，坐标指向正文原文', () => {
    const text = '他退了账，走了。\n\n灯闪了两下，灭了。';
    const finding = detectForbiddenTells(text, { platform: 'fanqie', storyType: 'short_novel' })
      .find(f => f.ruleId === '50-fragment-action-chain');
    expect(finding).toBeDefined();
    expect(finding?.hitCharOffsets?.every(offset => text.slice(offset).includes('了'))).toBe(true);
  });
});

it('35b 将全章失败窗口都锚到真实段落，后半章不会在局部修订中消失', () => {
  const text = Array.from({ length: 20 }, (_, i) =>
    `第${i + 1}处记录，林野沿着名单核对位置，墙上的刻痕仍在原处。他重新查看楼层和住户，没有擅自改动纸面。`).join('\n\n');
  const finding = detectForbiddenTells(text, { platform: 'fanqie', storyType: 'short_novel' })
    .find(f => f.ruleId === '35b');
  expect(finding?.occurrenceCount).toBeGreaterThan(1);
  expect(Math.max(...(finding?.paragraphIndices || []))).toBeGreaterThan(14);
});

describe('hardline-scanner 规则15c 叙述者跳出（收紧后：创作宾语/创作反思才算）', () => {
  it('不误伤故事内笔迹辨认/写字动作（用户病例：我写的，横画都往上抬）', () => {
    const text = '那件校服的领子上有个红笔写的号码。我放大照片看了两遍，是"十一"。我写的，横画都往上抬。';
    expect(ids(text)).not.toContain('15c');
  });

  it('不误伤故事内写不出字的动作（那一笔我写不出来）', () => {
    const text = '在表格底下我又记了两行字。第三行空着，那一笔我写不出来，只写下四个字：春学期，末行。';
    expect(ids(text)).not.toContain('15c');
  });

  it('命中创作宾语式元叙述（我写的这个结局）', () => {
    const text = '她看了我一眼："我写的这个结局，你敢用吗？"说完把稿纸推了过来。';
    expect(ids(text)).toContain('15c');
  });

  it('命中创作反思式元叙述（我本来想写一场对峙）', () => {
    const text = '我本来想写一场对峙，写到一半又觉得没必要，随手就把那页纸撕了。';
    expect(ids(text)).toContain('15c');
  });
});

describe('hardline-scanner 规则53 同字/同构排比', () => {
  it('命中顿号四连同动词（用户病例：带了人、带了花、带了钻戒、带了协议）', () => {
    const text = '她抬起眼：“结果你带了人、带了花、带了钻戒、带了协议，来逼我签字。你连一顿饭都不装了。”';
    expect(ids(text)).toContain('53-same-structure-parallel');
  });

  it('命中逗号型同构（想到了A，想到了B，想到了C）', () => {
    const text = '他站在原地，想到了名字，想到了地址，想到了那天的雨，久久没有动。后来他慢慢走回了屋里坐下。';
    expect(ids(text)).toContain('53-same-structure-parallel');
  });

  it('两字动词前缀三连即命中，即使前面带前句残字（结果你…）', () => {
    const text = '结果你带了刀、带了绳、带了胶带，直奔后门而去，一路上谁也没有拦他。';
    expect(ids(text)).toContain('53-same-structure-parallel');
  });

  it('不误伤正常名词并列（苹果、香蕉、橘子、葡萄）', () => {
    const text = '长桌上摆着苹果、香蕉、橘子、葡萄，还有一壶刚沏好的热茶，大家围坐下来慢慢聊起了往年的旧事。';
    expect(ids(text)).not.toContain('53-same-structure-parallel');
  });

  it('一字前缀三连容忍、四连才判（对话短情绪排比不过度拦截）', () => {
    const three = '她红着眼：“你骗我、你瞒我、你害我，到今天还在装。”';
    const four = '她红着眼：“你骗我、你瞒我、你害我、你弃我，到今天还在装。”';
    expect(ids(three)).not.toContain('53-same-structure-parallel');
    expect(ids(four)).toContain('53-same-structure-parallel');
  });
});

describe('hardline-scanner 规则54 量词错配', () => {
  it('命中“那束+蛋糕”这类把花的量词套给块状物（用户病例）', () => {
    const text = '她没先看他，目光先落在桌角那束粉白奶油蛋糕上，又移到旁边那只敞开的天鹅绒盒子。';
    expect(ids(text)).toContain('54-measure-word-mismatch');
  });

  it('不误伤“那束洋桔梗/一束花”等正确搭配', () => {
    const text = '她在对面站定，手里那束洋桔梗的包装纸被攥得发皱，又抽出一支白花搁在椅面。';
    expect(ids(text)).not.toContain('54-measure-word-mismatch');
  });

  it('不误伤“约束/结束/束缚”等含“束”的成词', () => {
    const text = '这份约束文件的流程已经走完，结束这桩合作之后，双方都不再受其束缚。';
    expect(ids(text)).not.toContain('54-measure-word-mismatch');
  });
});

describe('hardline-scanner list-enumeration 阈值', () => {
  it('4 项不同动词/名词并列不判（避免误伤正常列举）', () => {
    const text = '他一路取餐、核对编号、骑车、等灯，心里盘算着晚上的安排，到家时天已经全黑了下来。';
    expect(ids(text)).not.toContain('list-enumeration');
  });

  it('5 项以上动作清单判 AI 罗列', () => {
    const text = '他取餐、核对编号、骑车、等灯、敲门、递出去，一套动作行云流水没有半分停顿，旁人看了都暗暗称奇。';
    expect(ids(text)).toContain('list-enumeration');
  });

  it('不误伤人名单（点名/花名册：周雨、贺小满、莫婷…用户病例）', () => {
    const text = '我把花名册又点了一遍：周雨、贺小满、莫婷、韦家宝、陶然、龙秀、简宁、石佳、殷宇，一个都不少。';
    expect(ids(text)).not.toContain('list-enumeration');
  });

  it('不误伤 5 项以上纯名词并列（菜单/物件等合法叙事）', () => {
    const text = '桌上摆着苹果、香蕉、橘子、葡萄、梨，还有一碟花生，都是她提前备好的。';
    expect(ids(text)).not.toContain('list-enumeration');
  });
});

describe('hardline-scanner 规则42 对话圆滑（真对话段判定收紧后）', () => {
  it('不误伤叙述段中的引用称呼（写着"叔叔"、改成"姑姑"——用户病例 42@第8-31段）', () => {
    const text = [
      '2016年秋季那一张，"贺小满"后面写着"叔叔"。翻到2017年春季，两种字还在，称呼换了。',
      '小满后头跟着一行字："姑姑"。再往后，2017年秋季，三个孩子的"姑姑"改成了"妈妈"。',
      '签字的只有两个人。',
      '我拿了张废纸垫在讲台边上，画了两列。左边记内收的，右边记起笔重的。',
      '两列都写满了。我又翻出上半年收的那份登记表，一张一张对过去。',
      '翻到春季这张表的最后一行时，我停住了。那一栏被修正液涂过。',
      '名字和称呼都被盖住，只露出一个偏旁的末端，一竖，是内收的写法。',
      '这一栏的字，不是那两种。落笔的力道不一样。',
      '我看了很久，认不出是谁。',
    ].join('\n\n');
    expect(ids(text)).not.toContain('42');
  });

  it('命中真客服式一问一答（连续 4+ 段真实对话无人味标志）', () => {
    const text = [
      '"你叫什么名字？"',
      '"周雨。"',
      '"今年几岁？"',
      '"十一。"',
      '"家里谁接你？"',
      '"我姨妈。"',
    ].join('\n\n');
    expect(ids(text)).toContain('42');
  });

  it('有两次追问和明确权责对抗时不误判为客服式对答', () => {
    const text = [
      '“十天前说的是下个月。”',
      '“方案改了。”',
      '“提前十天？”',
      '“你管放线。”郑虎看着他，“我管时间表。”',
      '“东面那条要重新定点，底下埋了临时管线，绕不过去。”',
      '“我给你报。你把线放出来。”',
      '“报给谁？”',
      '“报给我。上头来人验收，验完封路，装药车得进。”',
    ].join('\n\n');
    expect(ids(text)).not.toContain('42');
  });

  it('不误伤中间夹叙述/动作段的对话（物理相邻才算连续——用户病例 42@第54-68段）', () => {
    // 对话之间穿插了叙述/动作段（磨半天、撞了一下），旧口径把隔段对话误判为“连续圆滑对答”
    const text = [
      '"去吧。"',
      '阿岩在门槛上磨鞋底，磨了半天，抬起脸问我："老师，开学发新书吗？"',
      '"发。"',
      '"几本？"',
      '"跟去年一样。"',
      '他张嘴还要说什么，陶然从背后撞了他一下。他趔趄半步，书包撞到门框上。',
      '"我舅舅在校门口站着。"',
      '"你俩住一条巷子？"我问。',
    ].join('\n\n');
    expect(ids(text)).not.toContain('42');
  });

  it('不误伤转述性称谓引用（一个说"我姨妈"、另一个说"我姑姑"——不是现场对答）', () => {
    const text = [
      '龙秀和简宁一块儿走。一个说"我姨妈"，另一个跟着说"我姑姑"。',
      '"你俩住一条巷子？"我问。',
      '龙秀摇头："她外婆家跟我姨妈家挨着。"',
    ].join('\n\n');
    expect(ids(text)).not.toContain('42');
  });
});

describe('hardline-scanner 规则34 动作动词链排比（收紧后）', () => {
  it('命中同句连续4个动作动词领起的动作清单（用户病例）', () => {
    const text = '我重新站起来，走到书桌前，拉开抽屉，拿出那张纸，上面的字迹已经有些模糊了。';
    expect(ids(text)).toContain('34');
  });

  it('不误伤正常叙述里“两字+逗号”的普通句子（旧实现会大面积误判）', () => {
    const text = '她把钥匙搁在玄关的瓷盘里，换了鞋走进客厅，窗外的天色正一点点暗下来。';
    expect(ids(text)).not.toContain('34');
  });

  it('不误伤带动作的正常人物对话', () => {
    const text = '他擦了擦手，在她对面坐下，把温好的杯子推过去：“今天是不是又加班了？先喝口热的。”';
    expect(ids(text)).not.toContain('34');
  });

  it('动作清单判定跨平台一致（番茄/知乎/起点都抓，不被平台分化放过）', () => {
    const text = '他站起身，走到窗边，推开窗户，缩回手来，心里反倒一点点平静了下去。';
    for (const p of ['fanqie', 'zhihu', 'qidian', 'generic']) {
      expect(ids(text, p)).toContain('34');
    }
  });
});

describe('hardline-scanner 规则55 AI 高频模糊词密度', () => {
  it('命中叙述层模糊词密度（仿佛/似乎/不禁/缓缓/微微/一丝/某种/隐约堆叠）', () => {
    const text = '他仿佛听见身后有人喊，似乎还在叫他的名字，不禁停下脚步，缓缓回头，微微皱起眉，一丝凉意顺着领口滑下去，某种说不清的感觉涌上来，隐约觉得哪里不对。';
    expect(ids(text)).toContain('55');
  });

  it('同一模糊词单章出现 4 次即命中（即使总量未到密度线）', () => {
    const text = '她缓缓起身，缓缓走到窗边，缓缓拉开窗帘，又缓缓把杯子放回桌上，天光已经暗了大半。';
    expect(ids(text)).toContain('55');
  });

  it('不误伤对话里的口语模糊词（引号内不计入叙述层）', () => {
    const text = '“我仿佛记得，他似乎说过今天不来。”她笑了笑，“不碍事，我们照常开场。”';
    expect(ids(text)).not.toContain('55');
  });

  it('不误伤正常叙述中的一两处模糊词', () => {
    const text = '走廊尽头的灯坏了，他仿佛看见一道影子，走近才发现是衣架。门缝里漏出一线光，落在地板上。';
    expect(ids(text)).not.toContain('55');
  });
});

describe('isLanguageHardline 阻断集合（AI 痕迹指纹 + 文笔/排版全部进硬伤，无降级旁路）', () => {
  it('AI 痕迹类规则号判为语言硬伤（阻断保存）', () => {
    for (const id of ['15b', '15c', '34', 'formula-sentence', 'dash-density', 'simile-density', '36', '37', '39', '42', '44', '46', '47', '48', '49', '55']) {
      expect(isLanguageHardline(id), id).toBe(true);
    }
  });

  it('文笔/排版类规则号同样判为语言硬伤（阻断保存，不再有 advisory 降级）', () => {
    for (const id of ['26-short-para', '26-uniform', '26b-staccato', '32', '33', '35', '35b']) {
      expect(isLanguageHardline(id), id).toBe(true);
    }
  });

  it('内容/节奏度量类不进语言硬线清单（由平台度量与提示词硬性要求承担）', () => {
    for (const id of ['40', '40b-opening-conflict', '41', '43', '45', '28a', '38', 'time-density']) {
      expect(isLanguageHardline(id), id).toBe(false);
    }
  });
});

describe('normalizeProseLayout 确定性排版规整（不增删正文）', () => {
  const fanqie = { platform: 'fanqie', storyType: 'short_story' };

  it('规则33：连续空行 ≥2 折叠为 1 个空行', () => {
    const a = '他把那叠纸摊在桌上，一页一页往后推，推到最后一页停住了，纸角有点卷。';
    const b = '她没有再说话，只是把手里的笔放下，笔尖磕在桌面上响了一声。';
    expect(normalizeProseLayout(`${a}\n\n\n\n${b}`)).toBe(`${a}\n\n${b}`);
  });

  it('规则26b：连续叙述碎片段合并（消除逐句换行）', () => {
    expect(normalizeProseLayout('翻开第一页。\n\n作者：阿遥。\n\n第二页。', fanqie))
      .toBe('翻开第一页。作者：阿遥。第二页。');
  });

  it('对话段一律不动（引号段不参与合并）', () => {
    const text = '“今天谁来接你？”\n\n“我姨妈来接。”';
    expect(normalizeProseLayout(text, fanqie)).toBe(text);
  });

  it('孤立的单个碎片不合并（前后被长段包夹时保留强调节奏）', () => {
    const text = '他把那叠纸摊在桌上，一页一页往后推，推到最后一页停住了，纸角有点卷。\n\n第二页。\n\n她没有再说话，只是把手里的笔放下，笔尖磕在桌面上响了一声。';
    expect(normalizeProseLayout(text, fanqie)).toBe(text);
  });

  it('合规性：只删除空白，正文非空白字符严格守恒', () => {
    const text = '甲。\n\n\n乙。\n\n“丙？”\n\n丁。';
    const out = normalizeProseLayout(text, fanqie);
    expect(out.replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
    expect(out.length).toBeLessThanOrEqual(text.length);
  });

  it('平台分化：13 字叙述段在短段平台合并、在非短段平台保留', () => {
    const a = '他抬起头看着窗外那一片浓黑。';
    const b = '风从窗缝里挤进来。';
    const text = `${a}\n\n${b}`;
    expect(normalizeProseLayout(text, { platform: 'qidian', storyType: 'long_novel' })).toBe(text);
    expect(normalizeProseLayout(text, fanqie)).toBe(`${a}${b}`);
  });

  it('段内多句号拍点（冰锥。后颈。没有搏斗。）不算一句一段，不被合并', () => {
    const text = '冰锥。后颈。没有搏斗。\n\n她把记录本合上了。';
    expect(normalizeProseLayout(text, fanqie)).toBe(text);
  });
});


describe('hardline-scanner 命中段落锚点（硬红线段落级精修的唯一位置来源）', () => {
  const anchorProfile = { platform: 'fanqie', storyType: 'short_story' };
  it('规则 15c：position「第 X 段」直接映射成段号与逐字原文', () => {
    const hit = '我写的这个结局不对劲。';
    const text = `第一段只是铺垫，没有任何问题。\n\n${hit}\n\n第三段收尾，同样正常。`;
    const finding = detectForbiddenTells(text, anchorProfile).find(f => f.ruleId === '15c');
    expect(finding).toBeTruthy();
    expect(finding!.paragraphIndices).toEqual([1]);
    expect(finding!.paragraphs).toEqual([hit]);
    expect(text.includes(finding!.paragraphs![0])).toBe(true);
  });

  it('规则 26-uniform：段级命中把涉及的三段整段锚出来（不是折叠摘要）', () => {
    const seg = '楼道的灯忽明忽暗地闪了闪';
    const p1 = `${seg}。`;
    const text = `${p1}\n\n${p1}\n\n${p1}\n\n最后一段是足够长的正常叙述，用来打断等长节奏，避免扫描器把全章都算进同一组。`;
    const finding = detectForbiddenTells(text, anchorProfile).find(f => f.ruleId === '26-uniform');
    expect(finding).toBeTruthy();
    expect(finding!.paragraphIndices).toEqual([0, 1, 2]);
    expect(finding!.paragraphs).toEqual([p1, p1, p1]);
  });

  it('规则 35：position「offset N-M」映射成窗口真正覆盖到的段落', () => {
    const sentence = '他把手里的单据又看了一遍，数字没有变，墨迹也没有变，';
    const flat = `${sentence.repeat(8)}他把单据叠好放回口袋。`;
    const text = `${flat}\n\n第二段有问号？也有感叹号！`;
    const finding = detectForbiddenTells(text, anchorProfile).find(f => f.ruleId === '35');
    expect(finding).toBeTruthy();
    expect(finding!.position.startsWith('offset 0-')).toBe(true);
    expect(finding!.paragraphIndices).toEqual([0]);
    expect(finding!.paragraphs).toEqual([flat]);
  });

  it('纯计数类命中（规则 43 全章无不完美细节）不编造锚点', () => {
    const text = '他把手机放回口袋，屏幕亮着，时间还在走。';
    const finding = detectForbiddenTells(text, anchorProfile).find(f => f.ruleId === '43');
    expect(finding).toBeTruthy();
    expect(finding!.paragraphs).toBeUndefined();
    expect(finding!.paragraphIndices).toBeUndefined();
  });

  it('不变量：凡带锚点的命中，锚点必须是正文逐字原文且段号与原文一一对应', () => {
    const seg = '楼道的灯忽明忽暗地闪了闪';
    const long = '他把手里的单据又看了一遍，数字没有变，墨迹也没有变，他把手里的单据又看了一遍，数字没有变，墨迹也没有变，他把手里的单据又看了一遍，数字没有变，墨迹也没有变，他把手里的单据又看了一遍，数字没有变，墨迹也没有变。';
    const text = [
      '他站在门口，手停在半空，没有敲门。',
      `${seg}。`,
      `${seg}。`,
      `${seg}。`,
      long,
      '我写的这个结局不对劲。',
    ].join('\n\n');
    const findings = detectForbiddenTells(text, anchorProfile);
    expect(findings.length).toBeGreaterThan(0);
    const list = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    let anchored = 0;
    for (const f of findings) {
      if (!f.paragraphs) continue;
      expect(f.paragraphIndices).toBeDefined();
      expect(f.paragraphIndices!.length).toBe(f.paragraphs.length);
      for (let i = 0; i < f.paragraphs.length; i++) {
        expect(text.includes(f.paragraphs[i])).toBe(true);
        expect(list[f.paragraphIndices![i]]).toBe(f.paragraphs[i]);
        anchored++;
      }
    }
    expect(anchored).toBeGreaterThan(0);
  });
});

describe('hardline-scanner 规则32 人名/称谓独占一行（肯定式白名单判据 · 生产误报回归）', () => {
  // 夹具 = 番茄短篇《末班地铁的第十一站》(项目 bcfd17de) 第一稿被判出的 32 条命中原文中抽样。
  // 全部是普通叙述句：旧的反向判据（短段 + 段首 2-4 汉字 + 动作/代词黑名单）把它们全判成
  // 「姓名/称谓段独立成段」，32 条互斥（都要求「与上下文合并」）导致精修无法收敛、正文 422 不保存。
  const productionFalsePositives = [
    '报站的女声从显示屏后面出来时，我的手搭在制动手柄上。',
    '报站那一声落下去，三个人先后抬头。',
    '又按一次。还是它。',
    '不是电流串音。',
    '几秒后。',
    '东堤到站，0:52。',
    '车厢空着。回库是1:30。',
    '手指在制动手柄上停了两秒。',
    '显示屏上「下一站，槐荫路」还亮着。',
    '老周坐在桌子后面，面前摊着本行车日志。他抬了下下巴。',
    '老周把手里那本合上，推过来。',
  ];
  const names = ['陈默', '母亲', '林姐', '老周', '赵明', '老爷'];
  const rule32 = (text: string, characterNames?: string[]) =>
    detectForbiddenTells(text, { platform: 'fanqie', storyType: 'short_novel', characterNames })
      .filter(f => f.ruleId === '32');

  it('生产误报样本 0 命中（含段首恰是本书人名的正常叙述句）', () => {
    for (const p of productionFalsePositives) {
      const text = `他把车速慢慢降了下来，手一直搭在制动手柄上。\n\n${p}\n\n窗外的灯一盏一盏往后退去。`;
      expect(rule32(text, names), p).toEqual([]);
    }
  });

  it('真·人名/称谓独占一行仍命中（判据只认本书白名单，其余一律不报）', () => {
    for (const p of ['陈默。', '赵明！']) {
      const text = `他把外套挂在门口，回身看了一眼墙上的钟。\n\n${p}\n\n他说这句话的时候没有抬头。`;
      const found = rule32(text, names);
      expect(found.length, p).toBe(1);
      expect(found[0].snippet).toBe(p);
      expect(found[0].paragraphs).toEqual([p]);
      expect(found[0].paragraphIndices).toEqual([1]);
    }
  });

  it('真实故障样本：姓名起句的动作与判断不是姓名独占段', () => {
    for (const p of ['林野抬脚，跨过门槛。', '林野往前走。', '赵明会死。', '老爷进来了。']) {
      const text = `门后传来一声轻响。\n\n${p}\n\n他停住脚，听见纸页在屋里翻动。`;
      expect(rule32(text, [...names, '林野']), p).toEqual([]);
    }
  });

  it('白名单外的人名不猜词（「李四。」在本书不是角色时不算命中）', () => {
    const text = '他把外套挂在门口，回身看了一眼墙上的钟。\n\n李四。\n\n他说这句话的时候没有抬头。';
    expect(rule32(text, names)).toEqual([]);
  });

  it('无白名单时规则 32 不猜词（不制造无法收敛的误报风暴）', () => {
    const text = '他把外套挂在门口。\n\n赵明会死。\n\n他说这句话的时候没有抬头。';
    expect(rule32(text)).toEqual([]);
    expect(rule32(text, [])).toEqual([]);
  });

  it('上一段是问句/引语时属应答式独立成段，不判姓名孤立', () => {
    const text = '“谁去？”\n\n赵明。\n\n他没有再说话。';
    expect(rule32(text, names)).toEqual([]);
  });

  it('说话人提示语不算姓名孤立', () => {
    const text = '他把外套挂在门口。\n\n赵明说。\n\n他说这句话的时候没有抬头。';
    expect(rule32(text, names)).toEqual([]);
  });

  it('阻断集合不变量：32 仍在 LANGUAGE_HARDLINE_RULE_IDS（本轮只是收紧判据，不是退出硬线）', () => {
    expect(isLanguageHardline('32')).toBe(true);
  });
});
it('破折号过密提供全部真实坐标，且标点平板修法不再要求继续加破折号', () => {
  const dashParagraphs = Array.from({ length: 11 }, (_, i) => `第${i + 1}道门——门轴上留下不同深浅的旧漆和铁锈。`);
  const flat = '他沿着楼道往前走，摸到墙上的旧刻痕，又把卷尺收回口袋。'.repeat(22);
  const content = [...dashParagraphs, flat].join('\n\n');
  const findings = detectForbiddenTells(content, { platform: 'fanqie', storyType: 'short_story' });
  const density = findings.find(f => f.ruleId === 'dash-density');
  expect(density?.hitCharOffsets).toHaveLength(11);
  expect(density?.paragraphIndices).toHaveLength(11);
  expect(density?.occurrenceCount).toBe(11);
  expect(findings.find(f => f.ruleId === '35')?.message).toContain('不得靠新增破折号');
  expect(findings.find(f => f.ruleId === '35b')?.message).toContain('不得靠新增破折号');
  expect(findings.find(f => f.ruleId === '35')?.occurrenceCount).toBeGreaterThan(1);
  expect(findings.find(f => f.ruleId === '35b')?.occurrenceCount).toBeGreaterThan(1);
});

// ===== 规则35b 坐标锚定回归（生产病例：正文 422 存不下来 / 同一条 Gate 反复命中） =====
describe('hardline-scanner 规则35b 坐标锚定（回归：派生串偏移会改错段落、正文存不下来）', () => {
  // 旧实现用 narrationOnly = content.replace(...) 这个【派生串】当坐标：snippet/position 都是派生串偏移，
  // 回映射后落在别的段落上——正文里根本没有那段（出现 “” 这种剥引号残迹），
  // 段落级精修锚不到证据 → 中止 → 保留上一版正文 → 正文 422 存不下来。
  // 现在派生串只用于「判定」，证据与坐标一律回映射到正文真实下标（stripQuotedWithMap + hitCharOffsets）。
  const dialogue = '“末班车刚走。”调度说。';
  const narration = Array.from({ length: 7 }, (_, i) =>
    `第${i + 1}天，他沿着站台往前走，数着地上的编号，脚步不快不慢，像在等一件迟早会发生的事，风从隧道里出来，吹得衣角贴在腿上，他没有停，只是把手插进外套口袋里攥紧了。`
  ).join('\n\n');
  const content = `${dialogue}\n\n${narration}`;
  const flat35b = () =>
    detectForbiddenTells(content, { platform: 'fanqie', storyType: 'short_novel' }).filter(f => f.ruleId === '35b');

  it('前置条件：引号外叙述足够长且标点平板（否则本回归无效）', () => {
    expect(narration.length).toBeGreaterThan(480);
    expect(/[!?！？…—;:：]/.test(narration)).toBe(false);
    expect(content).toContain('“');
  });

  it('证据 snippet 在正文里逐字存在，且不含剥引号残迹', () => {
    const [f] = flat35b();
    expect(f).toBeTruthy();
    // snippet 由 slice(s, 80) 生成：超 80 字时以 … 结尾；锚定侧同样剥 …（hardline-scanner.ts spansFromSnippet:1407）。
    // 夹具若不剥 … 就会自己误报失败。→ 先剥 … 再逐字比对正文。
    const bare = f.snippet!.replace(/…+$/, '');
    expect(content).toContain(bare);
    // 「剥引号残迹」= 相邻引号对（生产病例原文：“”他的声音压低了，“”）。
    // 正常对话段带引号是合法叙事，不能断言「不含引号」；要断言的是「不含被剥空后留下的引号对」。
    expect(/[“”"]{2}/.test(f.snippet!)).toBe(false);
  });

  it('position 是正文真实 offset：按该区间切正文即以 snippet 开头', () => {
    const [f] = flat35b();
    const m = /^offset (\d+)-(\d+)$/.exec(f.position || '');
    expect(m).toBeTruthy();
    const start = Number(m![1]);
    const end = Number(m![2]);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeLessThanOrEqual(content.length);
    const bare = f.snippet!.replace(/…+$/, '');
    expect(content.slice(start, end).startsWith(bare)).toBe(true);
  });

  it('hitCharOffsets 给出多段真实段落起点，paragraphs 与正文逐字一致', () => {
    const [f] = flat35b();
    const offsets = f.hitCharOffsets || [];
    expect(offsets.length).toBeGreaterThan(1);
    expect(f.paragraphs?.length).toBe(offsets.length);
    expect(f.paragraphIndices?.length).toBe(offsets.length);
    offsets.forEach((off, k) => {
      const p = f.paragraphs![k];
      expect(content.indexOf(p)).toBe(off);
      expect(content.slice(off).startsWith(p)).toBe(true);
    });
  });
});
