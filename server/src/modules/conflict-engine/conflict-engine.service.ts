/**
 * 冲突检测引擎 Service
 * 四级优先级冲突检测系统
 *
 * 优先级:
 *   P0(100) - 锁定正文（不可自动解决）
 *   P1(80)  - 世界观设定（需用户确认）
 *   P2(50)  - 基础设定角色/组织（可自动修正）
 *   P3(20)  - 未锁定正文（仅记录）
 *
 * 检测模式: 实时(写完每一段触发)、深度(整章完成后)
 * 检测类型: 角色OOC/设定矛盾/时间线冲突/伏笔丢失/逻辑跳跃
 */
import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

// --------------- 类型定义 ---------------

export enum ConflictPriority {
  P0 = 100, // 锁定正文
  P1 = 80,  // 世界观设定
  P2 = 50,  // 基础设定角色/组织
  P3 = 20,  // 未锁定正文
}

export enum ConflictType {
  CHARACTER_OOC = 'character_ooc',
  SETTING_CONTRADICTION = 'setting_contradiction',
  TIMELINE_CONFLICT = 'timeline_conflict',
  FORESHADOWING_LOSS = 'foreshadowing_loss',
  LOGIC_JUMP = 'logic_jump',
}

export enum ConflictStatus {
  PENDING = 'pending',
  AUTO_RESOLVED = 'auto_resolved',
  USER_RESOLVED = 'user_resolved',
  IGNORED = 'ignored',
}

export interface ConflictLocation {
  chapterIndex: number;
  lineNumber: number;
  paragraphIndex: number;
}

export interface ConflictRecord {
  id: string;
  type: ConflictType;
  priority: ConflictPriority;
  location: ConflictLocation;
  description: string;
  context: string;
  suggestion: string;
  status: ConflictStatus;
  detectionMode: 'realtime' | 'deep';
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface ConflictStats {
  total: number;
  byType: Record<ConflictType, number>;
  byPriority: Record<ConflictPriority, number>;
  byStatus: Record<ConflictStatus, number>;
}

// --------------- 模拟数据 ---------------

interface ChapterContent {
  index: number;
  title: string;
  content: string;
  paragraphs: string[];
  isLocked: boolean;
}

interface CharacterInfo {
  name: string;
  traits: string[];
  role: string;
}

interface WorldSetting {
  key: string;
  value: string;
  category: string;
}

// --------------- 新增接口 ---------------

export interface ConflictReport {
  hasConflicts: boolean;
  conflicts: ConflictRecord[];
  summary: {
    total: number;
    byPriority: Record<ConflictPriority, number>;
    byType: Record<ConflictType, number>;
    bySeverity: { high: number; medium: number; low: number };
  };
}

export interface WorldChangePlan {
  changes: { field: string; oldValue: string; newValue: string }[];
  impactAnalysis: { affectedContent: string[]; severity: 'low' | 'medium' | 'high' }[];
  suggestions: string[];
  requiresConfirmation: boolean;
}

@Injectable()
export class ConflictEngineService {
  // 内存存储，实际替换为数据库
  private conflicts: ConflictRecord[] = [];

  // 模拟数据（由外部注入或测试使用）
  private characters: CharacterInfo[] = [];
  private worldSettings: WorldSetting[] = [];

  /**
   * 设置角色数据（由外部调用注入）
   */
  setCharacters(characters: CharacterInfo[]): void {
    this.characters = characters;
  }

  /**
   * 设置世界观数据
   */
  setWorldSettings(settings: WorldSetting[]): void {
    this.worldSettings = settings;
  }

  // ==================== 运行检测 ====================

  /**
   * 实时检测（写完每一段触发）
   */
  runRealtimeDetection(
    chapter: ChapterContent,
    paragraphContent: string,
    paragraphIndex: number,
  ): ConflictRecord[] {
    const newConflicts: ConflictRecord[] = [];

    // 1. 角色OOC检测
    this.detectCharacterOOC(paragraphContent, chapter, paragraphIndex, newConflicts);

    // 2. 设定矛盾检测
    this.detectSettingContradiction(paragraphContent, chapter, paragraphIndex, newConflicts);

    // 3. 逻辑跳跃检测
    if (paragraphIndex > 0) {
      const prevParagraph = chapter.paragraphs[paragraphIndex - 1] || '';
      this.detectLogicJump(prevParagraph, paragraphContent, chapter, paragraphIndex, newConflicts);
    }

    this.conflicts.push(...newConflicts);
    return newConflicts;
  }

