/**
 * 去AI味引擎
 * 检测并消除AI生成文本的特征模式
 */
import { HttpException, Injectable } from '@nestjs/common';

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
    { pattern: /(?:有[的时]候|有时候)[^，、]{3,10}[，,、][^，、]{3,10}[，,、][^，、]{3,10}/g, category: 'structure', description: '排比/对仗式句组，过于工整' },
    { pattern: /不是[^，、]{2,8}[，,、](?:而是|就是)[^，、]{2,8}/g, category: 'structure', description: 'AI典型对比句式' },
    { pattern: /一[^，、]{2,6}[，,、]一[^，、]{2,6}[，,、]一[^，、]{2,6}/g, category: 'structure', description: 'AI排比句式干扰阅读节奏' },

    // ─── 无信息量形容词堆砌（新增） ───
    { pattern: /美丽的/g, category: 'adjective', description: '无信息量形容词"美丽的"，用具体描写代替' },
    { pattern: /帅气的/g, category: 'adjective', description: '无信息量形容词"帅气的"，用具体描写代替' },
    { pattern: /漂亮的/g, category: 'adjective', description: '无信息量形容词"漂亮的"，用具体描写代替' },
    { pattern: /英俊的/g, category: 'adjective', description: '无信息量形容词"英俊的"，用具体描写代替' },
    { pattern: /深邃的/g, category: 'adjective', description: '无信息量形容词"深邃的"，用具体描写代替' },
    { pattern: /冰冷的/g, category: 'adjective', description: '无信息量形容词"冰冷的"，用具体描写代替' },
    { pattern: /孤独的/g, category: 'adjective', description: '无信息量形容词"孤独的"，用动作/场景体现' },
    { pattern: /无尽的/g, category: 'adjective', description: '无信息量形容词"无尽的"，用具体数量/场景代替' },
    { pattern: /璀璨的/g, category: 'adjective', description: '无信息量形容词"璀璨的"，用具体描写代替' },
    { pattern: /华丽的/g, category: 'adjective', description: '无信息量形容词"华丽的"，用具体描写代替' },
    { pattern: /优雅的/g, category: 'adjective', description: '无信息量形容词"优雅的"，用动作描写代替' },
    { pattern: /高贵的/g, category: 'adjective', description: '无信息量形容词"高贵的"，用细节/身份体现' },
    { pattern: /神秘的/g, category: 'adjective', description: '无信息量形容词"神秘的"，用悬念/未知体现' },
    { pattern: /强大的/g, category: 'adjective', description: '无信息量形容词"强大的"，用具体能力/战绩体现' },
    { pattern: /微弱的/g, category: 'adjective', description: '无信息量形容词"微弱的"，用具体程度代替' },
    { pattern: /沉重的/g, category: 'adjective', description: '无信息量形容词"沉重的"，用动作/生理反应体现' },
    { pattern: /轻盈的/g, category: 'adjective', description: '无信息量形容词"轻盈的"，用动作描写代替' },
    { pattern: /温暖的/g, category: 'adjective', description: '无信息量形容词"温暖的"，用具体触感/场景代替' },
    { pattern: /寒冷的/g, category: 'adjective', description: '无信息量形容词"寒冷的"，用具体温度/生理反应代替' },

    // ─── 过度完整的解释（新增） ───
    { pattern: /这意[味识]着/g, category: 'overExplain', description: 'AI过度解释"这意味着"' },
    { pattern: /可以[理看]出/g, category: 'overExplain', description: 'AI替读者总结' },
    { pattern: /从这里不难/g, category: 'overExplain', description: 'AI过度引导读者' },
    { pattern: /由此可[见知]/g, category: 'overExplain', description: 'AI推导句式' },

    // ─── 刻意感官描写（新增） ───
    { pattern: /(凉意|暖意|寒意|热气|冷气|风)[^。]{0,8}(贴着|顺着|沿着|爬上|漫上)[^。]{0,8}(皮肤|脊背|后背|身体|手臂|小腿|脖子|脸颊)[^。]{0,8}(往上|往下|向上|向下)?(爬|蔓延|窜|流)/g, category: 'sensory', description: 'AI刻意感官描写"X贴着皮肤往上爬"' },
    { pattern: /(炸开|绽放|绽开|迸开)[^。]{0,8}(一朵|一片|一团)?(光|光芒|光亮|白光|红光)/g, category: 'sensory', description: 'AI刻意比喻"炸开一朵光"' },
    { pattern: /过电似的|过电一样|触电似的|触电一样/g, category: 'sensory', description: 'AI刻意感官描写"过电似的"' },
    { pattern: /(心跳|心脏|心)[^。]{0,6}(漏了一拍|漏掉一拍|骤停|猛地一跳|咯噔一下)/g, category: 'sensory', description: 'AI套路化生理反应"心跳漏了一拍"' },
    { pattern: /(喉咙|嗓子|喉头)[^。]{0,6}(发紧|发紧|一紧|哽住|哽咽)/g, category: 'sensory', description: 'AI套路化生理反应"喉咙发紧"' },
    { pattern: /(手心|手掌|额头|后背|脊背)[^。]{0,6}(冒汗|出汗|渗汗|浸出冷汗)/g, category: 'sensory', description: 'AI套路化生理反应"手心冒汗"' },

    // ─── 拟人化比喻（新增） ───
    { pattern: /(回音|回声|声音|声响)[^。]{0,6}(吞掉|吃掉|吞噬|吞没|淹没)/g, category: 'personification', description: 'AI拟人化比喻"回音吞掉了尾音"' },
    { pattern: /(风|风声|风)[^。]{0,6}(绕了道|绕道|躲开|避开|绕开)/g, category: 'personification', description: 'AI拟人化比喻"风声绕了道"' },
    { pattern: /(黑暗|夜色|夜)[^。]{0,6}(吞噬|吞没|包裹|笼罩|张开大嘴)/g, category: 'personification', description: 'AI拟人化比喻"黑暗吞噬了一切"' },
    { pattern: /(时间|时光|岁月)[^。]{0,6}(流逝|溜走|飞逝|匆匆|奔跑)/g, category: 'personification', description: 'AI拟人化比喻"时间飞逝"' },
    { pattern: /(雨|雨水|雨点)[^。]{0,6}(敲打|敲击|拍打|砸|捶打)/g, category: 'personification', description: 'AI拟人化比喻"雨水敲打窗户"' },

    // ─── 情绪外化/解释过度（新增） ───
    { pattern: /(空气|气氛|氛围)[^。]{0,6}(沉下去|压下来|凝固|凝重|变得沉重)/g, category: 'emotionExternalize', description: 'AI情绪外化"空气沉下去"' },
    { pattern: /(压在|压得|压着)[^。]{0,6}(肩膀|肩头|胸口|心头|心上|身上)/g, category: 'emotionExternalize', description: 'AI情绪外化"压在肩膀上"' },
    { pattern: /没怎么用力[^。]{0,10}却让(我|他|她)[^。]{0,10}(不太容易|难以|无法|不能)/g, category: 'emotionExternalize', description: 'AI过度解释"没怎么用力却让我..."' },
    { pattern: /(仿佛|好像|似乎)[^。]{0,10}(能感受到|能感觉到|能体会到)[^。]{0,10}(情绪|氛围|气息|感觉)/g, category: 'emotionExternalize', description: 'AI模糊情绪表达"仿佛能感受到..."' },

    // ─── 套路化表达（新增） ───
    { pattern: /(记忆|回忆|画面)[^。]{0,6}(清晰得像|清晰如同|清楚得像|清楚如同)[^。]{0,10}(刚发生|昨天|眼前)/g, category: 'cliche', description: 'AI套路化表达"记忆清晰得像刚发生的事"' },
    { pattern: /不像梦|不是梦|不是做梦|不像做梦/g, category: 'cliche', description: 'AI套路化表达"不像梦"' },
    { pattern: /(那一刻|这一瞬间|就在这时)[^。]{0,10}(我|他|她)[^。]{0,10}(突然|忽然|猛地)[^。]{0,10}(明白|懂得|知道|意识到)/g, category: 'cliche', description: 'AI套路化顿悟"那一刻我突然明白"' },
    { pattern: /(时间|世界|一切)[^。]{0,6}(仿佛|好像|似乎)[^。]{0,6}(静止|停止|凝固|定格)/g, category: 'cliche', description: 'AI套路化表达"时间仿佛静止"' },
    { pattern: /(眼中|眼里|眼眶)[^。]{0,6}(闪过|掠过|浮现|露出)[^。]{0,10}(一丝|一抹|一缕)?(复杂|异样|不明|难以言喻)/g, category: 'cliche', description: 'AI套路化表情"眼中闪过一丝复杂"' },
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
    // ─── 无信息量形容词堆砌（新增，建议直接删除） ───
    { pattern: /美丽的/g, category: 'adjective', description: '无信息量形容词，用具体描写代替', suggestions: ['', '好看的', '入眼的'] },
    { pattern: /帅气的/g, category: 'adjective', description: '无信息量形容词，用具体描写代替', suggestions: ['', '精神的', '利落的'] },
    { pattern: /漂亮的/g, category: 'adjective', description: '无信息量形容词，用具体描写代替', suggestions: ['', '好看的', '齐整的'] },
    { pattern: /深邃的/g, category: 'adjective', description: '无信息量形容词，用具体描写代替', suggestions: ['', '深的', '黑的'] },
    { pattern: /冰冷的/g, category: 'adjective', description: '无信息量形容词，用具体温度/触感代替', suggestions: ['', '凉的', '冰的'] },
    { pattern: /孤独的/g, category: 'adjective', description: '无信息量形容词，用动作/场景体现', suggestions: ['', '一个人的', '落单的'] },
    { pattern: /无尽的/g, category: 'adjective', description: '无信息量形容词，用具体数量/场景代替', suggestions: ['', '没头的', '看不到头的'] },
    { pattern: /璀璨的/g, category: 'adjective', description: '无信息量形容词，用具体描写代替', suggestions: ['', '亮的', '闪的'] },
    { pattern: /华丽的/g, category: 'adjective', description: '无信息量形容词，用具体描写代替', suggestions: ['', '花哨的', '讲究的'] },
    { pattern: /优雅的/g, category: 'adjective', description: '无信息量形容词，用动作描写代替', suggestions: ['', '从容的', '稳的'] },
    { pattern: /高贵的/g, category: 'adjective', description: '无信息量形容词，用细节/身份体现', suggestions: ['', '体面的', '端着的'] },
    { pattern: /神秘的/g, category: 'adjective', description: '无信息量形容词，用悬念/未知体现', suggestions: ['', '说不清的', '摸不透的'] },
    { pattern: /强大的/g, category: 'adjective', description: '无信息量形容词，用具体能力/战绩体现', suggestions: ['', '厉害的', '能打的'] },
    { pattern: /沉重的/g, category: 'adjective', description: '无信息量形容词，用动作/生理反应体现', suggestions: ['', '沉的', '重的'] },
    { pattern: /温暖的/g, category: 'adjective', description: '无信息量形容词，用具体触感/场景代替', suggestions: ['', '暖的', '热乎的'] },
    { pattern: /寒冷的/g, category: 'adjective', description: '无信息量形容词，用具体温度/生理反应代替', suggestions: ['', '冷的', '冻人的'] },
    { pattern: /复杂的[^。]{1,10}心情/g, category: 'emotion', description: '模糊情感', suggestions: ['五味杂陈', '百感交集', '说不清是X还是Y'] },
    { pattern: /我们需要/g, category: 'tone', description: '集体视角', suggestions: ['你得', '你必须', '你要'] },
    { pattern: /因此/g, category: 'transition', description: '因果连接', suggestions: ['所以', '于是', '这才'] },
    { pattern: /然而/g, category: 'transition', description: '转折连接', suggestions: ['可是', '但是', '不过'] },
    { pattern: /此外/g, category: 'transition', description: '补充连接', suggestions: ['还有', '另外', '再说'] },
    { pattern: /与此同时/g, category: 'transition', description: '并列连接', suggestions: ['同一时间', '这时候', '另一边'] },
    { pattern: /事实上/g, category: 'transition', description: 'AI插入语', suggestions: ['其实', '说白了', ''] },
    // ─── 刻意感官描写（新增，建议简化或删除） ───
    { pattern: /过电似的|过电一样|触电似的|触电一样/g, category: 'sensory', description: '刻意感官描写', suggestions: ['', '麻了一下', '一激灵'] },
    { pattern: /(心跳|心脏|心)漏了一拍|漏掉一拍/g, category: 'sensory', description: '套路化生理反应', suggestions: ['心一紧', '心里咯噔一下', ''] },
    { pattern: /(喉咙|嗓子|喉头)发紧|一紧|哽住/g, category: 'sensory', description: '套路化生理反应', suggestions: ['嗓子堵', '说不出话', ''] },
    { pattern: /(手心|手掌)冒汗|出汗|渗汗/g, category: 'sensory', description: '套路化生理反应', suggestions: ['手心湿', '攥紧拳头', ''] },
    // ─── 拟人化比喻（新增，建议改为直白描写） ───
    { pattern: /(回音|回声|声音)(吞掉|吃掉|吞噬|吞没|淹没)/g, category: 'personification', description: '拟人化比喻', suggestions: ['回音很大', '声音被盖住', ''] },
    { pattern: /(风|风声)(绕了道|绕道|躲开|避开|绕开)/g, category: 'personification', description: '拟人化比喻', suggestions: ['风停了', '没风', ''] },
    { pattern: /(黑暗|夜色|夜)(吞噬|吞没|包裹|笼罩)/g, category: 'personification', description: '拟人化比喻', suggestions: ['天黑了', '四周很黑', ''] },
    { pattern: /(时间|时光|岁月)(流逝|溜走|飞逝|匆匆|奔跑)/g, category: 'personification', description: '拟人化比喻', suggestions: ['时间过去', '日子久了', ''] },
    // ─── 情绪外化/解释过度（新增，建议删除或改为动作） ───
    { pattern: /(空气|气氛|氛围)(沉下去|压下来|凝固|凝重|变得沉重)/g, category: 'emotionExternalize', description: '情绪外化', suggestions: ['没人说话', '安静下来', ''] },
    { pattern: /(压在|压得|压着)(肩膀|肩头|胸口|心头|心上|身上)/g, category: 'emotionExternalize', description: '情绪外化', suggestions: ['心里沉', '喘不过气', ''] },
    // ─── 套路化表达（新增，建议删除或改写） ───
    { pattern: /不像梦|不是梦|不是做梦|不像做梦/g, category: 'cliche', description: '套路化表达', suggestions: ['', '真的发生了', '确实是真的'] },
    { pattern: /(时间|世界|一切)(仿佛|好像|似乎)(静止|停止|凝固|定格)/g, category: 'cliche', description: '套路化表达', suggestions: ['周围静下来', '没人动', ''] },
    { pattern: /(眼中|眼里|眼眶)(闪过|掠过|浮现|露出)(一丝|一抹|一缕)?(复杂|异样|不明|难以言喻)/g, category: 'cliche', description: '套路化表情', suggestions: ['他看了我一眼', '眼神变了', ''] },
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
   * 去AI味润色（正则替换版）
   * 替换规则为确定性替换（不再使用 Math.random 随机决定），
   * 仅替换明确的AI高频词，保留原文语义和结构。
   * 注意：此方法仅做简单正则替换，复杂降AI请使用 llmLocalRewrite。
   */
  polish(content: string, intensity: number = 5, focusTags?: string[]): { result: string; changes: string[] } {
    let result = content;
    const changes: string[] = [];

    // 1. 替换AI特征词（确定性替换，不再随机）
    for (const rule of this.replacementRules) {
      if (focusTags && focusTags.length > 0 && !focusTags.includes(rule.category)) {
        continue;
      }

      const matches = result.match(rule.pattern);
      if (matches && matches.length > 0) {
        const suggestion = rule.suggestions[0]; // 始终使用第一个建议，不随机
        if (suggestion) {
          result = result.replace(rule.pattern, suggestion);
          changes.push(`[替换] ${rule.description}: "${matches[0]}" → "${suggestion}"`);
        } else {
          result = result.replace(rule.pattern, '');
          changes.push(`[删除] ${rule.description}: 移除"${matches[0]}"`);
        }
      }
    }

    return { result, changes };
  }

  /**
   * llmLocalRewrite — LLM驱动的局部改写（降AI味）
   * 先用detect找到AI特征段落，然后只改写问题段落+上下文各100字
   * 不改动全文结构，只做局部精修
   * @param content 原文
   * @param llmGenerate LLM生成函数（由调用方传入，避免循环依赖）
   * @param maxRewrites 最多改写多少处问题（默认3处，避免过度改写）
   * @param standardBlock 执行标准块（平台/分类/基调/文风/流派/视角），由
   *   resolveProjectStandardDirective 解析后注入；改写不得偏离这一定位。
   */
  async llmLocalRewrite(
    content: string,
    llmGenerate: (prompt: string) => Promise<string>,
    maxRewrites: number = 3,
    standardBlock: string = '',
  ): Promise<{ result: string; changes: Array<{ before: string; after: string; reason: string }> }> {
    if (!content || content.length < 100) return { result: content, changes: [] };

    const detectResult = this.detect(content);
    if (!detectResult.found || detectResult.matches.length === 0) {
      return { result: content, changes: [] };
    }

    // 按位置排序，取前maxRewrites处
    const targets = detectResult.matches
      .sort((a, b) => a.position - b.position)
      .slice(0, maxRewrites);

    let result = content;
    const changes: Array<{ before: string; after: string; reason: string }> = [];
    // 空输出或无效片段必须报错；词表风险本身不是硬伤证据，符合标准的原片段可保留。
    const failures: Array<{ position: number; description: string; upstream: boolean; reason: string }> = [];

    for (const target of targets) {
      // 取问题段落+上下文各100字
      const start = Math.max(0, target.position - 100);
      const end = Math.min(result.length, target.position + target.text.length + 100);
      const context = result.substring(start, end);

      const rewritePrompt = `${standardBlock}【降AI改写边界】只做语言层降AI，不得改变平台/分类/基调/文风/流派/视角设定；不得改变情节、人物关系与叙事视角。

请对以下小说片段进行局部降AI味改写，只改写有AI痕迹的部分，保留原文的叙事逻辑、人物性格和情节走向。

AI痕迹说明：${target.description}
原文片段（含上下文）：
${context}

执行已注入的局部精修标准，只处理上述证据对应的问题；输出改写后的完整片段，不要解释。

改写后的片段：`;

      try {
        const rewritten = await llmGenerate(rewritePrompt);
        const cleanRewritten = rewritten.trim().replace(/^["'"'"']|["'"'"']$/g, '');
        // 词表命中只是候选风险，不能要求已符合执行标准的片段为制造改动而重写。
        if (cleanRewritten === context) continue;
        if (cleanRewritten && cleanRewritten.length > 20 && cleanRewritten !== context) {
          result = result.substring(0, start) + cleanRewritten + result.substring(end);
          changes.push({
            before: context,
            after: cleanRewritten,
            reason: target.description,
          });
        } else {
          // 无效输出不视为无需修改，也不接受它覆盖原文。
          failures.push({
            position: target.position,
            description: target.description,
            upstream: false,
            reason: !cleanRewritten
              ? '模型返回空片段'
              : cleanRewritten.length <= 20
                ? `模型返回片段过短（${cleanRewritten.length}字），无法覆盖原上下文`
                : '模型原样返回，未产生任何改动',
          });
        }
      } catch (error) {
        failures.push({
          position: target.position,
          description: target.description,
          upstream: true,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 不降级：只要有一处该改没改，就把失败位置和原因抛出去，绝不返回「部分降AI」的成功结果。
    if (failures.length > 0) {
      const upstream = failures.some((f) => f.upstream);
      const detail = failures
        .map((f) => `第${f.position}字附近「${f.description}」：${f.reason}`)
        .join('；');
      throw new HttpException(
        {
          code: 'DE_AI_REWRITE_INCOMPLETE',
          message:
            `降AI改写未完成：${failures.length}/${targets.length} 处执行失败，已停止返回改写结果（避免把没改干净的稿子当成成功）。失败位置：${detail}`,
          failures,
          succeeded: changes.length,
        },
        upstream ? 502 : 422,
      );
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

}
