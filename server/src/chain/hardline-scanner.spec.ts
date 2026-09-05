import { describe, it, expect } from 'vitest';
import { detectForbiddenTells } from './hardline-scanner';

const ids = (text: string, platform = 'fanqie', storyType = 'short_novel') =>
  detectForbiddenTells(text, { platform, storyType }).map(f => f.ruleId);

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
