/**
 * 版权检测
 * 标题/内容/角色名相似度检测 + 平台检索
 */
import { Injectable } from '@nestjs/common';
import type { CopyrightMatch } from './dto/refinement.dto';
import { KNOWN_WORKS, PLATFORM_NAMES, type KnownWork, type Platform } from './known-works.data';

export interface CheckResult {
  risk: 'high' | 'medium' | 'low';
  matches: CopyrightMatch[];
  suggestions: string[];
}

@Injectable()
export class CopyrightCheckService {
  /**
   * 200+ 知名网络作品库（从数据文件导入）
   */
  private readonly knownWorks: KnownWork[] = KNOWN_WORKS;

  /**
   * 用户自定义黑名单（违规标题/内容）
   */
  private blacklist: string[] = [];

  /**
   * 常见套路白名单（不应触发警告）
   */
  private whitelist: string[] = [
    '穿越', '重生', '系统流', '无敌流', '扮猪吃老虎',
    '退婚流', '天才流', '废柴流', '升级打怪', '后宫',
    '种田', '学霸', '豪门', '娱乐圈', '电竞',
    '星际', '末世', '末日', '盗墓', '悬疑推理',
    '欢喜冤家', '先婚后爱', '破镜重圆', '契约婚姻',
    '青梅竹马', '姐弟恋', '师生恋', '替身文学',
  ];

  // ==================== 平台检索 ====================

  /**
   * 按平台搜索作品
   */
  searchByPlatform(platform: string): KnownWork[] {
    return this.knownWorks.filter((w) => w.platform === platform);
  }

  /**
   * 按关键词搜索作品
   */
  searchByKeyword(keyword: string): KnownWork[] {
    const lowerKw = keyword.toLowerCase();
    return this.knownWorks.filter(
      (w) =>
        w.keywords.some((k) => k.includes(lowerKw) || lowerKw.includes(k)) ||
        w.title.includes(lowerKw) ||
        w.author.includes(lowerKw),
    );
  }

