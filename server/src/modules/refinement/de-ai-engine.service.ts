/**
 * 去AI味引擎
 * 检测并消除AI生成文本的特征模式
 */
import { Injectable } from '@nestjs/common';

interface AiPattern {
  pattern: RegExp;
  category: string;
  description: string;
  replacement?: string;
}

interface ReplacementRule {
  pattern: RegExp;
  category: string;
  description: string;
  suggestions: string[];
}

export interface DetectResult {
  found: boolean;
  matches: AiPatternMatch[];
  score: number;
  suggestions: string[];
}

interface AiPatternMatch {
  category: string;
  text: string;
  position: number;
  description: string;
  suggestion: string;
}

@Injectable()
export class DeAiEngineService {
  /**
   * AI特征检测模式
   */
  private readonly aiPatterns: AiPattern[] = [
    // ─── 过渡词 ───
    { pattern: /值得注意的是/g, category: 'transition', description: 'AI常用过渡词"值得注意的是"', replacement: '' },
    { pattern: /毋庸置疑/g, category: 'transition', description: 'AI常用过渡词"毋庸置疑"', replacement: '显然' },
    { pattern: /不可否认/g, category: 'transition', description: 'AI常用过渡词"不可否认"', replacement: '当然' },
    { pattern: /显而易见/g, category: 'transition', description: 'AI常用过渡词"显而易见"', replacement: '明显' },
    { pattern: /总的来说/g, category: 'transition', description: 'AI常用过渡词"总的来说"', replacement: '' },
    { pattern: /从这个角度来说/g, category: 'transition', description: 'AI常用过渡词"从这个角度来说"', replacement: '' },
    { pattern: /换句话说/g, category: 'transition', description: 'AI常用过渡词"换句话说"', replacement: '即' },
    { pattern: /也就是说/g, category: 'transition', description: 'AI常用过渡词"也就是说"', replacement: '即' },
    { pattern: /值得一提的是/g, category: 'transition', description: 'AI常用过渡词"值得一提的是"', replacement: '' },
    { pattern: /除此之外/g, category: 'transition', description: 'AI常用过渡词"除此之外"', replacement: '另外' },
    { pattern: /不仅如此/g, category: 'transition', description: 'AI常用过渡词"不仅如此"', replacement: '而且' },
    { pattern: /更为重要的是/g, category: 'transition', description: 'AI常用过渡词"更为重要的是"', replacement: '' },

    // ─── 情感描写公式 ───
    { pattern: /内心充满了/g, category: 'emotion', description: '公式化情感描写"内心充满了"', replacement: '' },
    { pattern: /一种[^。]*油然而生/g, category: 'emotion', description: '公式化情感描写"一种X油然而生"' },
    { pattern: /心中涌起一股/g, category: 'emotion', description: '公式化情感描写"心中涌起一股"' },
    { pattern: /一股[^。]*涌上心头/g, category: 'emotion', description: '公式化情感描写"一股X涌上心头"' },
    { pattern: /不禁[^。]{1,10}/g, category: 'emotion', description: 'AI过度使用"不禁"' },
    { pattern: /忍不住/g, category: 'emotion', description: 'AI过度使用"忍不住"' },
    { pattern: /某种说不出的/g, category: 'emotion', description: '模糊化情感描写' },
    { pattern: /复杂的[^。]{1,10}心情/g, category: 'emotion', description: 'AI惯用的复杂心情描述' },

    // ─── 语气体 ───
    { pattern: /我们需要/g, category: 'tone', description: 'AI常用集体视角' },
    { pattern: /让我们/g, category: 'tone', description: 'AI常用提议语气' },
    { pattern: /这不仅仅/g, category: 'tone', description: 'AI常用递进语气' },
    { pattern: /在某种程度上/g, category: 'tone', description: 'AI模糊化限定表达' },
    { pattern: /从某种意义上说/g, category: 'tone', description: 'AI模糊化表达' },
    { pattern: /可以说/g, category: 'tone', description: 'AI常用插入语' },
    { pattern: /毫无疑问/g, category: 'tone', description: 'AI绝对化表达' },

    // ─── 段落结构 ───
    { pattern: /首先[，,].*其次[，,].*最后[，,]/g, category: 'structure', description: 'AI典型三段式结构' },
    { pattern: /第一[，,].*第二[，,].*第三/g, category: 'structure', description: 'AI典型序号式结构' },

    // ─── 对话标签 ───
    { pattern: /他说[，。]/g, category: 'dialogue', description: '缺乏个性化的"他说"标签', replacement: '' },
    { pattern: /她说[，。]/g, category: 'dialogue', description: '缺乏个性化的"她说"标签', replacement: '' },
    { pattern: /他说道/g, category: 'dialogue', description: '生硬的"他说道"' },
    { pattern: /她说道/g, category: 'dialogue', description: '生硬的"她说道"' },

    // ─── 修饰词滥用 ───
    { pattern: /非常非常/g, category: 'modifier', description: '重复使用"非常"' },
    { pattern: /真的太/g, category: 'modifier', description: '"真的太"冗余表达' },
    { pattern: /实在是/g, category: 'modifier', description: '过度强调"实在是"' },

    // ─── 总结性结尾 ───
    { pattern: /这就是[^。]*的原因/g, category: 'conclusion', description: 'AI典型的总结句式' },
    { pattern: /综上所述/g, category: 'conclusion', description: 'AI典型的总结词' },
    { pattern: /总之/g, category: 'conclusion', description: 'AI典型的总结词' },

    // ─── 过于工整的句式（新增） ───
    { pattern: /仿佛/g, category: 'flatness', description: 'AI高频词"仿佛"，用具体比喻代替' },
    { pattern: /似乎/g, category: 'flatness', description: 'AI高频词"似乎"，要么确定要么不确定' },
    { pattern: /内心深处/g, category: 'flatness', description: 'AI空洞表述"内心深处"' },
    { pattern: /某种意义上/g, category: 'flatness', description: '模糊化逃避' },
    { pattern: /莫名的/g, category: 'flatness', description: 'AI空洞情感词汇' },
    { pattern: /无以言表的/g, category: 'flatness', description: '用具体描写代替"无以言表"' },
    { pattern: /这一刻[，,]他[^。]{0,10}(终于|真的|明白|懂得|知道)/g, category: 'flatness', description: 'AI标准顿悟句式' },
    { pattern: /也许[，,]这就是/g, category: 'flatness', description: 'AI典型感慨句式' },
    { pattern: /原来[，,]一切/g, category: 'flatness', description: 'AI过度使用的"原来一切"反转句式' },

    // ─── 均匀句长/排比（新增） ───
    { pattern: /(?:有[的时]候|有时候)[^，]{3,10}[，,][^，]{3,10}[，,][^，]{3,10}/g, category: 'structure', description: '排比/对仗式句组，过于工整' },
    { pattern: /不是[^，]{2,8}[，,](?:而是|就是)[^，]{2,8}/g, category: 'structure', description: 'AI典型对比句式' },
    { pattern: /一[^，]{2,6}[，,]一[^，]{2,6}[，,]一[^，]{2,6}/g, category: 'structure', description: 'AI排比句式干扰阅读节奏' },

    // ─── 过度完整的解释（新增） ───
    { pattern: /这意[味识]着/g, category: 'overExplain', description: 'AI过度解释"这意味着"' },
    { pattern: /可以[理看]出/g, category: 'overExplain', description: 'AI替读者总结' },
    { pattern: /从这里不难/g, category: 'overExplain', description: 'AI过度引导读者' },
    { pattern: /由此可[见知]/g, category: 'overExplain', description: 'AI推导句式' },
  ];