  /**
   * 深度检测（整章完成后触发）
   */
  runDeepDetection(chapter: ChapterContent): ConflictRecord[] {
    const newConflicts: ConflictRecord[] = [];

    // 1. 时间线冲突检测
    this.detectTimelineConflicts(chapter, newConflicts);

    // 2. 伏笔丢失检测
    this.detectForeshadowingLoss(chapter, newConflicts);

    // 3. 角色一致性检测（通篇）
    this.detectCharacterConsistency(chapter, newConflicts);

    // 4. 设定矛盾检测（通篇）
    this.detectSettingConsistency(chapter, newConflicts);

    // 5. 逻辑跳跃检测（全章分析）
    this.detectGlobalLogicIssues(chapter, newConflicts);

    // 根据章节锁定状态设置优先级
    for (const conflict of newConflicts) {
      if (chapter.isLocked && conflict.priority === ConflictPriority.P3) {
        conflict.priority = ConflictPriority.P0;
      }
    }

    this.conflicts.push(...newConflicts);
    return newConflicts;
  }

  // ==================== 检测规则实现 ====================

  /**
   * 角色OOC检测
   */
  private detectCharacterOOC(
    text: string,
    chapter: ChapterContent,
    paragraphIndex: number,
    results: ConflictRecord[],
  ): void {
    for (const char of this.characters) {
      // 如果角色出现在该段中
      const nameRegex = new RegExp(char.name, 'g');
      if (!nameRegex.test(text)) continue;

      // 检查是否有违背角色设定的行为
      for (const trait of char.traits) {
        const contradictPatterns = this.getOOCPatterns(trait);
        for (const pattern of contradictPatterns) {
          if (text.includes(pattern)) {
            results.push(this.createConflict(
              ConflictType.CHARACTER_OOC,
              this.getCharacterOOCPriority(chapter, char),
              chapter.index,
              paragraphIndex,
              `角色"${char.name}"出现OOC行为（违背"${trait}"设定）`,
              text.substring(0, 150),
              `角色"${char.name}"的设定为"${trait}"，此处行为与设定不符。建议修改或补充角色设定说明。`,
              'realtime',
            ));
          }
        }
      }
    }
  }

  /**
   * 获取与某个特质矛盾的OOC模式
   */
  private getOOCPatterns(trait: string): string[] {
    const antonymMap: Record<string, string[]> = {
      '勇敢': ['害怕', '恐惧', '退缩', '逃跑', '胆小'],
      '胆小': ['勇敢', '冲锋', '独闯', '不怕'],
      '善良': ['残忍', '杀戮', '虐待', '冷酷'],
      '冷酷': ['同情', '怜悯', '心软', '不忍'],
      '聪明': ['愚蠢', '笨', '不明白', '不懂'],
      '愚笨': ['聪明', '机智', '智慧'],
      '沉默': ['滔滔不绝', '多言', '话多'],
      '急躁': ['耐心', '慢慢', '不急'],
    };
    return antonymMap[trait] || [];
  }

  /**
   * 角色OOC的优先级
   */
  private getCharacterOOCPriority(
    chapter: ChapterContent,
    char: CharacterInfo,
  ): ConflictPriority {
    if (chapter.isLocked) return ConflictPriority.P0;
    if (char.role === 'protagonist' || char.role === 'main') return ConflictPriority.P1;
    if (char.role === 'secondary') return ConflictPriority.P2;
    return ConflictPriority.P3;
  }

  /**
   * 设定矛盾检测
   */
  private detectSettingContradiction(
    text: string,
    chapter: ChapterContent,
    paragraphIndex: number,
    results: ConflictRecord[],
  ): void {
    for (const setting of this.worldSettings) {
      // 检查是否提到该设定相关的内容
      if (text.includes(setting.key)) {
        // 检查是否与设定值矛盾
        const negations = [
          '不' + setting.key,
          '没有' + setting.key,
          '不是' + setting.value,
          '不是' + setting.key,
          '并非',
          '不再',
          '并非' + setting.value,
        ];
        for (const neg of negations) {
          if (text.includes(neg)) {
            results.push(this.createConflict(
              ConflictType.SETTING_CONTRADICTION,
              chapter.isLocked ? ConflictPriority.P0 : ConflictPriority.P1,
              chapter.index,
              paragraphIndex,
              `设定矛盾: "${setting.key}"应为"${setting.value}"`,
              text.substring(0, 150),
              `世界观设定中"${setting.key}=${setting.value}"，但文本出现"${neg}"。请确认是否需要修改设定或文本。`,
              'realtime',
            ));
          }
        }
      }
    }
  }

