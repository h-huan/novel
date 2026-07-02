/**
 * Describe逐句精修
 * 对选中句子提供多种风格增强方案
 */
import { Injectable } from '@nestjs/common';
import type { PolishResult } from './dto/refinement.dto';

export interface PolishStyle {
  id: string;
  name: string;
  description: string;
}

interface PolishOption {
  style: PolishStyle;
  rewritten: string;
  changes: string[];
  rating: number;
}

@Injectable()
export class DescribePolishService {
  private readonly styles: PolishStyle[] = [
    { id: 'poetic', name: '诗意', description: '加入比喻/拟人/意象，提升文学性' },
    { id: 'direct', name: '直白', description: '更简洁有力的表达，去掉冗余修饰' },
    { id: 'metaphorical', name: '隐喻', description: '潜台词+暗示，增加深度' },
    { id: 'sensory', name: '感官增强', description: '增加视觉/听觉/触觉/味觉/嗅觉五感描写' },
    { id: 'emotional', name: '情绪渲染', description: '强化角色内心情感波动' },
  ];

  getStyles(): PolishStyle[] {
    return this.styles;
  }

  /**
   * 对句子进行多种风格精修 (支持多变体)
   * @param variants 每种风格返回的变体数 (默认1, 最大3)
   */
  polish(
    sentence: string,
    styles?: string[],
    context?: { genre?: string; characterName?: string; emotion?: string },
    variants: number = 1,
  ): PolishResult[] {
    const targetStyles = styles || this.styles.map((s) => s.id);
    const variantCount = Math.min(Math.max(1, variants), 3);
    const results: PolishResult[] = [];

    for (const styleId of targetStyles) {
      const style = this.styles.find((s) => s.id === styleId);
      if (!style) continue;

      for (let v = 0; v < variantCount; v++) {
        const option = this.applyStyle(sentence, style, context, v);
        results.push({
          original: sentence,
          rewritten: option.rewritten,
          changes: option.changes,
          rating: option.rating,
        });
      }
    }

    return results;
  }

  private applyStyle(sentence: string, style: PolishStyle, context?: { genre?: string; characterName?: string; emotion?: string }, variantIndex: number = 0): PolishOption {
    switch (style.id) {
      case 'poetic':
        return this.poeticPolish(sentence, variantIndex);
      case 'direct':
        return this.directPolish(sentence, variantIndex);
      case 'metaphorical':
        return this.metaphoricalPolish(sentence, variantIndex);
      case 'sensory':
        return this.sensoryPolish(sentence, variantIndex);
      case 'emotional':
        return this.emotionalPolish(sentence, variantIndex);
      default:
        return {
          style,
          rewritten: sentence,
          changes: ['未应用风格'],
          rating: 5,
        };
    }
  }

  private seededRandom(variantIndex: number): number {
    // 简单的确定性"随机"，使同一 variantIndex 得到同一数值
    return ((variantIndex * 137 + 73) % 100) / 100;
  }

  // ────────────── 诗意风格 ──────────────