  /**
   * 替换规则库(50+)
   */
  private readonly replacementRules: ReplacementRule[] = [
    { pattern: /值得注意的是/g, category: 'transition', description: 'AI过渡词"值得注意的是"', suggestions: ['扣人心弦的是', '更让人在意的是', ''] },
    { pattern: /毋庸置疑/g, category: 'transition', description: 'AI过渡词"毋庸置疑"', suggestions: ['显然', '谁都知道', ''] },
    { pattern: /不可否认/g, category: 'transition', description: 'AI过渡词"不可否认"', suggestions: ['当然', '不得不承认', ''] },
    { pattern: /显而易见/g, category: 'transition', description: 'AI过渡词"显而易见"', suggestions: ['明摆着', '瞎子都看得出来', ''] },
    { pattern: /总的来说/g, category: 'transition', description: 'AI过渡词"总的来说"', suggestions: ['总而言之', '一句话', ''] },
    { pattern: /从这个角度来说/g, category: 'transition', description: 'AI过渡词', suggestions: ['这么看', '从这个角度看', ''] },
    { pattern: /换句话说/g, category: 'transition', description: 'AI过渡词', suggestions: ['说白了', '换句话讲', '简单说'] },
    { pattern: /值得一提的是/g, category: 'transition', description: 'AI过渡词', suggestions: ['有意思的是', '特别要说的是', ''] },
    { pattern: /除此之外/g, category: 'transition', description: 'AI过渡词', suggestions: ['另外', '还有', '除此以外'] },
    { pattern: /不仅如此/g, category: 'transition', description: 'AI过渡词', suggestions: ['而且', '更甚的是', '还不止这样'] },
    { pattern: /更为重要的是/g, category: 'transition', description: 'AI过渡词', suggestions: ['更要命的是', '更要紧的是', ''] },
    { pattern: /内心充满了/g, category: 'emotion', description: '公式化情感', suggestions: ['心里只剩', '满脑子都是', '被X填满'] },
    { pattern: /油然而生/g, category: 'emotion', description: '公式化情感', suggestions: ['冒出来', '窜上来', '浮起来'] },
    { pattern: /涌上心头/g, category: 'emotion', description: '公式化情感', suggestions: ['堵在胸口', '漫上来', '翻上来'] },
    { pattern: /不禁/g, category: 'emotion', description: '过度使用', suggestions: ['下意识', '不自觉', ''] },
    { pattern: /忍不住/g, category: 'emotion', description: '过度使用', suggestions: ['憋不住', '控制不住', '不由'] },
    { pattern: /需要我们/g, category: 'tone', description: 'AI集体视角', suggestions: ['你得', '你要', '咱们要'] },
    { pattern: /让我们/g, category: 'tone', description: 'AI提议语气', suggestions: ['咱们', '我们不妨', ''] },
    { pattern: /从某种意义上说/g, category: 'tone', description: '模糊化表达', suggestions: ['可以说', '严格来讲', ''] },
    { pattern: /可以说/g, category: 'tone', description: '插入语', suggestions: ['称得上', '算得上', ''] },
    { pattern: /毫无疑问/g, category: 'tone', description: '绝对化表达', suggestions: ['没跑', '没得说', '毫无疑问地'] },
    { pattern: /首先/g, category: 'structure', description: '序号结构', suggestions: ['一开始', '起初', '头一条'] },
    { pattern: /其次/g, category: 'structure', description: '序号结构', suggestions: ['接着', '然后', '二来'] },
    { pattern: /最后/g, category: 'structure', description: '序号结构', suggestions: ['末了', '到头来', '最终'] },
    { pattern: /综上所述/g, category: 'conclusion', description: '总结词', suggestions: ['兜底说', '总的来看', ''] },
    { pattern: /总之/g, category: 'conclusion', description: '总结词', suggestions: ['说到底', '一句话', '反正'] },
    { pattern: /非常/g, category: 'modifier', description: '修饰词', suggestions: ['极', '格外', '异常', ''] },
    { pattern: /真的/g, category: 'modifier', description: '修饰词', suggestions: ['确实', '实实在在', ''] },
    { pattern: /实际上/g, category: 'transition', description: '冗余表达', suggestions: ['其实', '事实上', ''] },
    { pattern: /某种程度上/g, category: 'tone', description: '模糊限制', suggestions: ['多少', '有几分', ''] },
    { pattern: /在某种程度上/g, category: 'tone', description: '模糊限制', suggestions: ['或多或少', '' , ''] },
    { pattern: /他说/g, category: 'dialogue', description: '对话标签', suggestions: ['他压低嗓子说', '他开口道', '他沉声说'] },
    { pattern: /她说/g, category: 'dialogue', description: '对话标签', suggestions: ['她轻声说', '她叹了口气', '她笑着说'] },
    { pattern: /他说道/g, category: 'dialogue', description: '对话标签', suggestions: ['他说', '他道', '他开口'] },
    { pattern: /她说道/g, category: 'dialogue', description: '对话标签', suggestions: ['她说', '她道', '她接话'] },
    { pattern: /一股[^。]*涌上心头/g, category: 'emotion', description: '公式化情感', suggestions: ['X得他/她', 'X直冲脑门', 'X涨满了胸膛'] },
    { pattern: /心中涌起一股/g, category: 'emotion', description: '公式化情感', suggestions: ['心里头一阵', '心里忽然', '胸口一热'] },
    { pattern: /某种说不出的/g, category: 'emotion', description: '模糊情感', suggestions: ['一种奇异的', '说不清道不明的', '莫名的'] },
    { pattern: /这不仅仅/g, category: 'tone', description: '递进语气', suggestions: ['这不光是', '这不单是', '这何止是'] },
    { pattern: /实在是/g, category: 'modifier', description: '强调表达', suggestions: ['真是', '确实是', '的确是'] },
    { pattern: /这就是[^。]*的原因/g, category: 'conclusion', description: '结论句', suggestions: ['之所以X，是因为', 'X的根子在', '归根结底'] },
    { pattern: /非常非常/g, category: 'modifier', description: '重复修饰', suggestions: ['极其', '万分', '无比'] },
    { pattern: /真的太/g, category: 'modifier', description: '冗余表达', suggestions: ['太', '过分', '格外'] },
    { pattern: /复杂的[^。]{1,10}心情/g, category: 'emotion', description: '模糊情感', suggestions: ['五味杂陈', '百感交集', '说不清是X还是Y'] },
    { pattern: /我们需要/g, category: 'tone', description: '集体视角', suggestions: ['你得', '你必须', '你要'] },
    { pattern: /因此/g, category: 'transition', description: '因果连接', suggestions: ['所以', '于是', '这才'] },
    { pattern: /然而/g, category: 'transition', description: '转折连接', suggestions: ['可是', '但是', '不过'] },
    { pattern: /此外/g, category: 'transition', description: '补充连接', suggestions: ['还有', '另外', '再说'] },
    { pattern: /与此同时/g, category: 'transition', description: '并列连接', suggestions: ['同一时间', '这时候', '另一边'] },
    { pattern: /事实上/g, category: 'transition', description: 'AI插入语', suggestions: ['其实', '说白了', ''] },
  ];

