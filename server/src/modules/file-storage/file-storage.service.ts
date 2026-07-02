/**
 * 文件存储服务
 * 章节原稿以 Markdown 文件存储，YAML front matter 包含元数据
 * 目录结构: projects/{projectId}/chapters/{vol}-{chapter}.md
 * 版本快照: projects/{projectId}/.novel/snapshots/
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ChapterFrontMatter {
  id: string;
  volume: number;
  chapter: number;
  title: string;
  status: string;
  wordCount: number;
  chapterFunction: string;
  goalArc: string;
  createdAt: string;
  updatedAt?: string;
  lockedAt?: string;
  checksum?: string;
  hookType?: string;
  transitionMode?: string;
}

@Injectable()
export class FileStorageService implements OnModuleInit {
  private baseDir: string;

  constructor() {
    this.baseDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  }

  onModuleInit() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * 获取项目目录
   */
  getProjectDir(projectId: string): string {
    const dir = path.join(this.baseDir, 'projects', projectId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * 获取章节目录
   */
  getChaptersDir(projectId: string): string {
    const dir = path.join(this.getProjectDir(projectId), 'chapters');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * 获取快照目录
   */
  getSnapshotsDir(projectId: string): string {
    const dir = path.join(this.getProjectDir(projectId), '.novel', 'snapshots');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * 同步世界观到可读 Markdown 文件
   */
  syncWorldBuilding(projectId: string, data: Record<string, any>): string {
    const content = `# 世界观设定\n\n> 自动生成于 ${new Date().toISOString()}\n\n---\n\n${Object.entries(data).map(([category, items]) => {
      const arr = Array.isArray(items) ? items : [items];
      return `## ${category}\n\n${arr.map((item: any) => `### ${item.name || item.title || '未命名'}\n${item.description || item.desc || ''}\n${item.detail ? `- 详情: ${item.detail}\n` : ''}${item.leader ? `- 领袖: ${item.leader}\n` : ''}`).join('\n')}`;
    }).join('\n\n')}`;

    const filePath = path.join(this.getProjectDir(projectId), 'world-building.md');
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * 同步角色卡到可读 Markdown 文件
   */
  syncCharacters(projectId: string, characters: any[]): string {
    const content = `# 角色设定\n\n> 自动生成于 ${new Date().toISOString()}\n\n---\n\n${characters.map(c => `## ${c.name || '未命名角色'}\n\n- 身份: ${c.identity || '未知'}\n- 年龄: ${c.age || '未知'}\n- 性别: ${c.gender || '未知'}\n- 外貌: ${c.appearance || '未知'}\n- 背景: ${c.background || '未知'}\n\n### 五维图谱\n- 战力: ${c.personality?.combat || 0}/100\n- 智力: ${c.personality?.intelligence || 0}/100\n- 领导: ${c.personality?.leadership || 0}/100\n- 魅力: ${c.personality?.charisma || 0}/100\n- 意志: ${c.personality?.willpower || 0}/100\n\n### 人际关系\n${(c.relationships || []).map((r: any) => `- ${r.name || '未知'}（${r.type || '未知'}）: ${r.description || ''}`).join('\n')}\n\n### 弧光\n- 起点: ${c.arc?.from || '无'}\n- 终点: ${c.arc?.to || '无'}\n- 描述: ${c.arc?.description || '无'}\n`).join('\n---\n')}`;

    const filePath = path.join(this.getProjectDir(projectId), 'characters.md');
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * 生成章节文件路径
   */
  getChapterFilePath(projectId: string, volumeIndex: number, chapterIndex: number): string {
    const chaptersDir = this.getChaptersDir(projectId);
    return path.join(chaptersDir, `${volumeIndex}-${String(chapterIndex).padStart(4, '0')}.md`);
  }

  /**
   * 写入章节文件 (Markdown + YAML front matter)
   */
  writeChapter(
    projectId: string,
    frontMatter: ChapterFrontMatter,
    content: string,
  ): string {
    const filePath = this.getChapterFilePath(projectId, frontMatter.volume, frontMatter.chapter);

    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 生成 YAML front matter
    const yamlStr = yaml.dump(frontMatter, {
      indent: 2,
      lineWidth: -1,
      quotingType: "'",
      forceQuotes: false,
    });

    // 生成 checksum
    const checksum = this.simpleChecksum(content);
    frontMatter.checksum = checksum;

    // 写入文件
    const fileContent = `---\n${yamlStr}---\n\n${content}`;
    fs.writeFileSync(filePath, fileContent, 'utf-8');

    return filePath;
  }

  /**
   * 读取章节文件
   */
  readChapter(projectId: string, volumeIndex: number, chapterIndex: number): {
    frontMatter: ChapterFrontMatter;
    content: string;
  } | null {
    const filePath = this.getChapterFilePath(projectId, volumeIndex, chapterIndex);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');

    // 解析 YAML front matter
    const match = raw.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
    if (!match) {
      return {
        frontMatter: {} as ChapterFrontMatter,
        content: raw,
      };
    }

    const frontMatter = yaml.load(match[1]) as ChapterFrontMatter;
    const content = match[2];

    return { frontMatter, content };
  }

  /**
   * 删除章节文件
   */
  deleteChapter(projectId: string, volumeIndex: number, chapterIndex: number): boolean {
    const filePath = this.getChapterFilePath(projectId, volumeIndex, chapterIndex);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  /**
   * 创建版本快照
   */
  createSnapshot(
    projectId: string,
    chapterId: string,
    volumeIndex: number,
    chapterIndex: number,
    content: string,
  ): string {
    const snapshotsDir = this.getSnapshotsDir(projectId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(
      snapshotsDir,
      `${volumeIndex}-${String(chapterIndex).padStart(4, '0')}-${timestamp}.md`,
    );

    const metadata = {
      chapterId,
      volumeIndex,
      chapterIndex,
      timestamp: new Date().toISOString(),
      checksum: this.simpleChecksum(content),
    };

    const yamlStr = yaml.dump(metadata, { indent: 2, lineWidth: -1 });
    const fileContent = `---\n${yamlStr}---\n\n${content}`;

    fs.writeFileSync(snapshotPath, fileContent, 'utf-8');
    return snapshotPath;
  }

  /**
   * 获取快照列表
   */
  getSnapshots(projectId: string, volumeIndex: number, chapterIndex: number): string[] {
    const snapshotsDir = this.getSnapshotsDir(projectId);
    if (!fs.existsSync(snapshotsDir)) {
      return [];
    }

    const prefix = `${volumeIndex}-${String(chapterIndex).padStart(4, '0')}-`;
    return fs
      .readdirSync(snapshotsDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
      .map((f) => path.join(snapshotsDir, f));
  }

  /**
   * 恢复快照
   */
  restoreSnapshot(snapshotPath: string): { content: string; metadata: any } | null {
    if (!fs.existsSync(snapshotPath)) {
      return null;
    }

    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);

    if (!match) {
      return { content: raw, metadata: {} };
    }

    return {
      metadata: yaml.load(match[1]),
      content: match[2],
    };
  }

  /**
   * 列出项目所有章节文件
   */
  listChapterFiles(projectId: string): { volumeIndex: number; chapterIndex: number; filePath: string }[] {
    const chaptersDir = this.getChaptersDir(projectId);
    if (!fs.existsSync(chaptersDir)) {
      return [];
    }

    const files = fs.readdirSync(chaptersDir).filter((f) => f.endsWith('.md'));

    return files
      .map((f) => {
        const match = f.match(/^(\d+)-(\d+)\.md$/);
        if (!match) return null;
        return {
          volumeIndex: parseInt(match[1], 10),
          chapterIndex: parseInt(match[2], 10),
          filePath: path.join(chaptersDir, f),
        };
      })
      .filter(Boolean) as { volumeIndex: number; chapterIndex: number; filePath: string }[];
  }

  /**
   * 校验文件完整性
   */
  verifyIntegrity(projectId: string, volumeIndex: number, chapterIndex: number): boolean {
    const result = this.readChapter(projectId, volumeIndex, chapterIndex);
    if (!result) return false;

    const expectedChecksum = result.frontMatter.checksum;
    if (!expectedChecksum) return true; // 无校验和不验证

    const computed = this.simpleChecksum(result.content);
    return expectedChecksum === computed;
  }

  /**
   * 简单的校验和算法
   */
  private simpleChecksum(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(16);
  }
}
