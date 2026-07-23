/**
 * Mock LLM 服务
 *
 * 在开发阶段模拟 AI 模型生成响应
 * 返回预制模板数据，便于开发和测试 Chain 执行流程
 * 后续可替换为真实的 LLM API 调用
 */
import { Injectable, Logger } from '@nestjs/common';
import { ILLMService } from './llm.interface';
import { LLMRequest, LLMResponse } from './chain.types';

@Injectable()
export class MockLLMService implements ILLMService {
  private readonly logger = new Logger(MockLLMService.name);

  /**
   * 模拟响应模板库
   * 根据 Prompt 关键词匹配返回对应的模拟数据
   */
  private readonly mockResponses: Array<{
    keywords: string[];
    content: string;
  }> = [
    {
      keywords: ['素材解析', 'material-parse'],
      content: JSON.stringify({
        coreTheme: '家庭秘密与背叛',
        availableElements: ['老旧日记本', '母亲反常行为', '深夜电话'],
        emotionalTone: '悬疑压抑',
        potentialConflicts: ['母女信任破裂', '家族利益隐瞒'],
      }),
    },
    {
      keywords: ['平台风格', 'style-analysis'],
      content: JSON.stringify({
        platform: '知乎盐选',
        userProfile: '25-40岁城市白领，追求真实感和代入感',
        successFactors: ['真实经历感', '层层反转', '后劲十足'],
        taboos: ['过度虚构', '狗血剧情', '逻辑漏洞'],
        wordRange: '3000-8000字',
      }),
    },
    {
      keywords: ['脑洞发散', 'idea-generation', '题材'],
      content: JSON.stringify([
        {
          title: '我妈的朋友圈，藏着另一个我',
          hook: '我妈手机里有个从未发给我看的朋友圈，里面记录着一个完美版的女儿',
          protagonist: '我，28岁，大城市打工人',
          setting: '县城老小区、业主群、社区医院',
          anomaly: '母亲创建了一个只有"她世界"好友可见的分组朋友圈',
          conflict: '真实自我vs母亲期待、亲情绑架vs自我认同',
          emotion: '压抑→疑惑→愤怒→反思',
          reversal: '那个"完美女儿"不是虚构，是我从未见过的双胞胎姐姐',
          platform: '知乎盐选',
          potential: '强：亲情话题+身份疑云+现实反思，极易引发共鸣',
        },
        {
          title: '小区架空层的地下室，半夜总有敲击声',
          hook: '小区群里没人讨论这件事，但我知道他们都能听见',
          protagonist: '我，32岁，小区业主',
          setting: '新建小区、业主群、地下车库',
          anomaly: '每天晚上11点，架空层地下室传来规律敲击声',
          conflict: '业主vs物业、好奇心vs恐惧、个人vs群体',
          emotion: '恐惧→愤怒→荒诞→后怕',
          reversal: '敲击声是物业经理在销毁证据——小区地基存在严重质量问题',
          platform: '番茄短篇',
          potential: '强：生存焦虑+集体沉默+现实批判',
        },
        {
          title: '入职第一天，HR说公司没有这个人',
          hook: '我拿着入职通知去报到，HR说查不到我的工位，但我的名字就在考勤系统里',
          protagonist: '我，24岁，应届毕业生',
          setting: '互联网公司、出租屋、派出所',
          anomaly: '我被录用了但公司的"存在记录"在人事、IT、行政系统中不一致',
          conflict: '身份认同vs系统暴力、个人vs资本机器',
          emotion: '荒诞→惊悚→绝望→反击',
          reversal: '我不是被系统漏掉了——我在被系统"抹除"，因为我知道了不该知道的财务数据',
          platform: '规则怪谈',
          potential: '强：职场恐怖+系统惊悚+底层反抗，极易引发打工人共鸣',
        },
      ]),
    },
    {
      keywords: ['核心设定', 'core-setting'],
      content: JSON.stringify({
        title: '我妈的朋友圈，藏着另一个我',
        highConcept: '一个在大城市挣扎的年轻人，发现母亲有一个自己从未见过的朋友圈分组，里面记录着一个完美版的女儿',
        protagonist: '28岁女性，互联网公司运营，与母亲关系表面和谐实则疏离',
        initialDilemma: '春节回家发现母亲手机异常，怀疑母亲有精神疾病',
        wantMost: '弄清母亲隐瞒的真相，修复母女关系',
        fearMost: '自己是母亲"失望"的产物，被至亲否定存在价值',
        antagonist: '母亲的固执+家族沉默的共识+失踪姐姐的阴影',
        setting: '北方小县城，老式居民楼，社区医院',
        coreAnomaly: '母亲手机中有两个微信账号，一个发给所有亲友看，还有一个只发给"特定分组"看',
        emotionalEnding: '愤怒→理解→痛哭→释然，母女在失去一个女儿后如何重新建立连结',
      }),
    },
    {
      keywords: ['人物关系', 'character-web'],
      content: JSON.stringify([
        {
          name: '母亲（张秀兰）',
          surfaceIdentity: '退休小学教师',
          realPurpose: '保护失去的女儿的记忆不被遗忘',
          relationToMe: '母女',
          wants: '让两个女儿都"活着"',
          hides: '大女儿（我双胞胎姐姐）6岁时因医疗事故去世',
          reversalInvolvement: '第二次反转',
          finalFate: '与"我"达成和解，终于接受大女儿已死的事实',
        },
        {
          name: '父亲（李建国）',
          surfaceIdentity: '国企退休职工',
          realPurpose: '维持家庭表面的平静',
          relationToMe: '父女',
          wants: '让妻子从丧女之痛中走出来',
          hides: '当年医疗事故的真相',
          reversalInvolvement: '第三次反转',
          finalFate: '向"我"坦白当年的关键信息',
        },
        {
          name: '邻居王阿姨',
          surfaceIdentity: '热心邻居',
          realPurpose: '被母亲委托"照看"我',
          relationToMe: '长辈',
          wants: '帮助母亲维持"两个女儿都在"的幻觉',
          hides: '多年来配合母亲演出的真相',
          reversalInvolvement: '第一次反转',
          finalFate: '被识破后愧疚退出',
        },
      ]),
    },
    {
      keywords: ['章节结构', 'chapter-structure'],
      content: JSON.stringify({
        openingHook: '前300字：我在母亲手机里看到一条朋友圈，发布时间是凌晨3点，配图是两张完全相同的毕业照',
        chapter1Anomaly: '发现了第二个微信账号',
        chapter2Probe: '试探母亲，发现母亲的回答前后矛盾',
        chapter3Crisis: '母亲被送到医院，医生暗示是精神问题',
        chapter4Reversal: '邻居王阿姨说漏嘴"你们家两个孩子..."',
        chapter5Truth: '在家里找到姐姐的死亡证明',
        chapter6Climax: '与父母对峙，父亲说出当年医疗事故',
        chapter7FinalReversal: '母亲手机里还有一段从未发出的视频',
        chapter8Epilogue: '我重新注册了一个微信号，加进母亲的分组',
      }),
    },
    {
      keywords: ['反转表', 'reversal-table'],
      content: JSON.stringify([
        {
          position: '第四章',
          surfaceTruth: '母亲只是老年孤独导致的心理问题',
          actualTruth: '邻居王阿姨一直在协助母亲维持"两个女儿"的假象',
          foreshadow: '王阿姨总在我回家时"偶遇"，过度关心我家情况',
          revealMethod: '王阿姨说漏嘴"你们家两个孩子，你妈不容易"',
          impactOnProtagonist: '震惊——原来不只母亲一个人"病"了',
          impactOnReader: '细思极恐——日常的热心邻居可能另有目的',
          changesPriorReading: '重新理解王阿姨的所有出场行为',
        },
        {
          position: '第五章',
          surfaceTruth: '母亲有精神分裂症',
          actualTruth: '我妈的大女儿（我姐姐）6岁时因医疗事故去世',
          foreshadow: '母亲手机相册里有很多两个女孩的照片，但"我"记忆中从没有姐姐',
          revealMethod: '在家里旧柜子里翻出姐姐的户口注销记录',
          impactOnProtagonist: '崩溃——原来我有个从未被告知的存在',
          impactOnReader: '泪目——母亲行为的动机彻底转变',
          changesPriorReading: '母亲所有"奇怪"的行为都有了合理解释',
        },
        {
          position: '第七章',
          surfaceTruth: '姐姐死于普通医疗事故',
          actualTruth: '父亲当年作为家属签字放弃抢救，理由是"救回来也是植物人"',
          foreshadow: '父亲从不在家谈医院相关话题',
          revealMethod: '母亲手机里有一段从未发出的视频，她在视频里说想女儿',
          impactOnProtagonist: '愤怒→无力——父亲的"理性"和母亲的"感性"之间的巨大鸿沟',
          impactOnReader: '震撼——家庭决策的沉重代价',
          changesPriorReading: '父亲之前的所有沉默都有了不同意义',
        },
      ]),
    },
    {
      keywords: ['伏笔表', 'foreshadow-table'],
      content: JSON.stringify([
        {
          content: '母亲手机设了防窥膜',
          position: '第一章',
          initialInterpretation: '老年人保护隐私',
          recoveryMethod: '不是怕人看手机，是怕看到那个微信账号',
          impactAfterRecovery: '处处防窥其实是在守护秘密',
        },
        {
          content: '母亲总说"你们姐妹都要好好的"',
          position: '开头',
          initialInterpretation: '老一辈说话爱用复数',
          recoveryMethod: '母亲的确在说两个女儿',
          impactAfterRecovery: '每句话里都有深意',
        },
        {
          content: '家里相册有几张合影空位',
          position: '第二章',
          initialInterpretation: '照片被抽走了',
          recoveryMethod: '那些合影里本来有三个人',
          impactAfterRecovery: '有人被刻意从家族记忆中抹去',
        },
        {
          content: '母亲每天固定时间发呆',
          position: '第一章',
          initialInterpretation: '老年人发呆很正常',
          recoveryMethod: '是姐姐出生的时间',
          impactAfterRecovery: '年复一年的无声缅怀',
        },
        {
          content: '邻居王阿姨对我家事过分了解',
          position: '第三章',
          initialInterpretation: '退休老人热心肠',
          recoveryMethod: '她是母亲情绪的"守门人"',
          impactAfterRecovery: '整个社区都在帮母亲维持幻觉',
        },
        {
          content: '父亲总是回避关于"我小时候"的话题',
          position: '第四章',
          initialInterpretation: '父亲性格内向不善表达',
          recoveryMethod: '因为每次提起都会暴露"她"的存在',
          impactAfterRecovery: '沉默也是共谋',
        },
        {
          content: '母亲手机屏保是两个女孩的背影',
          position: '第一章',
          initialInterpretation: '网络图片',
          recoveryMethod: '那是姐妹俩唯一的合影背影',
          impactAfterRecovery: '母亲一直在看这张背影',
        },
        {
          content: '社区医院的老医生看我的眼神很复杂',
          position: '第五章',
          initialInterpretation: '老医生认识我家人',
          recoveryMethod: '他就是当年抢救姐姐的医生',
          impactAfterRecovery: '所有知情者都在沉默',
        },
      ]),
    },
    {
      keywords: ['目标', 'step1-goal'],
      content: JSON.stringify({
        protagonist: '我',
        goal: '弄清楚母亲手机里另一个微信账号是谁在用',
        motivation: '母亲深夜反常行为让我感到不安',
        winCondition: '确认账号的真实主人',
      }),
    },
    {
      keywords: ['诱因', 'step2-trigger'],
      content: JSON.stringify({
        triggerEvent: '母亲去厨房倒水时手机留在桌上，屏幕亮了，是一条微信消息',
        triggerMethod: '意外瞥见',
        urgency: '高——母亲即将回来，只有几十秒机会',
      }),
    },
    {
      keywords: ['行动', 'step3-action'],
      content: '手机屏幕还亮着。\n\n我快速扫了一眼——微信消息提示："张老师，孩子们的照片我整理好了，发您还是发老李？"\n\n联系人备注：王姐。\n\n我的心跳猛地加速。\n\n母亲的手机设了防窥膜，从侧面看是一片黑。我不得不把手机拿起来，倾斜屏幕。\n\n解锁界面。\n\n消息内容看不完整，只有第一行字。\n\n我犹豫了三秒。\n\n然后把手机放回原处。\n\n不是因为不想看——是因为我的手指刚碰到屏幕，就看到锁屏壁纸上，是两个女孩的背影。\n\n一个是我。\n\n另一个，我不认识。',
    },
    {
      keywords: ['阻碍', 'step4-obstacle'],
      content: JSON.stringify({
        obstacleType: '技术+心理双重阻碍',
        description: '手机有防窥膜和密码锁；母亲对我的隐私空间极度敏感；加上内心对"真相"的本能恐惧',
        protagonistReaction: '暂时退缩，但决定第二天趁母亲买菜时再尝试',
      }),
    },
    {
      keywords: ['误判', 'step5-misjudge'],
      content: JSON.stringify({
        protagonistThinks: '母亲的异常行为可能是因为年纪大了精神不太好，或者是被人骗了',
        actualTruth: '母亲清醒地、有计划地维持着一个"两个女儿都在"的信息茧房',
        infoGapSource: '我从未知道姐姐的存在，所以所有判断都建立在"独生女"这个错误前提上',
        consequenceOfMisjudgment: '低估了问题的严重性，没有及时与父亲沟通',
      }),
    },
    {
      keywords: ['反转', 'step6-reversal'],
      content: JSON.stringify({
        reversalType: '身份反转——不存在的人其实存在过',
        reversalMoment: '在王阿姨说漏嘴"你们家两个孩子"的那一刻，所有碎片拼在一起：防窥膜、锁屏壁纸、两个女孩的背影、母亲说的"你们姐妹"',
        reactions: '我整个人僵在原地。王阿姨意识到说漏嘴了，脸一下子白了。',
      }),
    },
    {
      keywords: ['代价', 'step7-cost'],
      content: JSON.stringify({
        costType: '心理代价+信任危机',
        description: '我发现自己一直在活在一个被精心维护的谎言里。最信任的父母，一个在维持幻觉，一个在沉默纵容。',
        subsequentImpact: '我与父母的关系降到冰点，开始重新审视所有的童年记忆',
      }),
    },
    // === 灵感发现（深度模式）===
    {
      keywords: ['idea-discover'],
      content: JSON.stringify([
        {
          title: '北洋军火库的秘密账本',
          angle: '历史缝隙',
          hook: '1916年天津军火库失火案，一份被烧毁的账本背后，牵出列强对华军火走私的百年暗线',
          description: '退伍文书陆川在整理北洋军政府旧档时，发现一本被刻意遗漏的英文账本。从天津租界到东北战场，一笔笔军火交易记录串联起军阀混战背后的国际势力博弈。他本只想查清父亲的死因，却一步步卷入了一场关乎国运的暗战。',
          setting: '1916-1920年，天津租界、奉天城、北京',
          protagonist: '陆川，28岁，前北洋军文书，精通英文和算术，性格谨慎但骨子里有热血',
          characters: ['陆川', '日本商人山本', '英国领事馆秘书艾伦', '奉军军需官老孟'],
          styleTags: ['热血', '历史', '悬疑'],
          tone: '家国情怀 + 悬疑解密',
          estimatedWords: { short: '8000-15000', long: '30万-50万' },
        },
        {
          title: '1919年奉天城的匿名电报',
          angle: '新闻改编',
          hook: '1919年，奉天城突然遍布匿名电报，每一条都精准预言了次日发生的大事——但发报人查不到，收报人不认识',
          description: '记者周明远奉命调查奉天城内神秘电报事件。每条电报提前12小时送达，内容涉及官员调动、军队行动、外交密约。起初以为是境外势力在搅局，追查下去才发现，发报网络的源头指向一个根本不存在的人。而这个"不存在的人"，正在用超前的情报体系，试图改写东北的命运。',
          setting: '1919年，奉天城、电报局、日本关东军司令部',
          protagonist: '周明远，25岁，申报驻奉天记者，敏锐而执拗',
          characters: ['周明远', '电报局主任孙先生', '日本特务机关长', '报童阿福'],
          styleTags: ['爽文', '悬疑', '谍战'],
          tone: '烧脑悬疑 + 民族热血',
          estimatedWords: { short: '10000-20000', long: '25万-40万' },
        },
        {
          title: '我被系统投放到1910年的哈尔滨',
          angle: '穿越新解',
          hook: '不是系统文，不是无限流——我面前弹出一个半透明面板，上面只写着一句话："修复该时空的历史损伤，否则你将消失。"',
          description: '程序员陈潇在一次代码调试中意外穿越到1910年的哈尔滨中东铁路附属地。随身只有一个半透明"系统面板"，功能极其有限：显示该时空的"历史偏差值"。他发现这个时代的历史已经被某种力量严重扭曲——日俄的入侵比真实历史提前了十年。他必须用自己微薄的现代知识，在夹缝中一点点修正历史的航向。',
          setting: '1910年，哈尔滨、中东铁路沿线、西伯利亚',
          protagonist: '陈潇，29岁，程序员，理性思维，适应力强',
          characters: ['陈潇', '铁路工程师安德烈', '商会会长赵老爷', '神秘女子苏婉'],
          styleTags: ['爽文', '热血', '科幻'],
          tone: '硬核穿越 + 历史改写',
          estimatedWords: { short: '15000-25000', long: '50万-80万' },
        },
        {
          title: '刀在手，跟我走——北洋炊事班',
          angle: '小人物大历史',
          hook: '1918年，北洋军一个炊事班被误认为精锐部队派上前线。他们连枪都端不稳，但却用炒勺和蒸笼，打出了整个战役的转机',
          description: '北洋军第47混成旅的炊事班，六个最不起眼的老兵。因为一份调令抄错番号，被当作精锐侦察队派到最前线。他们没有步枪只有菜刀，没有工兵铲只有炒勺，但他们在前线用一口行军锅煮出了整场战役的转折点。马伯庸式的历史缝隙叙事——最荒诞的巧合，往往藏着最真实的热血。',
          setting: '1918年，北洋前线、战壕、临时炊事棚',
          protagonist: '刘大勺，35岁，炊事班班长，胖乎乎但手速极快',
          characters: ['刘大勺', '副班长王二愣', '伙夫小李', '真正的精锐连长赵铁栓'],
          styleTags: ['热血', '爽文', '搞笑'],
          tone: '热血 + 黑色幽默',
          estimatedWords: { short: '5000-10000', long: '20万-30万' },
        },
        {
          title: '她叫沈晚晴，民国第一女法医',
          angle: '职业传奇',
          hook: '1920年北平发生连环命案，洋人巡捕束手无策，一个刚从法国留学回来的女人拿起解剖刀，说：让我来',
          description: '沈晚晴，中国第一批留学法国的女法医。回国第一天就接手了一桩让北平警署头疼三个月的悬案——六具尸体，五种死法，零个目击者。她用当时最前卫的法医学手段（指纹鉴定、弹道分析、血清检测）逐一破解，却在最后一具尸体上发现了一个自己不该知道的秘密——凶手的下一个目标，是整个北平城的供水系统。',
          setting: '1920年，北平、法国领事馆、自来水厂',
          protagonist: '沈晚晴，27岁，留法法医学博士，冷静理性，有正义感',
          characters: ['沈晚晴', '警长马德禄', '助手小何', '法国领事杜邦'],
          styleTags: ['刀人', '悬疑', '女强'],
          tone: '悬疑推理 + 家国大义',
          estimatedWords: { short: '12000-20000', long: '35万-50万' },
        },
      ]),
    },

    // === 全量内容生成 ===
    {
      keywords: ['generate-all-content', '全量生成'],
      content: JSON.stringify({
        outline: {
          type: 'short_story',
          volumes: [
            {
              title: '第一卷：初入北洋',
              order: 1,
              chapters: [
                { title: '第一章：军火库的烟', order: 1, function: 'hook', content: '天津军火库的大火刚灭，灰烬中还冒着青烟。陆川站在警戒线外，手里的调令已经被汗水浸湿。他本是来报到当文书的，不是来查案子的。但长官说："你会英文，你去。"', targetWords: 3400, wordCountReason: '开篇异常、现场勘查与首次选择需要完整建立' },
                { title: '第二章：账本最后一页', order: 2, function: 'exposition', content: '账本在保险柜里，烧得只剩一半。陆川一页页翻过去，发现了一个规律——所有被烧毁的记录，都是同一年同一个月。', targetWords: 3200, wordCountReason: '单场景证据揭示，节奏应紧凑' },
                { title: '第三章：租界的另一面', order: 3, function: 'rising_action', content: '陆川拿着账本残页去天津英租界找线索。在维多利亚道的咖啡馆里，他见到了一个自称"商人"的日本人——山本一郎。', targetWords: 3600, wordCountReason: '跨地点追查与新人物试探需要双场景推进' },
                { title: '第四章：暗流涌动', order: 4, function: 'conflict', content: '山本提出用重金买下账本。陆川拒绝了。当晚，他的住处被人翻了个底朝天。账本不见了——但陆川已经全部背下来了。', targetWords: 3800, wordCountReason: '谈判、拒绝与夜袭构成连续冲突升级' },
                { title: '第五章：奉天之约', order: 5, function: 'climax', content: '账本指向的最终目的地是奉天。陆川带着记忆中的账本内容踏上了北上的火车。他不知道，山本的人已经在奉天火车站布下了天罗地网。', targetWords: 4000, wordCountReason: '阶段高潮、转场和伏击铺设需要较大篇幅' },
                { title: '第六章：军人的抉择', order: 6, function: 'resolution', content: '在奉天城外的军营里，陆川见到了账本真正的幕后人物。一个他从未想过会是敌人的中国人。最后的抉择摆在他面前——是保全自己，还是把真相公之于众。', targetWords: 3600, wordCountReason: '真相揭示、价值选择和收束需要留出情绪空间' },
              ],
            },
          ],
        },
        characters: [
          {
            name: '陆川',
            identity: '主角',
            age: 28,
            gender: '男',
            personality: '谨慎内敛、善思考、关键时刻有热血',
            appearance: '中等身材，穿旧军装常服，戴一副圆框眼镜',
            background: '前北洋军文书，父亲在军火库大火中丧生，通晓英文和算术',
            goals: '查明父亲死因 → 揭露军火走私网络 → 在乱世中找到自己的立场',
            fears: '自己的懦弱、辜负父亲的期望',
            relationships: [
              { target: '山本一郎', type: 'enemy', description: '想买账本的日本商人，实则日本关东军间谍' },
              { target: '老孟', type: 'ally', description: '奉军军需官，父亲的老战友' },
            ],
            arc: '从只想求个安稳的小文书 → 被迫卷入大棋局 → 主动选择站出来',
          },
          {
            name: '山本一郎',
            identity: '反派',
            age: 45,
            gender: '男',
            personality: '表面儒雅随和，实则冷酷果断',
            appearance: '西装革履，戴金丝眼镜，常年在天津租界活动',
            background: '日本商人身份掩护下的关东军情报人员',
            goals: '销毁军火交易证据、清除掌握真相的陆川',
            fears: '行动暴露引发的国际纠纷',
            relationships: [
              { target: '陆川', type: 'enemy', description: '掌握账本的关键人物，必须除掉' },
            ],
            arc: '从容应对 → 步步紧逼 → 穷途末路',
          },
          {
            name: '老孟',
            identity: '配角',
            age: 50,
            gender: '男',
            personality: '粗犷直爽、重情重义、老油条',
            appearance: '满脸风霜，穿旧军装，腰间别着旱烟袋',
            background: '奉军军需官，与陆川父亲是过命的交情',
            goals: '帮助陆川完成他父亲未竟之事',
            fears: '军中的蛀虫把奉军拖入深渊',
            relationships: [
              { target: '陆川', type: 'ally', description: '世侄，誓死保护' },
            ],
            arc: '老兵不死，只是慢慢凋零',
          },
        ],
        worldSetting: {
          era: '1916-1920年北洋时期',
          geography: [
            '天津英租界——维多利亚道、利顺德大饭店、码头仓库区',
            '奉天城——张氏帅府、北市场、日本满铁附属地',
            '北京——北洋政府国务院、东交民巷',
          ],
          factions: [
            { name: '北洋政府', stance: '中央政府', influence: '高但正在衰落' },
            { name: '日本关东军', stance: '渗透势力', influence: '正在上升' },
            { name: '英国领事馆', stance: '列强势力', influence: '维护既得利益' },
            { name: '奉系军阀', stance: '地方势力', influence: '迅速崛起' },
          ],
          rules: '奉天城各方势力暗斗，日本关东军借"保护侨民"名义不断扩张势力范围',
          atmosphere: '表面繁华的租界与暗流涌动的权力博弈，大时代下小人物的挣扎与抉择',
        },
        organizations: [
          { name: '天津英租界工部局', type: '行政', description: '英国在天津租界的行政管理机构' },
          { name: '日本关东军情报课', type: '军事', description: '日本在满洲的情报机构，以商社为掩护活动' },
          { name: '奉军军需处', type: '军事', description: '奉系军阀的后勤机构，掌控东北军火调配' },
        ],
        mapPoints: [
          { name: '天津军火库', type: '关键地点', description: '故事起点，陆川父亲丧生之地' },
          { name: '维多利亚道咖啡馆', type: '关键地点', description: '陆川与山本第一次交锋之处' },
          { name: '奉天火车站', type: '关键地点', description: '故事高潮对峙之地' },
          { name: '奉军北郊军营', type: '关键地点', description: '最终真相揭晓之处' },
        ],
      }),
    },
  ];

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    this.logger.log(`[MockLLM] 收到请求，Prompt 长度: ${request.prompt.length} 字符`);