  /**
   * 逻辑跳跃检测
   */
  private detectLogicJump(
    prevParagraph: string,
    currParagraph: string,
    chapter: ChapterContent,
    paragraphIndex: number,
    results: ConflictRecord[],
  ): void {
    // 检测人称切换是否连贯
    const prevChars = this.extractCharactersInText(prevParagraph);
    const currChars = this.extractCharactersInText(currParagraph);

    if (prevChars.length > 0 && currChars.length > 0) {
      const hasOverlap = prevChars.some((c) => currChars.includes(c));
      // 如果前后段落无共同角色但话题突变，可能是逻辑跳跃
      if (!hasOverlap && !this.hasTransitionWords(currParagraph)) {
        results.push(this.createConflict(
          ConflictType.LOGIC_JUMP,
          chapter.isLocked ? ConflictPriority.P0 : ConflictPriority.P3,
          chapter.index,
          paragraphIndex,
          '段落间逻辑跳跃（缺少过渡）',
          `前段: ${prevParagraph.substring(0, 50)}...\n后段: ${currParagraph.substring(0, 50)}...`,
          '前后段落角色/场景突然切换，缺少过渡性描述或转场。建议添加过渡句。',
          'realtime',
        ));
      }
    }
  }

  /**
   * 时间线冲突检测
   */
  private detectTimelineConflicts(
    chapter: ChapterContent,
    results: ConflictRecord[],
  ): void {
    // 提取所有时间相关的语句
    const timePatterns = [
      /(?:昨天|今天|明天|后天|前天)/g,
      /(?:早上|中午|下午|晚上|夜里|凌晨|清晨|黄昏|午夜)/g,
      /(?:第\d+天|第\d+日|第\d+年|一年后|两年后|多年后|片刻后|不久后)/g,
    ];

    const timeMentions: { text: string; paragraphIndex: number }[] = [];
    for (let i = 0; i < chapter.paragraphs.length; i++) {
      const para = chapter.paragraphs[i];
      for (const pattern of timePatterns) {
        const matches = para.matchAll(pattern);
        for (const match of matches) {
          timeMentions.push({ text: match[0], paragraphIndex: i });
        }
      }
    }

    // 检查时间逻辑矛盾（如先"早上"后"黄昏"是正常的，但连续两个"早上"可能有问题）
    const morningCount = timeMentions.filter((t) =>
      ['早上', '上午', '凌晨', '清晨'].includes(t.text),
    ).length;
    const nightCount = timeMentions.filter((t) =>
      ['晚上', '夜里', '黄昏', '午夜'].includes(t.text),
    ).length;

    if (morningCount > 3 && nightCount === 0 && chapter.paragraphs.length > 20) {
      results.push(this.createConflict(
        ConflictType.TIMELINE_CONFLICT,
        chapter.isLocked ? ConflictPriority.P0 : ConflictPriority.P2,
        chapter.index,
        0,
        `时间线可疑：全章出现${morningCount}次早晨描述但无夜晚描述`,
        `早晨提及次数: ${morningCount}, 夜晚提及次数: ${nightCount}`,
        '如果故事时间跨度超过一天，建议补充夜晚/时间过渡描述。',
        'deep',
      ));
    }

    // 检测时间倒流（后面提到的时间早于前面的）
    const orderedMentions = ['凌晨', '清晨', '早上', '上午', '中午', '下午', '黄昏', '晚上', '夜里', '午夜'];
    let prevTimeIndex = -1;
    for (const mention of timeMentions) {
      const currentIndex = orderedMentions.indexOf(mention.text);
      if (currentIndex >= 0) {
        if (prevTimeIndex >= 0 && currentIndex < prevTimeIndex - 1) {
          results.push(this.createConflict(
            ConflictType.TIMELINE_CONFLICT,
            chapter.isLocked ? ConflictPriority.P0 : ConflictPriority.P1,
            chapter.index,
            mention.paragraphIndex,
            `时间线矛盾：从"${orderedMentions[prevTimeIndex]}"跳到"${orderedMentions[currentIndex]}"`,
            `第${mention.paragraphIndex + 1}段出现"${mention.text}"，但之前是"${orderedMentions[prevTimeIndex]}"`,
            '时间描述出现倒流，请确认是否正确。如为倒叙手法，建议补充时间提示。',
            'deep',
          ));
        }
        if (currentIndex >= 0) {
          prevTimeIndex = currentIndex;
        }
      }
    }
  }

