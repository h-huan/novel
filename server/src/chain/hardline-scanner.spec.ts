import { describe, it, expect } from 'vitest';
import { detectForbiddenTells, isLanguageHardline } from './hardline-scanner';

const ids = (text: string, platform = 'fanqie', storyType = 'short_novel') =>
  detectForbiddenTells(text, { platform, storyType }).map(f => f.ruleId);

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

describe('isLanguageHardline 阻断集合（AI 痕迹指纹进硬伤、段落节奏不进）', () => {
  it('AI 痕迹类规则号判为语言硬伤（阻断保存）', () => {
    for (const id of ['15b', '15c', '34', 'formula-sentence', 'dash-density', 'simile-density', '36', '37', '39', '42', '44', '46', '47', '48', '49', '55']) {
      expect(isLanguageHardline(id), id).toBe(true);
    }
  });

  it('段落节奏/排版类规则号不判为语言硬伤（仍走 advisory）', () => {
    for (const id of ['26-short-para', '26-uniform', '32', '33', '35', '40', '40b-opening-conflict', '41', '43', '45']) {
      expect(isLanguageHardline(id), id).toBe(false);
    }
  });
});