    // 根据 Prompt 关键词匹配最佳模拟响应
    const matched = this.matchResponse(request.prompt);

    const latency = Date.now() - startTime;

    // 模拟网络延迟 50-150ms
    await this.simulateDelay(50, 150);

    return {
      content: matched,
      model: request.model || 'mock-model',
      usage: {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(matched.length / 4),
        totalTokens: Math.ceil((request.prompt.length + matched.length) / 4),
      },
      latency,
    };
  }

  getModelName(): string {
    return 'mock-model';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * 根据 Prompt 关键词匹配模拟响应
   */
  private matchResponse(prompt: string): string {
    // 尝试关键词匹配
    for (const mock of this.mockResponses) {
      const allMatched = mock.keywords.some((kw) =>
        prompt.includes(kw),
      );
      if (allMatched) {
        this.logger.debug(`[MockLLM] 匹配到模板: ${mock.keywords[0]}`);
        return mock.content;
      }
    }

    // 默认返回：模拟一个 JSON 响应
    this.logger.debug('[MockLLM] 未匹配到模板，返回默认响应');
    return JSON.stringify({
      result: '模拟处理完成',
      note: '这是 MockLLM 默认响应，请检查 Prompt 是否包含预期关键词',
    });
  }

  /**
   * 模拟网络延迟
   */
  private async simulateDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