  /**
   * 检测AI特征
   */
  detect(content: string, focusTags?: string[]): DetectResult {
    const matches: AiPatternMatch[] = [];
    let score = 0;

    for (const pattern of this.aiPatterns) {
      if (focusTags && focusTags.length > 0 && !focusTags.includes(pattern.category)) {
        continue;
      }

      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.pattern.source, 'g');
      while ((match = regex.exec(content)) !== null) {
        matches.push({
          category: pattern.category,
          text: match[0],
          position: match.index,
          description: pattern.description,
          suggestion: pattern.replacement || this.getSuggestion(pattern.category, match[0]),
        });
        score += 1;
      }
    }

    // 检测段落结构的完美性
    score += this.detectPerfectStructure(content);

    return {
      found: matches.length > 0,
      matches,
      score,
      suggestions: this.generateSuggestions(matches),
    };
  }

  /**
   * 去AI味润色
   */
  polish(content: string, intensity: number = 5, focusTags?: string[]): { result: string; changes: string[] } {
    let result = content;
    const changes: string[] = [];

    // 1. 替换AI特征词
    for (const rule of this.replacementRules) {
      if (focusTags && focusTags.length > 0 && !focusTags.includes(rule.category)) {
        continue;
      }

      const matches = result.match(rule.pattern);
      if (matches && Math.random() < intensity / 10) {
        const suggestion = this.randomChoice(rule.suggestions);
        if (suggestion) {
          result = result.replace(rule.pattern, suggestion);
          changes.push(`[替换] ${rule.description}: "${matches[0]}" → "${suggestion}"`);
        } else {
          result = result.replace(rule.pattern, '');
          changes.push(`[删除] ${rule.description}: 移除"${matches[0]}"`);
        }
      }
    }

    // 2. 打乱完美结构 (随机化句子长度)
    if (intensity >= 4) {
      result = this.randomizeStructure(result);
      changes.push('[结构] 随机化了句子长度和段落结构');
    }

    // 3. 注入个性化表达
    if (intensity >= 6) {
      result = this.injectPersonality(result);
      changes.push('[风格] 注入了个性化表达');
    }

    return { result, changes };
  }

  private detectPerfectStructure(content: string): number {
    let score = 0;
    const paragraphs = content.split('\n').filter((p) => p.trim().length > 0);

    for (const para of paragraphs) {
      const sentences = para.split(/[。！？]/).filter((s) => s.trim().length > 0);
      if (sentences.length >= 3 && sentences.length <= 5) {
        // 检测交替短长句模式
        let altCount = 0;
        for (let i = 0; i < sentences.length - 1; i++) {
          const curLen = sentences[i].length;
          const nextLen = sentences[i + 1].length;
          if ((curLen < 15 && nextLen > 25) || (curLen > 25 && nextLen < 15)) {
            altCount++;
          }
        }
        if (altCount >= sentences.length - 1) {
          score += 2; // 过于完美的交替结构
        }
      }
    }

    return score;
  }

  private getSuggestion(category: string, text: string): string {
    const rule = this.replacementRules.find((r) => {
      const m = text.match(r.pattern);
      return m && m[0] === text;
    });
    if (rule && rule.suggestions.length > 0) {
      return rule.suggestions[0];
    }
    return '';
  }

  private generateSuggestions(matches: AiPatternMatch[]): string[] {
    const suggestions: string[] = [];
    const categories = new Set(matches.map((m) => m.category));

    if (categories.has('transition')) {
      suggestions.push('减少过渡词使用频率，让行文更自然');
    }
    if (categories.has('emotion')) {
      suggestions.push('用具体动作和细节替代公式化的情感描写');
    }
    if (categories.has('dialogue')) {
      suggestions.push('丰富对话标签，增加动作和表情描写');
    }
    if (categories.has('structure')) {
      suggestions.push('打乱段落结构，避免三段式或序号式布局');
    }
    if (categories.has('tone')) {
      suggestions.push('减少说教口吻，让叙述更贴近角色视角');
    }
    if (categories.has('conclusion')) {
      suggestions.push('避免总结式结尾，让故事自然收束');
    }

    return suggestions;
  }

  private randomizeStructure(content: string): string {
    const paragraphs = content.split('\n');
    return paragraphs
      .map((para) => {
        if (para.trim().length === 0) return para;
        const sentences = para.split(/(?<=[。！？])/);
        if (sentences.length < 3) return para;
        // 随机调整句子顺序（仅限某些非关键段落）
        if (Math.random() > 0.6) return para;
        // 交换相邻句子的部分结构
        for (let i = 0; i < sentences.length - 1; i += 2) {
          if (Math.random() > 0.5) continue;
          const temp = sentences[i];
          sentences[i] = sentences[i + 1];
          sentences[i + 1] = temp;
        }
        return sentences.join('');
      })
      .join('\n');
  }

  private injectPersonality(content: string): string {
    // 在对话标签注入个性化表达
    return content
      .replace(/他说/g, () => this.randomChoice(['他压低嗓子说', '他闷声道', '他嘀咕道', '他嚷嚷道', '他慢悠悠地说']))
      .replace(/她说/g, () => this.randomChoice(['她嗔道', '她怯生生地说', '她爽快地说', '她咬着嘴唇说', '她笑眯眯地说']))
      .replace(/他问/g, () => this.randomChoice(['他试探着问', '他小心翼翼地问', '他劈头就问', '他纳闷地问']))
      .replace(/她问/g, () => this.randomChoice(['她好奇地问', '她疑惑地问', '她追问', '她漫不经心地问']));
  }

  private randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