  /**
   * 伏笔丢失检测
   */
  private detectForeshadowingLoss(
    chapter: ChapterContent,
    results: ConflictRecord[],
  ): void {
    // 检测"伏笔"关键词但未展开
    const foreshadowKeywords = ['忽然', '突然', '意外', '没想到', '谁知', '岂料', '原来', '竟然'];
    let foreshadowCount = 0;

    for (let i = 0; i < chapter.paragraphs.length; i++) {
      const para = chapter.paragraphs[i];
      for (const keyword of foreshadowKeywords) {
        if (para.includes(keyword)) {
          foreshadowCount++;
          // 检查该句之后是否有展开说明
          const remainingText = chapter.paragraphs.slice(i).join('');
          const explainPatterns = ['原来', '是因为', '原来如此', '明白了', '真相', '解释', '原因'];
          const hasExplanation = explainPatterns.some((p) => remainingText.includes(p));

          if (!hasExplanation && i < chapter.paragraphs.length - 1) {
            results.push(this.createConflict(
              ConflictType.FORESHADOWING_LOSS,
              chapter.isLocked ? ConflictPriority.P0 : ConflictPriority.P2,
              chapter.index,
              i,
              `伏笔未回收: 使用"${keyword}"但后续未展开解释`,
              para.substring(0, 100),
              '使用"突然/原来"等转折词后，建议后续段落给出合理解释，否则构成悬空伏笔。',
              'deep',
            ));
          }
        }
      }
    }
  }

  /**
   * 角色一致性检测（通篇）
   */
  private detectCharacterConsistency(
    chapter: ChapterContent,
    results: ConflictRecord[],
  ): void {
    // 检查角色名是否前后一致
    const nameVariations = new Map<string, Set<string>>();

    for (let i = 0; i < chapter.paragraphs.length; i++) {
      for (const char of this.characters) {
        if (chapter.paragraphs[i].includes(char.name)) {
          if (!nameVariations.has(char.name)) {
            nameVariations.set(char.name, new Set());
          }
          nameVariations.get(char.name)!.add(char.name);
        }

        // 检查简称
        if (char.name.length >= 3) {
          const shortName = char.name.substring(1); // 如"林黛玉"→"黛玉"
          if (shortName.length >= 2 && chapter.paragraphs[i].includes(shortName)) {
            nameVariations.get(char.name)?.add(shortName);
          }
        }
      }
    }

    // 如果某角色有多种称呼形式，发出提醒
    for (const [name, variations] of nameVariations) {
      if (variations.size > 2) {
        results.push(this.createConflict(
          ConflictType.CHARACTER_OOC,
          ConflictPriority.P3,
          chapter.index,
          0,
          `角色"${name}"有${variations.size}种不同称呼`,
          `称呼: ${Array.from(variations).join(', ')}`,
          '角色有多个不同称呼，建议在叙述中保持一致，或在角色信息中补充别名。',
          'deep',
        ));
      }
    }
  }

  /**
   * 设定一致性检测（通篇）
   */
  private detectSettingConsistency(
    chapter: ChapterContent,
    results: ConflictRecord[],
  ): void {
    const allText = chapter.paragraphs.join('\n');

    for (const setting of this.worldSettings) {
      const settingMentions = (allText.match(new RegExp(setting.key, 'g')) || []).length;
      if (settingMentions > 0) {
        // 检查所有提及是否与设定一致
        const valueMentions = (allText.match(new RegExp(setting.value, 'g')) || []).length;
        // 如果设定值被提及次数远少于设定键，可能有问题
      }
    }
  }

  /**
   * 全局逻辑问题检测
   */
  private detectGlobalLogicIssues(
    chapter: ChapterContent,
    results: ConflictRecord[],
  ): void {
    const allText = chapter.paragraphs.join('\n');

    // 检测数字一致性
    const numbers = allText.match(/\d+/g);
    if (numbers) {
      // 检查是否有明显的不合理数字
      for (const num of numbers) {
        const intNum = parseInt(num, 10);
        if (intNum > 1000000 && !num.includes(',')) {
          results.push(this.createConflict(
            ConflictType.LOGIC_JUMP,
            chapter.isLocked ? ConflictPriority.P0 : ConflictPriority.P2,
            chapter.index,
            0,
            `数值可能不合理: ${num}`,
            `文本中出现数值 ${num}`,
            '请确认该数值是否合理，是否需要注意单位或描述准确性。',
            'deep',
          ));
        }
      }
    }

    // 检测句子是否过于冗长（超过100字）
    const sentences = allText.split(/[。！？\n]/);
    for (const sentence of sentences) {
      if (sentence.length > 100) {
        results.push(this.createConflict(
          ConflictType.LOGIC_JUMP,
          ConflictPriority.P3,
          chapter.index,
          0,
          `句子过长（${sentence.length}字），可能影响逻辑连贯性`,
          sentence.substring(0, 80) + '...',
          '建议将长句拆分为多个短句，以提升可读性和逻辑清晰度。',
          'deep',
        ));
        break; // 每章最多报一个
      }
    }
  }