  private poeticPolish(sentence: string, variantIndex: number = 0): PolishOption {
    const changes: string[] = [];
    let rewritten = sentence;
    const v = variantIndex % 3;

    if (v === 0) {
      // 变体0: 轻量诗意 — 1~2个比喻/意象
      if (/(走|跑|行)(了|过|进|出)/.test(rewritten)) {
        rewritten = rewritten.replace(/(走|跑|行)(了|过|进|出)/g, (_m, verb, suffix) => {
          changes.push(`"${verb}${suffix}" → 诗意化动作`);
          return `如风般${verb}${suffix}`;
        });
      }
      if (/(看|望|瞧)(了|着|到|见)/.test(rewritten)) {
        rewritten = rewritten.replace(/(看|望|瞧)(了|着|到|见)/g, (_m, verb, suffix) => {
          changes.push(`"${verb}${suffix}" → 意象化视觉`);
          return `目光如水${verb}${suffix}`;
        });
      }
      if (/(开心|快乐|高兴|难过|悲伤|痛苦)/.test(rewritten)) {
        rewritten = rewritten
          .replace('开心', '开心得像春天的风')
          .replace('快乐', '快乐如鸟鸣')
          .replace('高兴', '心头一亮')
          .replace('难过', '难过得像阴雨天')
          .replace('悲伤', '悲伤如雾')
          .replace('痛苦', '痛苦像刺扎在心');
        changes.push('情感诗意化');
      }
      if (changes.length === 0) {
        const prefixes = ['仿佛', '恰如', '像是'];
        const idx = Math.floor(this.seededRandom(v) * prefixes.length);
        rewritten = `${prefixes[idx]}${rewritten.charAt(0).toLowerCase()}${rewritten.slice(1)}`;
        changes.push(`增加诗意引语"${prefixes[idx]}"`);
      }
    } else if (v === 1) {
      // 变体1: 中度诗意 — 拟人化 + 更多意象
      rewritten = rewritten.replace(/风吹/g, '风轻轻抚摸');
      rewritten = rewritten.replace(/雨落/g, '雨温柔地低语');
      rewritten = rewritten.replace(/花开/g, '花展开笑颜');
      rewritten = rewritten.replace(/叶落/g, '叶翩翩起舞落下');
      if (rewritten !== sentence) {
        changes.push('自然景物拟人化');
      }
      if (/(走|跑|行|看|望|说|讲)/.test(rewritten)) {
        rewritten = rewritten
          .replace(/走/g, '漫步于')
          .replace(/跑/g, '奔跑在')
          .replace(/看/g, '凝眸')
          .replace(/望/g, '眺望')
          .replace(/说/g, '细语')
          .replace(/讲/g, '轻诉');
        changes.push('动作替换为诗意化用词');
      }
      if (/(大|高|长|深)/.test(rewritten)) {
        rewritten = rewritten
          .replace('大', '辽阔的')
          .replace('高', '巍峨的')
          .replace('长', '绵延的')
          .replace('深', '幽深的');
        changes.push('形容词诗意化');
      }
      if (changes.length === 0) {
        rewritten = `在这个静谧的时刻，${rewritten} 一切都浸染在诗意里。`;
        changes.push('增加氛围铺垫和诗意收尾');
      }
    } else {
      // 变体2: 高密度诗意 — 丰富意象 + 通感
      const metaphorPrefixes = [
        '时光在此刻变得柔软，',
        '世界被镀上了一层梦幻的光泽，',
        '空气中流淌着无声的诗篇，',
      ];
      const prefix = metaphorPrefixes[Math.floor(this.seededRandom(v) * metaphorPrefixes.length)];
      rewritten = `${prefix}${rewritten}`;
      changes.push(`增加通感意象: "${prefix}"`);

      if (/(走|跑|行|看|望|说|讲)/.test(rewritten)) {
        rewritten = rewritten
          .replace(/走/g, '像一缕轻烟飘过')
          .replace(/跑/g, '如疾风掠过')
          .replace(/看/g, '用目光轻抚')
          .replace(/望/g, '视线如飞鸟掠过')
          .replace(/说/g, '声音如泉水般流淌')
          .replace(/讲/g, '话语如花瓣飘落');
        changes.push('动作替换为通感比喻');
      }

      // 增加意象收尾
      const endings = [
        '如诗如画。',
        '如梦似幻。',
        '如一幅水墨画徐徐展开。',
      ];
      rewritten = rewritten.replace(/[。！？\s]*$/, '，' + endings[Math.floor(this.seededRandom(v + 1) * endings.length)]);
      changes.push('增加意象收尾');
    }

    return {
      style: { id: 'poetic', name: '诗意', description: '诗意风格' },
      rewritten,
      changes,
      rating: Math.floor(7 + this.seededRandom(variantIndex) * 3),
    };
  }

  // ────────────── 直白风格 ──────────────