  /**
   * 按角色名搜索作品（返回匹配的角色名及相似度）
   */
  searchByCharacter(characterName: string): { work: KnownWork; similarity: number }[] {
    const results: { work: KnownWork; similarity: number }[] = [];
    for (const work of this.knownWorks) {
      for (const knownChar of work.characters) {
        const similarity = this.calculateStringSimilarity(characterName, knownChar);
        if (similarity > 0.5) {
          results.push({ work, similarity: Math.round(similarity * 100) });
          break; // 每个作品只匹配一次
        }
      }
    }
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * 获取平台列表（含中文名）
   */
  getPlatforms(): Array<{ id: Platform; name: string; count: number }> {
    const countMap = new Map<Platform, number>();
    for (const w of this.knownWorks) {
      countMap.set(w.platform, (countMap.get(w.platform) || 0) + 1);
    }
    return Object.entries(PLATFORM_NAMES).map(([id, name]) => ({
      id: id as Platform,
      name,
      count: countMap.get(id as Platform) || 0,
    }));
  }

  // ==================== 原有方法保持不变 ====================

  /**
   * 添加到用户黑名单
   */
  addToBlacklist(title: string): void {
    if (!this.blacklist.includes(title)) {
      this.blacklist.push(title);
    }
  }

  /**
   * 从用户黑名单移除
   */
  removeFromBlacklist(title: string): void {
    this.blacklist = this.blacklist.filter((t) => t !== title);
  }

  /**
   * 添加到白名单
   */
  addToWhitelist(term: string): void {
    if (!this.whitelist.includes(term)) {
      this.whitelist.push(term);
    }
  }

  /**
   * 从白名单移除
   */
  removeFromWhitelist(term: string): void {
    this.whitelist = this.whitelist.filter((t) => t !== term);
  }

  /**
   * 检查是否在白名单中
   */
  isInWhitelist(text: string): boolean {
    return this.whitelist.some((term) => text.includes(term));
  }

  /**
   * 检查是否在黑名单中
   */
  isInBlacklist(text: string): boolean {
    return this.blacklist.some((term) => text.includes(term));
  }

  /**
   * 全量版权检测
   */
  checkFull(
    content: string,
    title?: string,
    characterNames?: string[],
  ): CheckResult {
    const matches: CopyrightMatch[] = [];
    const suggestions: string[] = [];

    // 黑名单检测
    if (title && this.isInBlacklist(title)) {
      matches.push({
        type: 'title',
        risk: 'high',
        matchedItem: title,
        similarity: 100,
        source: '用户自定义黑名单',
        suggestion: `"${title}"已被加入黑名单，建议修改`,
      });
    }

    // 标题检测
    if (title) {
      const titleMatches = this.checkTitle(title);
      matches.push(...titleMatches);
    }

    // 内容指纹检测
    const contentMatches = this.checkContent(content);
    matches.push(...contentMatches);

    // 角色名检测
    if (characterNames && characterNames.length > 0) {
      const charMatches = this.checkCharacters(characterNames);
      matches.push(...charMatches);
    }

    // 风险评估
    const risk = this.assessRisk(matches);

    // 生成建议
    if (matches.length > 0) {
      for (const match of matches) {
        if (match.risk === 'high') {
          suggestions.push(`"${match.matchedItem}"与已知作品高度相似，建议修改`);
        } else if (match.risk === 'medium') {
          suggestions.push(`"${match.matchedItem}"与已知作品相似，建议确认是否需要修改`);
        }
      }
    }

    if (matches.length === 0) {
      suggestions.push('未检测到明显的版权风险');
    }

    return { risk, matches, suggestions };
  }

  /**
   * 标题相似度检测
   */
  checkTitle(title: string): CopyrightMatch[] {
    const matches: CopyrightMatch[] = [];

    // 白名单检查：常见套路标签不触发版权警告
    if (this.isInWhitelist(title)) {
      return matches;
    }

    for (const work of this.knownWorks) {
      const similarity = this.calculateStringSimilarity(title, work.title);
      if (similarity > 0.7) {
        const risk = similarity > 0.85 ? 'high' : similarity > 0.75 ? 'medium' : 'low';
        matches.push({
          type: 'title',
          risk,
          matchedItem: work.title,
          similarity: Math.round(similarity * 100),
          source: work.author,
          suggestion: `与《${work.title}》(作者: ${work.author})标题相似度${Math.round(similarity * 100)}%`,
        });
      }
    }

    return matches;
  }

  /**
   * 内容指纹检测 (sha256 chunk比较)
   */
  checkContent(content: string): CopyrightMatch[] {
    const matches: CopyrightMatch[] = [];
    const chunkSize = 50; // 字符块大小

    // 将内容切分为chunk并计算简易指纹
    const contentChunks = this.generateFingerprintChunks(content, chunkSize);

    for (const work of this.knownWorks) {
      let matchCount = 0;
      const totalChunks = contentChunks.length;

      for (const fingerprint of work.contentFingerprints) {
        for (const chunk of contentChunks) {
          // 模拟sha256比较
          if (this.simpleFingerprintCompare(chunk, fingerprint)) {
            matchCount++;
          }
        }
      }

      if (matchCount > 0) {
        const ratio = matchCount / Math.max(1, totalChunks);
        const risk = ratio > 0.1 ? 'high' : ratio > 0.05 ? 'medium' : 'low';
        matches.push({
          type: 'content',
          risk,
          matchedItem: `《${work.title}》内容片段`,
          similarity: Math.round(ratio * 100),
          source: work.author,
          suggestion: `内容与《${work.title}》存在${Math.round(ratio * 100)}%片段相似`,
        });
      }
    }

    return matches;
  }

  /**
   * 角色名相似度检测
   */
  checkCharacters(characterNames: string[]): CopyrightMatch[] {
    const matches: CopyrightMatch[] = [];

    for (const name of characterNames) {
      for (const work of this.knownWorks) {
        for (const knownChar of work.characters) {
          const similarity = this.calculateStringSimilarity(name, knownChar);
          if (similarity > 0.6) {
            const risk = similarity > 0.85 ? 'high' : similarity > 0.7 ? 'medium' : 'low';
            matches.push({
              type: 'character',
              risk,
              matchedItem: knownChar,
              similarity: Math.round(similarity * 100),
              source: `《${work.title}》`,
              suggestion: `角色名"${name}"与《${work.title}》中的"${knownChar}"相似度${Math.round(similarity * 100)}%`,
            });
          }
        }
      }
    }

    return matches;
  }

  /**
   * 字符串相似度计算 (Levenshtein距离)
   */
  private calculateStringSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    const aChars = [...a];
    const bChars = [...b];
    const m = aChars.length;
    const n = bChars.length;

    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = aChars[i - 1] === bChars[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    const maxLen = Math.max(m, n);
    return 1 - dp[m][n] / maxLen;
  }

  /**
   * 生成内容指纹块
   */
  private generateFingerprintChunks(content: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 简易指纹比较
   */
  private simpleFingerprintCompare(chunk: string, fingerprint: string): boolean {
    // 模拟sha256比较: 使用简化哈希
    const hash = this.simpleHash(chunk);
    return hash === fingerprint;
  }

  /**
   * 简易哈希(非加密)
   */
  private simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `sha256_sim_${Math.abs(hash).toString(16)}`;
  }

  /**
   * 风险评估
   */
  private assessRisk(matches: CopyrightMatch[]): 'high' | 'medium' | 'low' {
    if (matches.length === 0) return 'low';

    const highCount = matches.filter((m) => m.risk === 'high').length;
    const mediumCount = matches.filter((m) => m.risk === 'medium').length;

    if (highCount >= 2) return 'high';
    if (highCount === 1 || mediumCount >= 2) return 'medium';
    return 'low';
  }
}