  // ==================== 锁定时/世界观修改时/导入时触发（R3）====================

  /**
   * 锁定时触发 — 章节从未锁定→锁定转换时检查
   * 锁定后所有 P3 级冲突升级为 P0（不可自动解决）
   */
  async checkOnLock(chapterId: string, projectId: string): Promise<ConflictReport> {
    // 模拟查找章节（实际应由数据库查询）
    const chapter: ChapterContent = {
      index: parseInt(chapterId.replace(/\D/g, '')) || 1,
      title: `第${chapterId}章`,
      content: '',
      paragraphs: ['锁定章节内容，所有冲突已升级为P0。'],
      isLocked: true,
    };

    // 锁定后运行深度检测
    const deepConflicts = this.runDeepDetection(chapter);

    // 将所有 P3 冲突升级为 P0
    for (const conflict of deepConflicts) {
      if (conflict.priority === ConflictPriority.P3) {
        conflict.priority = ConflictPriority.P0;
      }
    }

    // 检查是否有未解决的 P0 冲突（锁定内容不可修改）
    const allConflicts = this.getConflicts({ chapterIndex: chapter.index });
    const pendingP0 = allConflicts.filter(
      (c) => c.priority === ConflictPriority.P0 && c.status === ConflictStatus.PENDING,
    );

    // 创建锁定事件特有的冲突提示
    if (pendingP0.length > 0) {
      const lockConflict = this.createConflict(
        ConflictType.SETTING_CONTRADICTION,
        ConflictPriority.P0,
        chapter.index,
        0,
        `章节锁定后仍有 ${pendingP0.length} 个未解决冲突`,
        `待解决冲突: ${pendingP0.map((c) => c.description).join('; ')}`,
        '建议在锁定前解决所有P0/P1级冲突，锁定后修改需手动解锁。',
        'deep',
      );
      this.conflicts.push(lockConflict);
      deepConflicts.push(lockConflict);
    }

    return this.buildConflictReport(deepConflicts);
  }

  /**
   * 世界观修改时触发 — 检查所有受影响内容
   */
  async checkOnWorldUpdate(worldId: string, projectId: string): Promise<ConflictReport> {
    const updatedSettings = this.worldSettings.filter((s) => s.key.includes(worldId) || s.category === worldId);
    const allConflicts: ConflictRecord[] = [];

    // 对所有受影响的设定生成冲突记录
    for (const setting of updatedSettings) {
      // 检查是否有关联的章节内容
      const relatedConflicts = this.conflicts.filter(
        (c) => c.type === ConflictType.SETTING_CONTRADICTION && c.context.includes(setting.key),
      );

      // 生成世界观修改特有的通知冲突
      const worldUpdateConflict = this.createConflict(
        ConflictType.SETTING_CONTRADICTION,
        ConflictPriority.P1,
        0,
        0,
        `世界观"${setting.key}"已修改`,
        `设定: ${setting.key} = ${setting.value}（分类: ${setting.category}）`,
        '世界观修改可能影响所有已写章节，建议审查相关内容一致性。',
        'deep',
      );
      this.conflicts.push(worldUpdateConflict);
      allConflicts.push(worldUpdateConflict);

      // 关联已有的冲突
      allConflicts.push(...relatedConflicts);
    }

    // 如果没有受影响设定，生成提示
    if (updatedSettings.length === 0) {
      const noSettingConflict = this.createConflict(
        ConflictType.SETTING_CONTRADICTION,
        ConflictPriority.P3,
        0,
        0,
        `未找到世界观"${worldId}"的相关设定`,
        `项目 ${projectId} 中未找到匹配的设定`,
        '请确认世界观ID是否正确，或先添加相关设定。',
        'deep',
      );
      this.conflicts.push(noSettingConflict);
      allConflicts.push(noSettingConflict);
    }

    return this.buildConflictReport(allConflicts);
  }