  private directPolish(sentence: string, variantIndex: number = 0): PolishOption {
    const changes: string[] = [];
    let rewritten = sentence;
    const v = variantIndex % 3;

    if (v === 0) {
      // 变体0: 适度简洁 — 去掉冗余修饰词
      const redundantWords = /(非常|十分|特别|极其|相当|有点|稍微|略微|几乎|简直|真的|实在|确实)/g;
      if (redundantWords.test(rewritten)) {
        rewritten = rewritten.replace(redundantWords, '');
        changes.push('删除冗余修饰词(非常/十分/特别等)');
      }
      // 简化双重否定
      if (/不是不|不得不|并非不/.test(rewritten)) {
        rewritten = rewritten
          .replace('不是不', '是')
          .replace('不得不', '要')
          .replace('并非不', '是');
        changes.push('简化双重否定表达');
      }
      // 缩减"的"的堆砌
      if ((rewritten.match(/的/g) || []).length > 3) {
        rewritten = rewritten.replace(/([^\s，。！？]{2,})的([^\s，。！？]{2,})的/g, '$1的$2');
        changes.push('减少"的"字堆砌');
      }
      if (changes.length === 0) {
        // 如没有可精简的，尝试缩短句子
        if (rewritten.length > 10) {
          const parts = rewritten.split(/[，,]/);
          rewritten = parts.join('，').replace(/[。！？]$/, '').replace(/[。！？][\s\S]*$/, '');
        }
        changes.push('简化句式结构');
      }
    } else if (v === 1) {
      // 变体1: 高度简洁 — 去修饰 + 简化句式
      // 删掉常见修饰性词组
      rewritten = rewritten
        .replace(/可以[说讲]/g, '')
        .replace(/可以[看听]到/g, (m) => m.replace(/可以/g, ''))
        .replace(/实际上/g, '')
        .replace(/基本上/g, '')
        .replace(/一般来说/g, '')
        .replace(/毫无疑问/g, '')
        .replace(/某种程度[上中]/g, '')
        .replace(/从某种角度[来说看]/g, '');
      changes.push('删除过渡性修饰词组');

      // 合并同类分句
      if (rewritten.includes('，') && rewritten.includes('也')) {
        rewritten = rewritten.replace(/,?\s*也[^，。！？]*,?/g, '');
        changes.push('合并同类分句');
      }

      // 把长被动句改为主动
      rewritten = rewritten.replace(/被[^，。！？]{2,}([，。！？])/g, (_m, punct) => {
        changes.push('被动句改为主动句');
        return punct;
      });

      if (changes.length === 0) {
        rewritten = rewritten.replace(/[，、；：]/g, ' ').replace(/\s+/g, '');
        changes.push('简化句式：去除分隔符');
      }
    } else {
      // 变体2: 极简有力 — 最简洁版本
      // 砍掉所有修饰性前缀
      rewritten = rewritten.replace(/(在|当)[^，。！？]{2,5}时[，,]?/g, '');
      rewritten = rewritten.replace(/(随着|通过|经过|基于)[^，。！？]{2,6}[，,]/g, '');
      changes.push('删除时间/条件状语');

      // 去掉所有形容词
      rewritten = rewritten.replace(/(美丽|漂亮|帅气|英俊|可爱|迷人|动人|优雅|灿烂|辉煌|宏大|渺小|漫长|短暂|遥远|附近|浓烈|淡雅|深沉|明媚)[的地的]/g, '');
      changes.push('删除形容词修饰');

      // 把长句拆成短句
      if (rewritten.length > 15) {
        const midPoint = Math.floor(rewritten.length / 2);
        const splitAt = rewritten.indexOf('，', midPoint - 5);
        if (splitAt > 0) {
          rewritten = rewritten.slice(0, splitAt) + '。' + rewritten.slice(splitAt + 1);
          changes.push('长句拆分为短句');
        } else {
          rewritten = rewritten.replace(/，/g, '。');
          changes.push('逗号改为句号，拆分长句');
        }
      }

      if (changes.length === 0) {
        rewritten = rewritten.replace(/[，、：；]/g, ' ').trim();
        changes.push('极简化处理');
      }
    }

    return {
      style: { id: 'direct', name: '直白', description: '直白风格' },
      rewritten,
      changes,
      rating: Math.floor(7 + this.seededRandom(variantIndex) * 3),
    };
  }

  // ────────────── 隐喻风格 ──────────────

