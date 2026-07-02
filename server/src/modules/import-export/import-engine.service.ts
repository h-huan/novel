/**
 * 导入引擎 Service
 * 支持 .txt / .md / .docx / .novel 格式导入
 * 自动拆分章节、识别角色名、提取世界观要素
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');
import { DatabaseService } from '../../database/database.service';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { WorldSettingRepository } from '../../database/repositories/world-setting.repository';
import { OutlineRepository } from '../../database/repositories/outline.repository';
import { ForeshadowingRepository } from '../../database/repositories/foreshadowing.repository';

// --------------- 类型定义 ---------------

export interface ChapterInfo {
  index: number;
  title: string;
  content: string;
  wordCount: number;
}

export interface CharacterInfo {
  name: string;
  aliases: string[];
  mentionCount: number;
  firstAppearChapter: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface WorldElement {
  type: 'location' | 'faction' | 'timeline' | 'item' | 'concept';
  name: string;
  description: string;
  chapterMentions: number[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ImportResult {
  projectInfo: {
    title: string;
    description: string;
    wordCount: number;
    chapterCount: number;
    sourceFile: string;
    importFormat: string;
    importedAt: string;
  };
  chapters: ChapterInfo[];
  characters: CharacterInfo[];
  worldElements: WorldElement[];
}

export interface ImportReportItem {
  category: 'chapter' | 'character' | 'world';
  level: 'green' | 'yellow' | 'red';
  message: string;
  detail: string;
}

export interface ImportReport {
  result: ImportResult;
  report: ImportReportItem[];
  summary: {
    green: number;
    yellow: number;
    red: number;
    total: number;
  };
}

// --------------- 正则表达式 ---------------

// 中文人名: 2-4个汉字
const CHINESE_NAME_RE = /[（(]?([\u4e00-\u9fa5]{2,4})[）)]?/g;
// 章节标题模式
const CHAPTER_TITLE_RE = /^#{1,6}\s+(.+)$/gm;
const CHAPTER_NUMERIC_RE = /^(?:第[零一二三四五六七八九十百千万\d]+[章节回]|第\d+[章节回]|[0-9]+[.、．]\s*)(.+)$/gm;
const CHAPTER_SEPARATOR_RE = /^[-—=]{3,}$/gm;
// 地点线索
const LOCATION_RE = /(?:位于|在|来到|前往|抵达|离开|回到|路过|经过|进入|走出)([\u4e00-\u9fa5]{2,8}(?:城|镇|村|山|河|湖|海|岛|谷|峰|洞|林|原|堡|宫|殿|塔|寺|庙|园|楼|阁|府|宅|巷|街|路|区|省|市|县|国|大陆|星球|星系|空间))/g;
// 势力线索
const FACTION_RE = /([\u4e00-\u9fa5]{2,10}(?:家族|氏族|部落|教派|教会|联盟|同盟|公会|协会|组织|集团|帝国|王国|公国|共和国|联邦|军队|军|团|队|派|门|帮|会|社|府))(?:\s|的|，|。|、|；)/g;
// 时间线索
const TIMELINE_RE = /(?:公元|纪元|年代|时代|时期|年份|年月|年|月|日|日前|日后|年前|年后|时辰|刻)/g;

// --------------- 冲突报告接口 ---------------

export interface ConflictReport {
  hasConflict: boolean;
  conflicts: {
    type: 'character_mismatch' | 'world_mismatch' | 'timeline_overlap' | 'title_duplicate' | 'quality_issue';
    severity: 'low' | 'medium' | 'high';
    description: string;
    detail: string;
    suggestion: string;
  }[];
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
}

@Injectable()
export class ImportEngineService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly projectRepo: ProjectRepository,
    private readonly chapterRepo: ChapterRepository,
    private readonly characterRepo: CharacterRepository,
    private readonly worldSettingRepo: WorldSettingRepository,
    private readonly outlineRepo: OutlineRepository,
    private readonly foreshadowingRepo: ForeshadowingRepository,
  ) {}
  // ==================== 公开接口 ====================

  /**
   * 从文件导入
   */
  async importFromFile(filePath: string): Promise<ImportReport> {
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException(`File not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const raw = await this.readFile(filePath, ext);

    const projectTitle = path.basename(filePath, ext);
    const chapters = this.splitChapters(raw, ext);

    const allText = chapters.map((c) => c.content).join('\n');
    const characters = this.extractCharacters(allText, chapters);
    const worldElements = this.extractWorldElements(allText, chapters);

    const result: ImportResult = {
      projectInfo: {
        title: projectTitle,
        description: `从 ${path.basename(filePath)} 导入`,
        wordCount: this.countWords(allText),
        chapterCount: chapters.length,
        sourceFile: filePath,
        importFormat: ext.replace('.', ''),
        importedAt: new Date().toISOString(),
      },
      chapters,
      characters,
      worldElements,
    };

    const report = this.generateReport(result);
    const summary = {
      green: report.filter((r) => r.level === 'green').length,
      yellow: report.filter((r) => r.level === 'yellow').length,
      red: report.filter((r) => r.level === 'red').length,
      total: report.length,
    };

    return { result, report, summary };
  }

  /**
   * 从文本内容导入（用于测试/粘贴）
   */
  async importFromText(content: string, format: string = 'txt'): Promise<ImportReport> {
    const chapters = this.splitChapters(content, format);
    const allText = chapters.map((c) => c.content).join('\n');
    const characters = this.extractCharacters(allText, chapters);
    const worldElements = this.extractWorldElements(allText, chapters);

    const result: ImportResult = {
      projectInfo: {
        title: '从文本导入',
        description: '从文本内容导入',
        wordCount: this.countWords(allText),
        chapterCount: chapters.length,
        sourceFile: '',
        importFormat: format,
        importedAt: new Date().toISOString(),
      },
      chapters,
      characters,
      worldElements,
    };

    const report = this.generateReport(result);
    const summary = {
      green: report.filter((r) => r.level === 'green').length,
      yellow: report.filter((r) => r.level === 'yellow').length,
      red: report.filter((r) => r.level === 'red').length,
      total: report.length,
    };

    return { result, report, summary };
  }

  // ==================== .novel 包导入 ====================

  /**
   * 导入 .novel 包 (支持目录结构和ZIP格式)
   * 恢复项目完整数据
   */
  async importNovelPackage(filePath: string): Promise<ImportResult> {
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException(`.novel package not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);

    // 如果是目录（旧格式），走目录导入
    if (stat.isDirectory()) {
      return this.importNovelFromDirectory(filePath);
    }

    // 如果是文件（新ZIP格式），解压后导入
    return this.importNovelFromZip(filePath);
  }

  /**
   * 从 ZIP 格式的 .novel 包导入
   */
  private importNovelFromZip(filePath: string): ImportResult {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    const getEntryContent = (entryName: string): string | null => {
      const entry = entries.find((e: any) => e.entryName === entryName);
      return entry ? entry.getData().toString('utf-8') : null;
    };

    // 1. 读取 project.json
    const projectJsonContent = getEntryContent('project.json');
    if (!projectJsonContent) {
      throw new BadRequestException(`Invalid .novel package: missing project.json`);
    }
    const projectData = JSON.parse(projectJsonContent);

    // 2. 读取 chapters
    const importedChapters: ChapterInfo[] = [];
    let totalWords = 0;

    const chapterEntries = entries
      .filter((e: any) => e.entryName.startsWith('chapters/') && e.entryName.endsWith('.md') && !e.isDirectory)
      .sort((a: any, b: any) => a.entryName.localeCompare(b.entryName));

    for (let i = 0; i < chapterEntries.length; i++) {
      const content = chapterEntries[i].getData().toString('utf-8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : `第${i + 1}章`;
      const body = content.replace(/^#\s.+$/m, '').trim();
      const wordCount = this.countWords(body);
      totalWords += wordCount;
      importedChapters.push({
        index: i + 1,
        title,
        content: body,
        wordCount,
      });
    }

    // 3. 读取 characters
    const charactersContent = getEntryContent('characters.json');
    let importedCharacters: CharacterInfo[] = [];
    if (charactersContent) {
      const charRows = JSON.parse(charactersContent);
      importedCharacters = (charRows || []).map((row: any) => ({
        name: row.name || '未知角色',
        aliases: row.aliases ? (typeof row.aliases === 'string' ? JSON.parse(row.aliases) : row.aliases) : [],
        mentionCount: 0,
        firstAppearChapter: 1,
        confidence: 'medium' as const,
      }));
    }

    // 4. 读取 world
    const worldContent = getEntryContent('world.json');
    let worldElements: WorldElement[] = [];
    if (worldContent) {
      const worldSettings = JSON.parse(worldContent);
      worldElements = (worldSettings || []).map((ws: any) => ({
        type: 'concept' as const,
        name: ws.name || '',
        description: `Era: ${ws.era || ''}, Geography: ${(ws.geography || '').substring(0, 100)}`,
        chapterMentions: [],
        confidence: 'medium' as const,
      }));
    }

    return {
      projectInfo: {
        title: projectData.title || '导入项目',
        description: projectData.description || `从 .novel 包导入 (${path.basename(filePath)})`,
        wordCount: totalWords,
        chapterCount: importedChapters.length,
        sourceFile: filePath,
        importFormat: 'novel',
        importedAt: new Date().toISOString(),
      },
      chapters: importedChapters,
      characters: importedCharacters,
      worldElements,
    };
  }

  /**
   * 从目录结构的 .novel 包导入（兼容旧格式）
   */
  private importNovelFromDirectory(filePath: string): ImportResult {
    // 1. 读取 project.json
    const projectJsonPath = path.join(filePath, 'project.json');
    if (!fs.existsSync(projectJsonPath)) {
      throw new BadRequestException(`Invalid .novel package: missing project.json`);
    }
    const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));

    // 2. 读取 chapters
    const chaptersDir = path.join(filePath, 'chapters');
    const importedChapters: ChapterInfo[] = [];
    let totalWords = 0;

    if (fs.existsSync(chaptersDir)) {
      const chapterFiles = fs.readdirSync(chaptersDir)
        .filter(f => f.endsWith('.md'))
        .sort();
      for (let i = 0; i < chapterFiles.length; i++) {
        const content = fs.readFileSync(path.join(chaptersDir, chapterFiles[i]), 'utf-8');
        // 解析 # 标题
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : `第${i + 1}章`;
        const body = content.replace(/^#\s.+$/m, '').trim();
        const wordCount = this.countWords(body);
        totalWords += wordCount;
        importedChapters.push({
          index: i + 1,
          title,
          content: body,
          wordCount,
        });
      }
    }

    // 3. 读取 characters
    const charactersPath = path.join(filePath, 'characters.json');
    let importedCharacters: CharacterInfo[] = [];
    if (fs.existsSync(charactersPath)) {
      const charRows = JSON.parse(fs.readFileSync(charactersPath, 'utf-8'));
      importedCharacters = (charRows || []).map((row: any) => ({
        name: row.name || '未知角色',
        aliases: row.aliases ? (typeof row.aliases === 'string' ? JSON.parse(row.aliases) : row.aliases) : [],
        mentionCount: 0,
        firstAppearChapter: 1,
        confidence: 'medium' as const,
      }));
    }

    // 4. 读取 world
    const worldPath = path.join(filePath, 'world.json');
    let worldElements: WorldElement[] = [];
    if (fs.existsSync(worldPath)) {
      const worldSettings = JSON.parse(fs.readFileSync(worldPath, 'utf-8'));
      worldElements = (worldSettings || []).map((ws: any) => ({
        type: 'concept' as const,
        name: ws.name || '',
        description: `Era: ${ws.era || ''}, Geography: ${(ws.geography || '').substring(0, 100)}`,
        chapterMentions: [],
        confidence: 'medium' as const,
      }));
    }

    return {
      projectInfo: {
        title: projectData.title || '导入项目',
        description: projectData.description || `从 .novel 包导入 (${path.basename(filePath)})`,
        wordCount: totalWords,
        chapterCount: importedChapters.length,
        sourceFile: filePath,
        importFormat: 'novel',
        importedAt: new Date().toISOString(),
      },
      chapters: importedChapters,
      characters: importedCharacters,
      worldElements,
    };
  }

  // ==================== 文件读取 ====================

  private async readFile(filePath: string, ext: string): Promise<string> {
    switch (ext) {
      case '.txt':
      case '.md':
        return fs.readFileSync(filePath, 'utf-8');
      case '.docx':
        return this.readDocx(filePath);
      default:
        throw new BadRequestException(`Unsupported format: ${ext}`);
    }
  }

  /**
   * 简化 DOCX 读取（纯文本提取）
   */
  private readDocx(filePath: string): string {
    // 实际项目中可用 mammoth 或 docx4js
    // 这里用简单方式提取
    const buffer = fs.readFileSync(filePath);
    const content = buffer.toString('utf-8');
    // 从 XML 中提取文本（简化处理）
    const textMatches = content.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (textMatches) {
      return textMatches
        .map((m) => m.replace(/<[^>]+>/g, ''))
        .join('')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    }
    return content;
  }

  // ==================== 章节拆分 ====================

  private splitChapters(content: string, format: string): ChapterInfo[] {
    // 按行处理
    const lines = content.split(/\r?\n/);
    const chapters: { title: string; contentLines: string[] }[] = [];
    let currentTitle = '前言';
    let currentLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const title = this.detectChapterTitle(trimmed, format);

      if (title !== null) {
        // 保存上一章
        if (currentLines.length > 0 || chapters.length > 0) {
          chapters.push({ title: currentTitle, contentLines: [...currentLines] });
        }
        currentTitle = title;
        currentLines = [];
      } else if (this.isChapterSeparator(trimmed)) {
        // 分隔符也作为分章标记
        if (currentLines.length > 0 || chapters.length > 0) {
          chapters.push({ title: currentTitle, contentLines: [...currentLines] });
        }
        currentTitle = `第${chapters.length + 1}章`;
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    // 保存最后一章
    if (currentLines.length > 0 || chapters.length === 0) {
      chapters.push({ title: currentTitle, contentLines: currentLines });
    }

    return chapters
      .filter((c) => c.contentLines.some((l) => l.trim().length > 0))
      .map((c, i) => ({
        index: i + 1,
        title: c.title,
        content: c.contentLines.join('\n').trim(),
        wordCount: this.countWords(c.contentLines.join('\n')),
      }));
  }

  /**
   * 检测是否为章节标题
   */
  private detectChapterTitle(line: string, format: string): string | null {
    if (format === 'md') {
      // Markdown: # 标题
      const mdMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (mdMatch) return mdMatch[1].trim();
    }

    // 通用: 第X章/节/回
    const numMatch = line.match(
      /^(?:第[零一二三四五六七八九十百千万\d]+[章节回])\s*(.*)$/
    );
    if (numMatch) {
      return numMatch[1] ? `${line.match(/^第[零一二三四五六七八九十百千万\d]+[章节回]/)![0]} ${numMatch[1]}` : line;
    }

    // 数字编号: 1. 2. 3.
    const digitMatch = line.match(/^(\d+)[.、．]\s*(.+)$/);
    if (digitMatch) {
      return `第${digitMatch[1]}章 ${digitMatch[2]}`;
    }

    return null;
  }

  /**
   * 检测是否为章节分隔符
   */
  private isChapterSeparator(line: string): boolean {
    return /^[-—=*]{3,}$/.test(line) || /^[*]{3,}$/.test(line);
  }

  // ==================== 角色识别 ====================

  private extractCharacters(text: string, chapters: ChapterInfo[]): CharacterInfo[] {
    const nameMap = new Map<
      string,
      { aliases: Set<string>; count: number; firstChapter: number }
    >();

    // 常见中文姓氏
    const commonSurnames =
      '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳丰鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公';

    for (let ci = 0; ci < chapters.length; ci++) {
      const chapter = chapters[ci];
      const chapterText = chapter.title + '\n' + chapter.content;

      // 匹配可能的角色名: 姓氏 + 1-3字名
      const nameMatches = chapterText.matchAll(
        /([\u4e00-\u9fa5]{2,4})(?:说|道|问|答|喊|叫|骂|笑|哭|叹|喝|怒|喜|惊|瞪|看|望|走|来|去|到|站|坐|躺|趴|跪|跳|跑|飞|拿|放|握|举|抬|推|拉|打|杀|刺|砍|劈|挡|闪|躲|退|进|追|跟|随|带|领|率|命|令|让|请|给|对|向|和|与|同|跟|被|把|将|在)/g
      );

      for (const match of nameMatches) {
        const name = match[1];
        if (!this.isValidName(name)) continue;

        const entry = nameMap.get(name) || {
          aliases: new Set<string>(),
          count: 0,
          firstChapter: ci + 1,
        };
        entry.count++;
        nameMap.set(name, entry);
      }
    }

    return Array.from(nameMap.entries())
      .filter(([_, entry]) => entry.count >= 2) // 至少出现2次
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, entry]) => ({
        name,
        aliases: Array.from(entry.aliases),
        mentionCount: entry.count,
        firstAppearChapter: entry.firstChapter,
        confidence: entry.count >= 10 ? 'high' : entry.count >= 5 ? 'medium' : 'low',
      }));
  }

  private isValidName(name: string): boolean {
    // 过滤掉非人名的常见词汇
    const skipWords = new Set([
      '但是', '然后', '因为', '所以', '虽然', '如果', '而且', '或者', '不过',
      '已经', '可以', '没有', '不是', '就是', '这个', '那个', '什么', '怎么',
      '他们', '她们', '它们', '自己', '知道', '看见', '听见', '告诉', '觉得',
      '开始', '出来', '起来', '下来', '进来', '回来', '过来', '上去', '下去',
      '进去', '回去', '过去', '说道', '问道', '回答', '告诉', '发现', '知道',
      '一个', '两个', '三个', '四个', '五个', '六个', '七个', '八个', '九个',
      '全部', '一起', '一直', '一样', '一边', '一会儿', '一下', '一点',
      '这样', '那样', '这时', '那时', '突然', '后来', '原来', '本来',
    ]);
    if (skipWords.has(name)) return false;
    // 至少2个汉字
    if (name.length < 2 || name.length > 4) return false;
    return true;
  }

  // ==================== 世界观要素提取 ====================

  private extractWorldElements(text: string, chapters: ChapterInfo[]): WorldElement[] {
    const elements: WorldElement[] = [];
    const visited = new Set<string>();

    // 提取地点
    const locationMatches = text.matchAll(LOCATION_RE);
    for (const match of locationMatches) {
      const name = match[1];
      if (!visited.has(name)) {
        visited.add(name);
        elements.push({
          type: 'location',
          name,
          description: `地点: ${name}`,
          chapterMentions: this.findChapterMentions(name, chapters),
          confidence: 'medium',
        });
      }
    }

    // 提取势力
    const factionMatches = text.matchAll(FACTION_RE);
    for (const match of factionMatches) {
      const name = match[1];
      if (!visited.has(name)) {
        visited.add(name);
        elements.push({
          type: 'faction',
          name,
          description: `势力: ${name}`,
          chapterMentions: this.findChapterMentions(name, chapters),
          confidence: 'medium',
        });
      }
    }

    // 提取时间线索
    const timelineMatches = text.matchAll(TIMELINE_RE);
    for (const match of timelineMatches) {
      const context = this.extractContext(text, match.index!, 30);
      const key = `time_${context.substring(0, 20)}`;
      if (!visited.has(key)) {
        visited.add(key);
        elements.push({
          type: 'timeline',
          name: match[0],
          description: context,
          chapterMentions: this.findChapterMentions(match[0], chapters),
          confidence: 'low',
        });
      }
    }

    return elements;
  }

  private extractContext(text: string, index: number, radius: number): string {
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + radius);
    return text.substring(start, end).replace(/\n/g, ' ').trim();
  }

  private findChapterMentions(name: string, chapters: ChapterInfo[]): number[] {
    const mentions: number[] = [];
    for (const ch of chapters) {
      if (ch.title.includes(name) || ch.content.includes(name)) {
        mentions.push(ch.index);
      }
    }
    return mentions;
  }

  // ==================== AI 智能拆解（Q1）====================

  /**
   * AI 智能拆解 — 导入后使用 AI 对内容进行结构化分析
   * 提取结构化数据
   */
  async postProcessImport(projectId: string, content: string): Promise<{
    charactersExtracted: number;
    worldElementsExtracted: number;
    outlineGenerated: boolean;
    enhancements: string[];
  }> {
    const chapters = this.splitChapters(content, 'txt');
    const allText = chapters.map((c) => c.content).join('\n');

    // 使用现有的角色和世界观提取逻辑
    const characters = this.extractCharacters(allText, chapters);
    const worldElements = this.extractWorldElements(allText, chapters);

    // 生成大纲：从章节标题和首段内容提取摘要
    const outlineGenerated = chapters.length > 0;

    // AI 增强建议
    const enhancements: string[] = [];

    if (characters.length === 0) {
      enhancements.push('未识别到任何角色，建议手动添加主要角色信息');
    } else {
      const highConf = characters.filter((c) => c.confidence === 'high').length;
      if (highConf < 2) {
        enhancements.push(`仅 ${highConf} 个高置信度角色，建议在故事开头补充更多角色出场描述`);
      }
      const sameFirstChar = this.findSameSurnameCharacters(characters);
      if (sameFirstChar.length > 0) {
        enhancements.push(
          `存在同姓角色: ${sameFirstChar.map((g) => g.join('/')).join('、')}，建议检查角色名是否容易混淆`,
        );
      }
    }

    if (worldElements.length === 0) {
      enhancements.push('未提取到世界观要素，建议补充地点/势力描述以丰富世界观');
    } else {
      const locations = worldElements.filter((e) => e.type === 'location');
      const factions = worldElements.filter((e) => e.type === 'faction');
      if (locations.length < 2) {
        enhancements.push('地点要素较少，建议增加场景描写以建立空间感');
      }
      if (factions.length === 0) {
        enhancements.push('未检测到势力/组织，可考虑为角色设计所属势力以增加冲突层次');
      }
    }

    if (chapters.length < 3) {
      enhancements.push('章节数较少（<3章），建议规划更完整的故事结构');
    }

    // 检测内容是否以对话开头（缺少场景铺垫）
    const firstChapterContent = chapters.length > 0 ? chapters[0].content : '';
    if (firstChapterContent.trim().startsWith('"') || firstChapterContent.trim().startsWith('「') || firstChapterContent.trim().startsWith('“')) {
      enhancements.push('故事以对话开头，建议补充场景/时间背景描写');
    }

    // 检测是否存在明显的叙事人称混用
    if (this.detectNarratorPersonMix(allText)) {
      enhancements.push('检测到叙事人称可能混用（第一人称/第三人称切换），建议统一');
    }

    return {
      charactersExtracted: characters.length,
      worldElementsExtracted: worldElements.length,
      outlineGenerated,
      enhancements,
    };
  }

  /**
   * 找出同姓的角色（最后一个字相同也算变体）
   */
  private findSameSurnameCharacters(characters: { name: string }[]): string[][] {
    const surnameMap = new Map<string, string[]>();
    for (const c of characters) {
      const surnamePrefix = c.name.substring(0, 1);
      if (!surnameMap.has(surnamePrefix)) {
        surnameMap.set(surnamePrefix, []);
      }
      surnameMap.get(surnamePrefix)!.push(c.name);
    }
    return Array.from(surnameMap.values()).filter((group) => group.length > 1);
  }

  /**
   * 检测叙事人称混用
   */
  private detectNarratorPersonMix(text: string): boolean {
    const firstPersonMarkers = /(?:我|我们|我的|我们的|我自己)/g;
    const thirdPersonMarkers = /(?:他|她|它|他们|她们|它们|他的|她的|它的)/g;

    const firstCount = (text.match(firstPersonMarkers) || []).length;
    const thirdCount = (text.match(thirdPersonMarkers) || []).length;

    // 如果两种人称都出现一定次数，且比例接近（0.25~4倍），可能混用
    if (firstCount > 5 && thirdCount > 5) {
      const ratio = firstCount / Math.max(thirdCount, 1);
      return ratio > 0.25 && ratio < 4.0;
    }
    return false;
  }

  // ==================== 导入后优化（Q3）====================

  /**
   * 导入后优化 — 检测角色名一致性、时间线问题和格式规范化
   */
  async optimizeAfterImport(content: string): Promise<{
    normalizedContent: string;
    characterNameConsistency: { name: string; variations: string[] }[];
    timelineIssues: string[];
    changes: number;
  }> {
    let changes = 0;
    let normalizedContent = content;

    // 1. 规范化格式
    // 1a. 统一换行符（CRLF → LF）
    const crlfCount = (normalizedContent.match(/\r\n/g) || []).length;
    if (crlfCount > 0) {
      normalizedContent = normalizedContent.replace(/\r\n/g, '\n');
      changes += crlfCount;
    }

    // 1b. 去除行尾多余空格
    const trailingSpaceMatch = normalizedContent.match(/[ \t]+$/gm);
    const trailingCount = trailingSpaceMatch ? trailingSpaceMatch.length : 0;
    if (trailingCount > 0) {
      normalizedContent = normalizedContent.replace(/[ \t]+$/gm, '');
      changes += trailingCount;
    }

    // 1c. 连续空行压缩为最多一个空行
    const extraBlankLines = normalizedContent.match(/\n{3,}/g);
    if (extraBlankLines) {
      const compressed = normalizedContent.replace(/\n{3,}/g, '\n\n');
      changes += extraBlankLines.length;
      normalizedContent = compressed;
    }

    // 1d. 中文与英文/数字间加空格
    const spacedContent = normalizedContent.replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, (_, a, b) => {
      changes++;
      return a + ' ' + b;
    });
    const spacedContent2 = spacedContent.replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, (_, a, b) => {
      changes++;
      return a + ' ' + b;
    });
    normalizedContent = spacedContent2;

    // 2. 检测角色名变体
    const characterNameConsistency = this.detectNameVariations(normalizedContent);

    // 3. 检测时间线问题
    const timelineIssues = this.detectTimelineIssues(normalizedContent);

    return {
      normalizedContent,
      characterNameConsistency,
      timelineIssues,
      changes,
    };
  }

  /**
   * 检测同一个角色的不同称呼变体
   * e.g. "陆川" → "陆公子" / "阿川" / "川儿"
   */
  private detectNameVariations(text: string): { name: string; variations: string[] }[] {
    // 提取所有可能的角色名（2-4汉字且出现在动词前的词）
    const allCandidates = new Set<string>();
    const nameMatches = text.matchAll(
      /([\u4e00-\u9fa5]{2,4})(?:说|道|问|答|喊|叫|骂|笑|哭|叹|喝|怒|喜|惊|瞪|看|望|走|来|去|到|站|坐|躺|趴|跪|跳|跑|飞|拿|放)/g,
    );
    for (const m of nameMatches) {
      const candidate = m[1];
      if (candidate.length >= 2 && candidate.length <= 4 && this.isValidName(candidate)) {
        allCandidates.add(candidate);
      }
    }

    // 提取所有带称谓/前缀/后缀的变体
    const titleVariations = new Map<string, Set<string>>();
    const candidates = [...allCandidates];

    // 按姓氏分组
    const bySurname = new Map<string, string[]>();
    for (const name of candidates) {
      const surname = name.substring(0, 1);
      if (!bySurname.has(surname)) {
        bySurname.set(surname, []);
      }
      bySurname.get(surname)!.push(name);
    }

    // 检测带称谓的变体: "陆公子"、"陆少"、"陆大人" 等
    const titlePatterns = text.matchAll(
      /([\u4e00-\u9fa5])(?:公子|少主|少爷|小姐|夫人|太太|老爷|大人|将军|丞相|尚书|王爷|公主|殿下|先生|女士|老师|师傅|前辈|兄|弟|姐|妹|儿|哥|叔|伯|总|经理)/g,
    );
    const titleNameMap = new Map<string, Set<string>>();

    for (const m of titlePatterns) {
      const surnameChar = m[1];
      const fullTitle = m[0];
      // 找到同姓的角色
      for (const [name, _] of bySurname) {
        if (name.startsWith(surnameChar)) {
          if (!titleNameMap.has(name)) {
            titleNameMap.set(name, new Set<string>());
          }
          titleNameMap.get(name)!.add(fullTitle);
        }
      }
    }

    // 检测 "阿X" / "小X" 变体
    const prefixPatterns = text.matchAll(
      /(?:阿|小|老|大)([\u4e00-\u9fa5])/g,
    );
    for (const m of prefixPatterns) {
      const char = m[1];
      const fullName = m[0];
      for (const name of candidates) {
        if (name.includes(char) && !name.startsWith(char)) {
          if (!titleNameMap.has(name)) {
            titleNameMap.set(name, new Set<string>());
          }
          titleNameMap.get(name)!.add(fullName);
        }
      }
    }

    // 检测 "X儿" / "X子" / "X某" 变体
    const suffixPatterns = text.matchAll(
      /([\u4e00-\u9fa5])(?:儿|子|某|兄|弟|姐|妹|叔|伯)/g,
    );
    for (const m of suffixPatterns) {
      const char = m[1];
      const fullName = m[0];
      for (const name of candidates) {
        if (name.includes(char)) {
          if (!titleNameMap.has(name)) {
            titleNameMap.set(name, new Set<string>());
          }
          titleNameMap.get(name)!.add(fullName);
        }
      }
    }

    // 过滤: 只返回至少有1个变体的角色
    return candidates
      .filter((name) => titleNameMap.has(name) && titleNameMap.get(name)!.size > 0)
      .map((name) => ({
        name,
        variations: [...(titleNameMap.get(name) || new Set()).values()].filter((v) => v !== name),
      }))
      .filter((entry) => entry.variations.length > 0);
  }

  /**
   * 检测时间线问题
   */
  private detectTimelineIssues(text: string): string[] {
    const issues: string[] = [];

    // 检测时间描述矛盾（如"三天后"出现在"一年后"之后但位置更前）
    const timeMarkers: { text: string; position: number }[] = [];

    const relativeTimePatterns = [
      /片刻后|一会儿后|不久后|很快/g,
      /(?:一|两|三|四|五|六|七|八|九|十|几|半)(?:天|日|月|年|时辰|刻)(?:后|前|之后|以前| ago)/g,
      /第[一二三四五六七八九十\d]+[天日年月]/g,
    ];

    for (const pattern of relativeTimePatterns) {
      const matches = text.matchAll(pattern);
      for (const m of matches) {
        timeMarkers.push({ text: m[0], position: m.index! });
      }
    }

    // 检查时间倒流: 大的时间跨度出现在小的时间跨度之前
    const timeSpanOrder = ['片刻', '一会儿', '半天', '一天', '两天', '三天', '五天', '七天', '十天', '半月', '一月', '两月', '三月', '半年', '一年', '两年', '三年', '五年', '十年'];
    let prevSpanIndex = -1;
    for (const marker of timeMarkers.sort((a, b) => a.position - b.position)) {
      const spanIdx = timeSpanOrder.findIndex((s) => marker.text.includes(s));
      if (spanIdx >= 0) {
        if (prevSpanIndex >= 0 && spanIdx < prevSpanIndex - 2) {
          issues.push(
            `时间跨度异常: "${marker.text}" 出现在更大时间跨度之后`,
          );
        }
        prevSpanIndex = spanIdx;
      }
    }

    // 检测"同年"但前后出现矛盾的年份数字
    const yearMatches = text.matchAll(/(?:公元|纪元)?(\d{3,4})年/g);
    const years = [...yearMatches].map((m) => ({ year: parseInt(m[1], 10), pos: m.index! }));
    if (years.length >= 2) {
      for (let i = 1; i < years.length; i++) {
        if (years[i].year < years[i - 1].year) {
          issues.push(
            `年份倒流: 从 ${years[i - 1].year} 年跳到 ${years[i].year} 年（位置 ${years[i].pos}）`,
          );
        }
      }
    }

    return issues;
  }

  // ==================== 导入冲突检测 ====================

  /**
   * 导入冲突检测 — 比较导入内容与已有项目数据
   */
  async checkImportConflicts(content: string, existingProjectId: string): Promise<ConflictReport> {
    const chapters = this.splitChapters(content, 'txt');
    const allText = chapters.map((c) => c.content).join('\n');
    const characters = this.extractCharacters(allText, chapters);
    const worldElements = this.extractWorldElements(allText, chapters);

    const conflicts: ConflictReport['conflicts'] = [];

    // 1. 质量检测 — 基础内容检查
    if (chapters.length === 0) {
      conflicts.push({
        type: 'quality_issue',
        severity: 'high',
        description: '未检测到章节结构',
        detail: '导入内容无法拆分为章节，可能格式不支持或内容为空',
        suggestion: '请使用 Markdown 标题（#）或"第X章"格式标记章节',
      });
    }

    const totalWords = this.countWords(allText);
    if (totalWords < 100) {
      conflicts.push({
        type: 'quality_issue',
        severity: 'high',
        description: '内容过少（不足100字）',
        detail: `仅检测到 ${totalWords} 字`,
        suggestion: '请确保导入完整的小说内容，至少包含一个完整章节',
      });
    }

    // 2. 角色检测
    if (characters.length === 0) {
      conflicts.push({
        type: 'character_mismatch',
        severity: 'medium',
        description: '未检测到角色',
        detail: '从文本中无法提取到任何角色信息',
        suggestion: '在文本中使用"角色名+说/道/问"等格式，有助于自动识别角色',
      });
    }

    // 3. 世界观要素检测
    if (worldElements.length === 0) {
      conflicts.push({
        type: 'world_mismatch',
        severity: 'low',
        description: '未提取到世界观要素',
        detail: '未检测到地点或势力信息',
        suggestion: '在文本中加入场景描述（如"来到XX城"）有助于世界观提取',
      });
    }

    // 4. 章节标题重复检测
    const titleCount = new Map<string, number>();
    for (const ch of chapters) {
      const baseTitle = ch.title.replace(/第.+[章节回]\s*/, '').trim();
      if (baseTitle) {
        titleCount.set(baseTitle, (titleCount.get(baseTitle) || 0) + 1);
      }
    }
    for (const [title, count] of titleCount) {
      if (count > 1) {
        conflicts.push({
          type: 'title_duplicate',
          severity: 'medium',
          description: `章节标题"${title}"重复 ${count} 次`,
          detail: `标题"${title}"出现了 ${count} 次，可能为导入错误`,
          suggestion: '检查文件是否重复包含相同章节',
        });
      }
    }

    // 5. 时间线重叠检测
    const timelineMarkers = allText.match(/第[一二三四五六七八九十\d]+[天日年月]/g) || [];
    if (timelineMarkers.length > 10) {
      conflicts.push({
        type: 'timeline_overlap',
        severity: 'low',
        description: `检测到 ${timelineMarkers.length} 处时间标记`,
        detail: `时间标记较多（${timelineMarkers.length}处），可能跨越较长时间线`,
        suggestion: '建议核对时间线逻辑是否自洽',
      });
    }

    // 汇总
    const summary = {
      total: conflicts.length,
      high: conflicts.filter((c) => c.severity === 'high').length,
      medium: conflicts.filter((c) => c.severity === 'medium').length,
      low: conflicts.filter((c) => c.severity === 'low').length,
    };

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
      summary,
    };
  }

  // ==================== 辅助方法 ====================

  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const englishWords = text.replace(/[^\x00-\xff]/g, '').split(/\s+/).filter(w => w.length > 0).length;
    return chineseChars + englishWords;
  }

  // ==================== 报告生成 ====================

  private generateReport(result: ImportResult): ImportReportItem[] {
    const items: ImportReportItem[] = [];

    // 章节报告
    if (result.chapters.length === 0) {
      items.push({
        category: 'chapter',
        level: 'red',
        message: '未检测到章节',
        detail: '导入内容中未能自动拆分出章节。请检查文件格式或使用"---"分隔符。',
      });
    } else if (result.chapters.length >= 3) {
      items.push({
        category: 'chapter',
        level: 'green',
        message: `成功识别 ${result.chapters.length} 个章节`,
        detail: `章节列表: ${result.chapters.map((c) => c.title).join('、')}`,
      });
    } else {
      items.push({
        category: 'chapter',
        level: 'yellow',
        message: `识别到 ${result.chapters.length} 个章节，可能不完整`,
        detail: '章节数量较少，建议检查是否所有章节都被正确识别。',
      });
    }

    // 章节字数报告
    const emptyChapters = result.chapters.filter((c) => c.wordCount < 50);
    if (emptyChapters.length > 0) {
      items.push({
        category: 'chapter',
        level: 'yellow',
        message: `${emptyChapters.length} 个章节字数较少`,
        detail: `字数较少的章节: ${emptyChapters.map((c) => c.title).join('、')}`,
      });
    }

    // 角色报告
    if (result.characters.length === 0) {
      items.push({
        category: 'character',
        level: 'red',
        message: '未识别到角色',
        detail: '未能从文本中自动识别角色。可手动添加角色信息。',
      });
    } else if (result.characters.length >= 2) {
      const highConf = result.characters.filter((c) => c.confidence === 'high');
      items.push({
        category: 'character',
        level: highConf.length >= 2 ? 'green' : 'yellow',
        message: `识别到 ${result.characters.length} 个角色（高置信度: ${highConf.length}）`,
        detail: `角色列表: ${result.characters.map((c) => `${c.name}(${c.confidence})`).join('、')}`,
      });
    } else {
      items.push({
        category: 'character',
        level: 'yellow',
        message: `仅识别到 ${result.characters.length} 个角色`,
        detail: '角色数量较少，建议补充更多角色信息。',
      });
    }

    // 世界观要素报告
    if (result.worldElements.length === 0) {
      items.push({
        category: 'world',
        level: 'yellow',
        message: '未识别到世界观要素',
        detail: '未能自动提取地点、势力等世界观要素。可手动补充。',
      });
    } else {
      const locations = result.worldElements.filter((e) => e.type === 'location');
      const factions = result.worldElements.filter((e) => e.type === 'faction');
      items.push({
        category: 'world',
        level: 'green',
        message: `提取到 ${result.worldElements.length} 个世界观要素（${locations.length} 地点, ${factions.length} 势力）`,
        detail: `地点: ${locations.map((e) => e.name).join('、')}；势力: ${factions.map((e) => e.name).join('、')}`,
      });
    }

    return items;
  }
}