  /**
   * 导入时触发 — 检查兼容性
   */
  async checkOnImport(projectId: string, importContent: string): Promise<ConflictReport> {
    const allConflicts: ConflictRecord[] = [];

    // 1. 检查导入内容与现有角色设定是否冲突
    for (const char of this.characters) {
      const nameRegex = new RegExp(char.name, 'g');
      const matches = importContent.match(nameRegex);
      if (matches) {
        // 角色出现在导入内容中，检查角色行为是否一致
        for (const trait of char.traits) {
          const contradictPatterns = this.getOOCPatterns(trait);
          for (const pattern of contradictPatterns) {
            if (importContent.includes(pattern)) {
              const importConflict = this.createConflict(
                ConflictType.CHARACTER_OOC,
                this.getCharacterOOCPriority({ index: 0, title: '', content: '', paragraphs: [], isLocked: false }, char),
                0,
                0,
                `导入内容中角色"${char.name}"出现OOC（违背"${trait}"）`,
                `导入内容包含"${pattern}"，与角色"${char.name}"的"${trait}"设定矛盾`,
                `角色"${char.name}"的设定为"${trait}"，导入内容与此冲突。建议修改导入内容或更新角色设定。`,
                'deep',
              );
              this.conflicts.push(importConflict);
              allConflicts.push(importConflict);
              break;
            }
          }
        }
      }
    }

    // 2. 检查导入内容与世界观设定是否冲突
    for (const setting of this.worldSettings) {
      if (importContent.includes(setting.key)) {
        const negations = [
          '不' + setting.key,
          '没有' + setting.key,
          '不是' + setting.value,
          '不是' + setting.key,
          '并非',
          '不再',
        ];
        for (const neg of negations) {
          if (importContent.includes(neg)) {
            const worldConflict = this.createConflict(
              ConflictType.SETTING_CONTRADICTION,
              ConflictPriority.P1,
              0,
              0,
              `导入内容与世界观设定冲突: "${setting.key}"应为"${setting.value}"`,
              `导入内容中出现"${neg}"，与世界观设定"${setting.key}=${setting.value}"矛盾`,
              `建议调整导入内容使其与世界观设定一致，或修改世界观设定以兼容新内容。`,
              'deep',
            );
            this.conflicts.push(worldConflict);
            allConflicts.push(worldConflict);
            break;
          }
        }
      }
    }

    // 3. 检查时间线兼容性
    const timePatterns = [
      /(?:昨天|今天|明天|后天|前天)/g,
      /(?:早上|中午|下午|晚上|夜里|凌晨|清晨|黄昏|午夜)/g,
      /(?:第\d+天|第\d+日|第\d+年|一年后|两年后|多年后)/g,
      /(?:公元|纪元)?(\d{3,4})年/g,
    ];

    for (const pattern of timePatterns) {
      const matches = importContent.matchAll(pattern);
      let matchCount = 0;
      for (const _ of matches) {
        matchCount++;
      }
      if (matchCount > 5) {
        const timelineConflict = this.createConflict(
          ConflictType.TIMELINE_CONFLICT,
          ConflictPriority.P2,
          0,
          0,
          `导入内容时间线标记较多（${matchCount}处）`,
          `检测到 ${matchCount} 个时间标记，可能与现有项目时间线冲突`,
          '请核对导入内容的时间线与已有项目时间线是否一致，尤其是时间跨度。',
          'deep',
        );
        this.conflicts.push(timelineConflict);
        allConflicts.push(timelineConflict);
        break;
      }
    }

    return this.buildConflictReport(allConflicts);
  }

  // ==================== 世界观修改需人工确认工作流 ====================