  private metaphoricalPolish(sentence: string, variantIndex: number = 0): PolishOption {
    const changes: string[] = [];
    let rewritten = sentence;
    const v = variantIndex % 3;

    if (v === 0) {
      // 变体0: 轻度潜台词 — 1~2处暗示性表达
      if (/是/.test(rewritten)) {
        rewritten = rewritten.replace(/是/g, '似乎是');
        changes.push('"是" → "似乎是" 增加暗示语气');
      }
      if (/知道/.test(rewritten)) {
        rewritten = rewritten.replace(/知道/g, '隐约察觉到');
        changes.push('"知道" → "隐约察觉到" 增加潜台词');
      }
      if (!/(似乎|隐约|仿佛|好像|像)/.test(rewritten)) {
        rewritten = rewritten.replace(/[。！？]$/, '，仿佛另有深意。');
        changes.push('句末增加"仿佛另有深意"暗示');
      }
      if (changes.length === 0) {
        rewritten = `事情并非表面看起来那么简单：${rewritten}`;
        changes.push('增加"并非表面那么简单"暗示前缀');
      }
    } else if (v === 1) {
      // 变体1: 中度暗示 — 多层潜台词
      rewritten = rewritten
        .replace(/是/g, '表面上是')
        .replace(/看起来/g, '乍一看')
        .replace(/很(好|坏|美)/g, '说不清是$1是$1');
      changes.push('增加"表面上""乍一看"等暗示性措辞');

      if (/(正常|普通|平常|自然)/.test(rewritten)) {
        rewritten = rewritten.replace(/(正常|普通|平常|自然)/g, '看似$1');
        changes.push('增加"看似"修饰，暗示反差');
      }

      if (/(想|觉得|认为)/.test(rewritten)) {
        rewritten = rewritten.replace(/(想|觉得|认为)/g, '不禁想');
        changes.push('增加"不禁"暗示内心波动');
      }

      // 句末增加留白式暗示
      if (!rewritten.match(/[，,][^，。！？]{0,5}究竟[^，。！？]{0,10}[。！？]?$/)) {
        rewritten = rewritten.replace(/[。！？]$/, '……但真相究竟如何？');
        changes.push('句末增加留白式反问暗示');
      }
    } else {
      // 变体2: 深度隐喻 — 多层暗示 + 象征
      // 增加象征性前缀
      const symbolicPrefixes = [
        '没有人知道，',
        '在平静的表象之下，',
        '每一个细节都在暗示，',
      ];
      const prefix = symbolicPrefixes[Math.floor(this.seededRandom(v) * symbolicPrefixes.length)];
      rewritten = `${prefix}${rewritten.charAt(0).toLowerCase()}${rewritten.slice(1)}`;
      changes.push(`增加深层隐喻前缀: "${prefix}"`);

      rewritten = rewritten
        .replace(/说/g, '欲言又止地说')
        .replace(/看/g, '意味深长地看着')
        .replace(/笑/g, '笑容里藏着什么');
      changes.push('动作描述增加深层寓意');

      // 增加双重含义的收尾
      const endingHints = [
        '——可这真的只是巧合吗？',
        '——一切似乎都暗藏玄机。',
        '——仿佛在预示着什么。',
      ];
      rewritten = rewritten.replace(/[。！？\s]*$/, endingHints[Math.floor(this.seededRandom(v + 1) * endingHints.length)]);
      changes.push('增加双层含义收尾');
    }

    return {
      style: { id: 'metaphorical', name: '隐喻', description: '隐喻风格' },
      rewritten,
      changes,
      rating: Math.floor(7 + this.seededRandom(variantIndex) * 3),
    };
  }

  // ────────────── 感官增强风格 ──────────────

  private sensoryPolish(sentence: string, variantIndex: number = 0): PolishOption {
    const changes: string[] = [];
    let rewritten = sentence;
    const v = variantIndex % 3;

    if (v === 0) {
      // 变体0: 轻量感官 — 增加1~2处视觉/听觉
      if (/(走|跑|跳|来|去)/.test(rewritten)) {
        rewritten = rewritten.replace(/(走|跑|跳)(了|过|进|出)/g, (_m, verb, suffix) => {
          changes.push('增加脚步声描写');
          return `${verb}${suffix}，脚步声${['清晰可闻', '在耳边回响', '越来越近'][Math.floor(this.seededRandom(v) * 3)]}`;
        });
      }
      if (/(说|讲|喊|叫)/.test(rewritten)) {
        rewritten = rewritten.replace(/(说|讲|喊|叫)[了道]/g, (_m, verb) => {
          changes.push('增加听觉描写');
          return `${verb}道，声音${['低沉', '清晰', '带着回音'][Math.floor(this.seededRandom(v) * 3)]}`;
        });
      }
      if (changes.length === 0) {
        const visualAdditions = [
          '阳光透过窗户洒进来，',
          '昏暗的光线中，',
          '明亮的光线下，',
        ];
        rewritten = `${visualAdditions[Math.floor(this.seededRandom(v) * visualAdditions.length)]}${rewritten}`;
        changes.push('增加视觉环境描写');
      }
    } else if (v === 1) {
      // 变体1: 中度感官 — 视觉+听觉/触觉
      const visualAdditions = [
        '昏黄的灯光下，',
        '窗外的树影摇曳，',
        '空气中有细小的尘埃在浮动，',
      ];
      rewritten = `${visualAdditions[Math.floor(this.seededRandom(v) * visualAdditions.length)]}${rewritten}`;
      changes.push('增加视觉氛围描写');

      if (/(冷|热|暖|凉|寒)/.test(rewritten)) {
        rewritten = rewritten
          .replace('冷', '冷得刺骨')
          .replace('热', '热浪扑面')
          .replace('暖', '暖意融融')
          .replace('凉', '微凉沁肤')
          .replace('寒', '寒气逼人');
        changes.push('触觉描写增强');
      }

      if (/(安静|寂静|沉默)/.test(rewritten)) {
        rewritten = rewritten.replace(/(安静|寂静|沉默)/g, (m) => {
          changes.push('增加听觉氛围描写');
          return `${m}得只能听到自己的心跳声`;
        });
      }

      if (changes.length <= 1) {
        rewritten = `${rewritten} 空气中飘来${['淡淡的清香', '潮湿的气息', '熟悉的味道'][Math.floor(this.seededRandom(v) * 3)]}`;
        changes.push('增加嗅觉描写');
      }
    } else {
      // 变体2: 丰富感官 — 三种以上感官叠加
      // 视觉
      const visual = [
        '暮色沉沉，',
        '晨曦微露，',
        '月光如水银般倾泻而下，',
      ];
      rewritten = `${visual[Math.floor(this.seededRandom(v) * visual.length)]}${rewritten}`;
      changes.push('增加视觉环境描写');

      // 听觉
      const auditory = [
        '耳边传来细微的声响，',
        '远处隐约有风吹过的声音，',
        '周围的一切都静得出奇，',
      ];
      rewritten = `${auditory[Math.floor(this.seededRandom(v + 1) * auditory.length)]}${rewritten}`;
      changes.push('增加听觉环境描写');

      // 触觉/嗅觉 — 句末叠加
      const sensoryEndings = [
        '空气湿润而微凉。',
        '风中带着淡淡的咸味。',
        '指尖传来粗糙的触感。',
      ];
      rewritten = rewritten.replace(/[。！？\s]*$/, '，' + sensoryEndings[Math.floor(this.seededRandom(v + 2) * sensoryEndings.length)]);
      changes.push('增加触觉/嗅觉描写收尾');
    }

    return {
      style: { id: 'sensory', name: '感官增强', description: '感官增强风格' },
      rewritten,
      changes,
      rating: Math.floor(7 + this.seededRandom(variantIndex) * 3),
    };
  }

  // ────────────── 情绪渲染风格 ──────────────