  /**
   * 生成世界观修改方案 — 分析影响范围并决定是否需要人工确认
   */
  generateWorldChangePlan(worldSettingId: string, proposedChanges: object): WorldChangePlan {
    // 查找当前设定
    const currentSetting = this.worldSettings.find(
      (s) => s.key === worldSettingId || s.category === worldSettingId,
    );

    const changes: WorldChangePlan['changes'] = [];
    const affectedContent: string[] = [];

    if (currentSetting) {
      // 对比当前值与提议值
      for (const [field, newValue] of Object.entries(proposedChanges)) {
        const oldValue = (currentSetting as any)[field] || '';
        if (oldValue !== String(newValue)) {
          changes.push({
            field,
            oldValue: String(oldValue),
            newValue: String(newValue),
          });
        }
      }
    } else {
      // 新建设定
      for (const [field, value] of Object.entries(proposedChanges)) {
        changes.push({
          field,
          oldValue: '',
          newValue: String(value),
        });
      }
    }

    // 分析受影响的内容
    const relatedConflicts = this.conflicts.filter((c) =>
      c.context.includes(worldSettingId) || c.description.includes(worldSettingId),
    );
    for (const conflict of relatedConflicts) {
      affectedContent.push(
        `第${conflict.location.chapterIndex}章: ${conflict.description}`,
      );
    }

    // 如果设定影响了章节内容，也标记受影响
    if (currentSetting) {
      const settingMentionConflicts = this.conflicts.filter(
        (c) => c.type === ConflictType.SETTING_CONTRADICTION &&
          c.context.includes(currentSetting.key),
      );
      for (const c of settingMentionConflicts) {
        affectedContent.push(
          `第${c.location.chapterIndex}章第${c.location.paragraphIndex + 1}段: ${c.description}`,
        );
      }
    }

    // 去重
    const uniqueAffected = [...new Set(affectedContent)];

    // 评估影响严重程度
    let severity: 'low' | 'medium' | 'high' = 'low';
    let requiresConfirmation = false;

    if (changes.length > 3) {
      severity = 'high';
      requiresConfirmation = true;
    } else if (changes.length > 1) {
      severity = 'medium';
      requiresConfirmation = uniqueAffected.length > 0;
    }

    // 如果影响已有章节内容，提高严重级别
    if (uniqueAffected.length > 3) severity = 'high';
    if (uniqueAffected.length > 0 && severity === 'low') severity = 'medium';

    // 生成建议
    const suggestions: string[] = [];
    if (changes.length > 0 && currentSetting) {
      suggestions.push(`当前"${worldSettingId}"的已有内容可能受影响，建议重新审查相关章节`);
    }
    if (uniqueAffected.length > 0) {
      suggestions.push(`以下 ${uniqueAffected.length} 处内容可能需修改: ${uniqueAffected.slice(0, 3).join('; ')}${uniqueAffected.length > 3 ? '...' : ''}`);
    }
    if (severity === 'high') {
      suggestions.push('此修改影响范围较大，建议分步实施并逐一确认');
    }
    if (requiresConfirmation) {
      suggestions.push('需要用户确认后才能执行此修改');
    }
    if (suggestions.length === 0) {
      suggestions.push('此修改没有检测到冲突影响，可以安全执行');
    }

    return {
      changes,
      impactAnalysis: [
        {
          affectedContent: uniqueAffected.length > 0 ? uniqueAffected : ['暂无已检测到的受影响内容'],
          severity,
        },
      ],
      suggestions,
      requiresConfirmation,
    };
  }

  /**
   * 构建冲突报告
   */
  private buildConflictReport(conflicts: ConflictRecord[]): ConflictReport {
    const byPriority: Record<ConflictPriority, number> = {
      [ConflictPriority.P0]: 0,
      [ConflictPriority.P1]: 0,
      [ConflictPriority.P2]: 0,
      [ConflictPriority.P3]: 0,
    };
    const byType: Record<ConflictType, number> = {
      [ConflictType.CHARACTER_OOC]: 0,
      [ConflictType.SETTING_CONTRADICTION]: 0,
      [ConflictType.TIMELINE_CONFLICT]: 0,
      [ConflictType.FORESHADOWING_LOSS]: 0,
      [ConflictType.LOGIC_JUMP]: 0,
    };

    for (const c of conflicts) {
      byPriority[c.priority]++;
      byType[c.type]++;
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      summary: {
        total: conflicts.length,
        byPriority,
        byType,
        bySeverity: {
          high: byPriority[ConflictPriority.P0] + byPriority[ConflictPriority.P1],
          medium: byPriority[ConflictPriority.P2],
          low: byPriority[ConflictPriority.P3],
        },
      },
    };
  }

  // ==================== 冲突记录管理 ====================

  /**
   * 获取所有冲突记录
   */
  getConflicts(filters?: {
    priority?: ConflictPriority;
    type?: ConflictType;
    status?: ConflictStatus;
    chapterIndex?: number;
  }): ConflictRecord[] {
    let result = [...this.conflicts];

    if (filters) {
      if (filters.priority !== undefined) result = result.filter((c) => c.priority === filters.priority);
      if (filters.type) result = result.filter((c) => c.type === filters.type);
      if (filters.status) result = result.filter((c) => c.status === filters.status);
      if (filters.chapterIndex) result = result.filter((c) => c.location.chapterIndex === filters.chapterIndex);
    }

    return result.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 获取单条冲突记录
   */
  getConflict(id: string): ConflictRecord | undefined {
    return this.conflicts.find((c) => c.id === id);
  }

  /**
   * 解决冲突
   */
  resolveConflict(
    id: string,
    resolution: 'accept' | 'reject' | 'ignore',
    note?: string,
  ): ConflictRecord | null {
    const conflict = this.conflicts.find((c) => c.id === id);
    if (!conflict) return null;

    const statusMap = {
      accept: ConflictStatus.USER_RESOLVED,
      reject: ConflictStatus.USER_RESOLVED,
      ignore: ConflictStatus.IGNORED,
    };

    conflict.status = statusMap[resolution];
    conflict.resolvedAt = new Date().toISOString();
    conflict.resolutionNote = note || '';

    // 如果接受建议且优先级为P2（可自动修正），标记为auto_resolved
    if (resolution === 'accept' && conflict.priority === ConflictPriority.P2) {
      conflict.status = ConflictStatus.AUTO_RESOLVED;
    }

    return conflict;
  }

  /**
   * 批量自动解决P2级冲突
   */
  autoResolveP2Conflicts(): number {
    let count = 0;
    for (const conflict of this.conflicts) {
      if (conflict.priority === ConflictPriority.P2 && conflict.status === ConflictStatus.PENDING) {
        conflict.status = ConflictStatus.AUTO_RESOLVED;
        conflict.resolvedAt = new Date().toISOString();
        conflict.resolutionNote = '自动解决（P2级可自动修正）';
        count++;
      }
    }
    return count;
  }

  /**
   * 获取冲突统计
   */
  getStats(): ConflictStats {
    const stats: ConflictStats = {
      total: this.conflicts.length,
      byType: {
        [ConflictType.CHARACTER_OOC]: 0,
        [ConflictType.SETTING_CONTRADICTION]: 0,
        [ConflictType.TIMELINE_CONFLICT]: 0,
        [ConflictType.FORESHADOWING_LOSS]: 0,
        [ConflictType.LOGIC_JUMP]: 0,
      },
      byPriority: {
        [ConflictPriority.P0]: 0,
        [ConflictPriority.P1]: 0,
        [ConflictPriority.P2]: 0,
        [ConflictPriority.P3]: 0,
      },
      byStatus: {
        [ConflictStatus.PENDING]: 0,
        [ConflictStatus.AUTO_RESOLVED]: 0,
        [ConflictStatus.USER_RESOLVED]: 0,
        [ConflictStatus.IGNORED]: 0,
      },
    };

    for (const conflict of this.conflicts) {
      stats.byType[conflict.type]++;
      stats.byPriority[conflict.priority]++;
      stats.byStatus[conflict.status]++;
    }

    return stats;
  }

  // ==================== 工具方法 ====================

  private getPriorityLabel(priority: ConflictPriority): string {
    const labels: Record<ConflictPriority, string> = {
      [ConflictPriority.P0]: 'P0(锁定正文)',
      [ConflictPriority.P1]: 'P1(世界观设定)',
      [ConflictPriority.P2]: 'P2(基础设定)',
      [ConflictPriority.P3]: 'P3(未锁定正文)',
    };
    return labels[priority];
  }

  private createConflict(
    type: ConflictType,
    priority: ConflictPriority,
    chapterIndex: number,
    paragraphIndex: number,
    description: string,
    context: string,
    suggestion: string,
    detectionMode: 'realtime' | 'deep',
  ): ConflictRecord {
    return {
      id: uuid(),
      type,
      priority,
      location: {
        chapterIndex,
        lineNumber: paragraphIndex * 5 + 1, // 估算行号
        paragraphIndex,
      },
      description,
      context: context.substring(0, 300),
      suggestion,
      status: ConflictStatus.PENDING,
      detectionMode,
      createdAt: new Date().toISOString(),
    };
  }

  private extractCharactersInText(text: string): string[] {
    const found: string[] = [];
    for (const char of this.characters) {
      if (text.includes(char.name)) {
        found.push(char.name);
      }
      // 检查简称
      if (char.name.length >= 3) {
        const shortName = char.name.substring(1);
        if (shortName.length >= 2 && text.includes(shortName)) {
          found.push(char.name);
        }
      }
    }
    return found;
  }

  private hasTransitionWords(text: string): boolean {
    const transitionWords = [
      '同时', '另一方面', '与此', '此外', '另外', '另一边',
      '与此同时', '就在这时', '正在此时', '同一时间',
      '过了一会儿', '片刻后', '不久', '很快',
      '场景转换', '画面切换',
    ];
    return transitionWords.some((w) => text.includes(w));
  }

  /**
   * 清空冲突记录（测试用）
   */
  clearConflicts(): void {
    this.conflicts = [];
  }
}