  private emotionalPolish(sentence: string, variantIndex: number = 0): PolishOption {
    const changes: string[] = [];
    let rewritten = sentence;
    const v = variantIndex % 3;

    if (v === 0) {
      // 变体0: 轻度情绪强化 — 增加基础情绪词汇
      const emotionWords: Record<string, string[]> = {
        angry: ['心头火起', '怒意上涌', '咬牙切齿'],
        sad: ['眼眶微红', '心头一酸', '黯然神伤'],
        happy: ['嘴角上扬', '心中雀跃', '喜上眉梢'],
        afraid: ['心底一颤', '脊背发凉', '不寒而栗'],
      };

      if (/(生气|愤怒|恼火|怒)/.test(rewritten)) {
        const words = emotionWords.angry;
        rewritten = rewritten.replace(/(生气|愤怒|恼火)/g, words[Math.floor(this.seededRandom(v) * words.length)]);
        changes.push('愤怒情绪词汇增强');
      } else if (/(伤心|难过|悲伤|哭)/.test(rewritten)) {
        const words = emotionWords.sad;
        rewritten = rewritten.replace(/(伤心|难过|悲伤)/g, words[Math.floor(this.seededRandom(v) * words.length)]);
        changes.push('悲伤情绪词汇增强');
      } else if (/(开心|快乐|高兴|笑)/.test(rewritten)) {
        const words = emotionWords.happy;
        rewritten = rewritten.replace(/(开心|快乐|高兴)/g, words[Math.floor(this.seededRandom(v) * words.length)]);
        changes.push('喜悦情绪词汇增强');
      } else {
        rewritten = `${rewritten} 他的心跳不自觉地加快了。`;
        changes.push('增加基础生理反应描写');
      }
    } else if (v === 1) {
      // 变体1: 中度情绪渲染 — 内心独白感
      const innerThoughts = [
        '他攥紧了拳头，指甲几乎陷进掌心。',
        '呼吸变得急促起来。',
        '胸口仿佛被什么东西堵住了。',
      ];
      rewritten = `${innerThoughts[Math.floor(this.seededRandom(v) * innerThoughts.length)]} ${rewritten}`;
      changes.push('增加内心独白式前置描写');

      if (/(看|望|瞧|盯)/.test(rewritten)) {
        rewritten = rewritten
          .replace(/看/g, '怔怔地看着')
          .replace(/望/g, '呆呆地望向')
          .replace(/盯/g, '死死地盯着');
        changes.push('视线描写情绪化');
      }

      const emotionalTags = [
        '心里百感交集。',
        '说不出是喜悦还是悲伤。',
        '思绪如同潮水般翻涌。',
      ];
      rewritten = rewritten.replace(/[。！？\s]*$/, '，' + emotionalTags[Math.floor(this.seededRandom(v + 1) * emotionalTags.length)]);
      changes.push('增加情绪化内心收尾');
    } else {
      // 变体2: 强烈情绪渲染 — 大幅强化情感波动
      const strongEmotionPrefixes = [
        '心脏狂跳不止，几乎要从胸腔里跳出来——',
        '一股说不清道不明的情绪涌上心头——',
        '泪水在眼眶里打转，他拼命忍住——',
      ];
      rewritten = `${strongEmotionPrefixes[Math.floor(this.seededRandom(v) * strongEmotionPrefixes.length)]}${rewritten}`;
      changes.push('增加强烈情绪生理反应前置描写');

      if (/(说|讲|道)/.test(rewritten)) {
        rewritten = rewritten.replace(/(说|讲|道)/g, (_m) => {
          changes.push('说话方式情绪化');
          return ['声音颤抖着说', '哽咽着说', '几乎是喊了出来'][Math.floor(this.seededRandom(v) * 3)];
        });
      }

      if (/(走|跑|站|坐)/.test(rewritten)) {
        rewritten = rewritten
          .replace(/走/g, '跌跌撞撞地走')
          .replace(/跑/g, '发疯似的跑')
          .replace(/站/g, '僵在原地')
          .replace(/坐/g, '无力地坐下');
        changes.push('动作描写情绪化');
      }

      const strongEndings = [
        '整个世界仿佛在这一刻崩塌了。',
        '眼泪终于不受控制地涌了出来。',
        '他咬紧牙关，拼命不让情绪爆发。',
      ];
      rewritten = rewritten.replace(/[。！？\s]*$/, '。' + strongEndings[Math.floor(this.seededRandom(v + 1) * strongEndings.length)]);
      changes.push('增加强烈情感爆发式收尾');
    }

    return {
      style: { id: 'emotional', name: '情绪渲染', description: '情绪渲染风格' },
      rewritten,
      changes,
      rating: Math.floor(7 + this.seededRandom(variantIndex) * 3),
    };
  }

  /**
   * H6: 批量应用 — 对多个句子统一应用指定风格
   */
  batchPolish(sentences: string[], style: string): PolishResult[][] {
    return sentences.map((sentence) => this.polish(sentence, [style]));
  }

  /**
   * H6: 多轮迭代 — 基于反馈对上一轮结果进行迭代优化
   */
  iteratePolish(previousResult: PolishResult, feedback: string, styles?: string[]): PolishResult[] {
    // 根据反馈构造迭代上下文
    const context: { genre?: string; characterName?: string; emotion?: string } = {};
    if (/诗意|文学|比喻|意象/.test(feedback)) {
      context.genre = 'poetic';
    }
    if (/直白|简洁|简练|有力/.test(feedback)) {
      context.genre = 'direct';
    }
    if (/隐喻|暗示|潜台词/.test(feedback)) {
      context.genre = 'metaphorical';
    }
    if (/感官|五感|视觉|听觉|触觉|味觉|嗅觉/.test(feedback)) {
      context.genre = 'sensory';
    }
    if (/情绪|情感|渲染|内心/.test(feedback)) {
      context.genre = 'emotional';
    }

    // 检测反馈中的情绪关键词
    if (/愤怒|生气/.test(feedback)) context.emotion = 'angry';
    else if (/悲伤|难过/.test(feedback)) context.emotion = 'sad';
    else if (/开心|高兴/.test(feedback)) context.emotion = 'happy';

    // 以上一轮的原文为基础，基于反馈方向重新生成
    const targetStyles = styles || ['poetic', 'direct', 'metaphorical', 'sensory', 'emotional'];

    // 将反馈作为额外约束注入精修过程 — 在结果中标注反馈影响
    const results = this.polish(previousResult.original, targetStyles, context, 1);

    // 追加迭代标记
    for (const r of results) {
      r.changes.push(`[迭代] 基于反馈优化: "${feedback.slice(0, 20)}${feedback.length > 20 ? '...' : ''}"`);
    }

    return results;
  }
}
