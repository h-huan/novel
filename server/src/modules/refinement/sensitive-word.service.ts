/**
 * 敏感词检测
 * 内置5类敏感词库，支持模糊匹配(拼音/谐音/形近字)和AI辅助上下文判断
 */
import { Injectable } from '@nestjs/common';
import type { SensitiveWord } from './dto/refinement.dto';

interface SensitiveEntry {
  word: string;
  category: 'political' | 'violence' | 'pornographic' | 'discrimination' | 'illegal';
  severity: 'high' | 'medium' | 'low';
  aliases: string[]; // 拼音/谐音/形近变体
  strategy: 'replace' | 'remove' | 'warn';
  replacement?: string;
}

/** O5: 全文同步替换的回调接口 */
export interface SyncCallbacks {
  onReplace?: (word: string, replacement: string, position: number) => void;
  onBatchComplete?: (changes: Array<{original: string; replacement: string}>) => void;
}

/** 替换历史条目 */
export interface ReplacementRecord {
  timestamp: string;
  original: string;
  replacements: Array<{ word: string; replacement: string; position: number }>;
}

@Injectable()
export class SensitiveWordService {
  /** 替换历史（内存存储，最长100条） */
  private readonly replacementHistory: ReplacementRecord[] = [];
  private static readonly MAX_HISTORY = 100;
  /**
   * 内置敏感词库
   */
  private readonly dictionary: SensitiveEntry[] = [
    // ─── 政治类 ───
    { word: '敏感政治词A', category: 'political', severity: 'high', aliases: ['mzqcA', '敏A'], strategy: 'replace', replacement: '***' },
    { word: '敏感政治词B', category: 'political', severity: 'high', aliases: ['mzqcB', '敏B'], strategy: 'replace', replacement: '***' },
    { word: '敏感政治词C', category: 'political', severity: 'high', aliases: ['mzqcC', '敏C'], strategy: 'replace', replacement: '***' },
    { word: '敏感政治词D', category: 'political', severity: 'high', aliases: [], strategy: 'replace', replacement: '***' },
    { word: '敏感政治词E', category: 'political', severity: 'medium', aliases: [], strategy: 'warn' },
    { word: '敏感政治词F', category: 'political', severity: 'medium', aliases: [], strategy: 'warn' },

    // ─── 暴力类 ───
    { word: '碎尸', category: 'violence', severity: 'high', aliases: ['suishishi'], strategy: 'replace', replacement: '**' },
    { word: '分尸', category: 'violence', severity: 'high', aliases: ['fenshi'], strategy: 'replace', replacement: '**' },
    { word: '凌迟', category: 'violence', severity: 'high', aliases: ['lingchi'], strategy: 'replace', replacement: '**' },
    { word: '挖眼', category: 'violence', severity: 'high', aliases: ['wayan'], strategy: 'replace', replacement: '**' },
    { word: '割喉', category: 'violence', severity: 'high', aliases: ['gehou'], strategy: 'replace', replacement: '**' },
    { word: '剥皮', category: 'violence', severity: 'high', aliases: ['baopi'], strategy: 'replace', replacement: '**' },
    { word: '肢解', category: 'violence', severity: 'high', aliases: ['zhijie'], strategy: 'replace', replacement: '**' },
    { word: '虐杀', category: 'violence', severity: 'high', aliases: ['nuesha'], strategy: 'replace', replacement: '**' },
    { word: '屠杀', category: 'violence', severity: 'medium', aliases: ['tusha'], strategy: 'warn' },
    { word: '血腥', category: 'violence', severity: 'medium', aliases: ['xuexing'], strategy: 'warn' },
    { word: '杀戮', category: 'violence', severity: 'medium', aliases: ['shalu'], strategy: 'warn' },
    { word: '残忍', category: 'violence', severity: 'low', aliases: ['canren'], strategy: 'warn' },

    // ─── 色情类 ───
    { word: '色情词A', category: 'pornographic', severity: 'high', aliases: ['seqingA', 'sqA'], strategy: 'replace', replacement: '***' },
    { word: '色情词B', category: 'pornographic', severity: 'high', aliases: ['seqingB', 'sqB'], strategy: 'replace', replacement: '***' },
    { word: '色情词C', category: 'pornographic', severity: 'high', aliases: ['seqingC', 'sqC'], strategy: 'replace', replacement: '***' },
    { word: '色情词D', category: 'pornographic', severity: 'high', aliases: [], strategy: 'replace', replacement: '***' },
    { word: '色情词E', category: 'pornographic', severity: 'high', aliases: [], strategy: 'replace', replacement: '***' },
    { word: '色情词F', category: 'pornographic', severity: 'medium', aliases: [], strategy: 'warn' },
    { word: '色情词G', category: 'pornographic', severity: 'medium', aliases: [], strategy: 'warn' },

    // ─── 歧视类 ───
    { word: '歧视词A', category: 'discrimination', severity: 'high', aliases: ['qishiA', 'qsA'], strategy: 'replace', replacement: '***' },
    { word: '歧视词B', category: 'discrimination', severity: 'high', aliases: ['qishiB', 'qsB'], strategy: 'replace', replacement: '***' },
    { word: '歧视词C', category: 'discrimination', severity: 'high', aliases: ['qishiC', 'qsC'], strategy: 'replace', replacement: '***' },
    { word: '歧视词D', category: 'discrimination', severity: 'medium', aliases: [], strategy: 'warn' },
    { word: '歧视词E', category: 'discrimination', severity: 'medium', aliases: [], strategy: 'warn' },
    { word: '歧视词F', category: 'discrimination', severity: 'low', aliases: [], strategy: 'warn' },

    // ─── 违法类 ───
    { word: '贩毒', category: 'illegal', severity: 'high', aliases: ['fandu', 'fd'], strategy: 'replace', replacement: '**' },
    { word: '制毒', category: 'illegal', severity: 'high', aliases: ['zhidu', 'zd'], strategy: 'replace', replacement: '**' },
    { word: '吸毒', category: 'illegal', severity: 'high', aliases: ['xidu', 'xd'], strategy: 'replace', replacement: '**' },
    { word: '赌博', category: 'illegal', severity: 'medium', aliases: ['dubo', 'db'], strategy: 'warn' },
    { word: '洗钱', category: 'illegal', severity: 'high', aliases: ['xiqian', 'xq'], strategy: 'replace', replacement: '**' },
    { word: '诈骗', category: 'illegal', severity: 'medium', aliases: ['zhapian', 'zp'], strategy: 'warn' },
    { word: '走私', category: 'illegal', severity: 'high', aliases: ['zousi', 'zs'], strategy: 'replace', replacement: '**' },
    { word: '贿赂', category: 'illegal', severity: 'high', aliases: ['huilu', 'hl'], strategy: 'replace', replacement: '**' },
    { word: '偷税', category: 'illegal', severity: 'medium', aliases: ['toushui', 'ts'], strategy: 'warn' },
    { word: '漏税', category: 'illegal', severity: 'medium', aliases: ['loushui', 'ls'], strategy: 'warn' },
    { word: '伪造', category: 'illegal', severity: 'medium', aliases: ['weizao', 'wz'], strategy: 'warn' },
    { word: '非法', category: 'illegal', severity: 'low', aliases: ['feifa', 'ff'], strategy: 'warn' },
  ];

  /**
   * 形近字映射表
   */
  private readonly similarChars: Record<string, string[]> = {
    '敏': ['每', '梅', '酶'],
    '政': ['正', '整', '证'],
    '色': ['包', '巴', '仓'],
    '赌': ['堵', '睹', '都'],
    '毒': ['独', '读', '犊'],
    '骗': ['偏', '翩', '扁'],
    '贿': ['汇', '彗', '慧'],
    '赂': ['路', '露', '洛'],
    '暴': ['爆', '瀑', '曝'],
    '虐': ['疟', '略', '掠'],
    '杀': ['刹', '沙', '纱'],
  };

  // ==================== 替换历史管理 ====================

  /**
   * 记录一次替换操作到历史
   */
  recordReplacement(original: string, replacements: Array<{ word: string; replacement: string; position: number }>): void {
    this.replacementHistory.push({
      timestamp: new Date().toISOString(),
      original,
      replacements,
    });
    // 自动修剪超过100条
    while (this.replacementHistory.length > SensitiveWordService.MAX_HISTORY) {
      this.replacementHistory.shift();
    }
  }

  /**
   * 获取替换历史记录
   * @param limit 可选限制返回条数
   */
  getReplacementHistory(limit?: number): ReplacementRecord[] {
    const records = [...this.replacementHistory].reverse();
    return limit ? records.slice(0, limit) : records;
  }

  /**
   * 撤销最后一次替换
   * 返回被撤销的原文，如果无历史记录则返回 null
   */
  undoLastReplacement(): { original: string; success: boolean } | null {
    if (this.replacementHistory.length === 0) {
      return null;
    }
    const lastRecord = this.replacementHistory.pop()!;
    return {
      original: lastRecord.original,
      success: true,
    };
  }

  getCategories(): string[] {
    return ['political', 'violence', 'pornographic', 'discrimination', 'illegal'];
  }

  /**
   * 敏感词检测
   */
  check(
    content: string,
    level: string = 'moderate',
    categories?: string[],
  ): SensitiveWord[] {
    const results: SensitiveWord[] = [];
    const seen = new Set<string>();

    const targetCategories = categories || this.getCategories();
    const effectiveLevel = level;

    for (const entry of this.dictionary) {
      if (!targetCategories.includes(entry.category)) continue;

      // 根据检测级别过滤
      if (effectiveLevel === 'lenient' && entry.severity === 'low') continue;
      if (effectiveLevel === 'moderate' && entry.category === 'political' && entry.severity === 'low') continue;

      // 直接匹配
      this.findMatches(content, entry.word, entry, results, seen);

      // 拼音/谐音匹配
      for (const alias of entry.aliases) {
        if (alias.length >= 2) {
          this.findMatches(content, alias, entry, results, seen);
        }
      }

      // 形近字匹配 (仅针对中文词)
      if (/^[\u4e00-\u9fff]+$/.test(entry.word)) {
        this.findSimilarMatches(content, entry, results, seen);
      }
    }

    // 去重排序
    const unique = results.filter(
      (r, i, self) => i === self.findIndex((s) => s.word === r.word && s.position === r.position),
    );
    unique.sort((a, b) => a.position - b.position);

    return unique;
  }

  /**
   * 敏感词处理 (O5: 支持同步回调)
   */
  processContent(
    content: string,
    strategy: string = 'replace',
    callbacks?: SyncCallbacks,
  ): { result: string; matches: SensitiveWord[] } {
    const matches = this.check(content, 'strict');
    let result = content;
    const batchChanges: Array<{original: string; replacement: string}> = [];

    // 从后向前替换
    const sortedMatches = [...matches].sort((a, b) => b.position - a.position);

    for (const match of sortedMatches) {
      const entry = this.dictionary.find(
        (e) => e.word === match.word || e.aliases.includes(match.word),
      );
      if (!entry) continue;

      const effectiveStrategy = strategy || entry.strategy;
      const originalSlice = result.slice(match.position, match.position + match.word.length);

      switch (effectiveStrategy) {
        case 'replace': {
          const repl = entry.replacement || '***';
          result = result.slice(0, match.position) + repl + result.slice(match.position + match.word.length);
          batchChanges.push({ original: originalSlice, replacement: repl });
          callbacks?.onReplace?.(match.word, repl, match.position);
          break;
        }
        case 'remove':
          result = result.slice(0, match.position) + result.slice(match.position + match.word.length);
          batchChanges.push({ original: originalSlice, replacement: '' });
          callbacks?.onReplace?.(match.word, '', match.position);
          break;
        case 'warn':
        default:
          // 仅标记不修改
          break;
      }
    }

    callbacks?.onBatchComplete?.(batchChanges);

    // 如有替换发生，自动记录到替换历史
    if (batchChanges.length > 0) {
      this.recordReplacement(content, batchChanges.map((bc, i) => ({
        word: matches[i]?.word || '',
        replacement: bc.replacement,
        position: matches[i]?.position ?? 0,
      })));
    }

    return { result, matches };
  }

  /**
   * AI辅助上下文判断 (模拟)
   */
  aiContextCheck(content: string, word: string): {
    isSensitive: boolean;
    confidence: number;
    reason: string;
  } {
    // 模拟AI上下文判断
    const surrounding = this.getSurroundingText(content, content.indexOf(word) >= 0 ? content.indexOf(word) : 0);
    const hasQuotes = /[""「『]/.test(surrounding);
    const isDialogue = /说道|回答|问|说：/.test(surrounding);

    // 如果在引号内或对话中，降低敏感度
    if (hasQuotes || isDialogue) {
      return {
        isSensitive: false,
        confidence: 0.7,
        reason: '该词出现在对话中，属于角色引用，非作者直接表达',
      };
    }

    // 如果是正面或中性语境
    const positiveContext = /不是|并非|反对|不能|不应该/.test(surrounding);
    if (positiveContext) {
      return {
        isSensitive: false,
        confidence: 0.6,
        reason: '该词在否定或反义语境中使用',
      };
    }

    return {
      isSensitive: true,
      confidence: 0.9,
      reason: '该词在叙述性文本中出现，非对话引用',
    };
  }

  // ──────────────────────────────────────────────
  // O7: 多平台过审配置
  // ──────────────────────────────────────────────

  private readonly platformPresets: Record<string, { level: string; filters: string[] }> = {
    fanqie: { level: 'strict', filters: ['violence', 'pornographic', 'political'] },
    qidian: { level: 'moderate', filters: ['pornographic', 'political'] },
    jinjiang: { level: 'strict', filters: ['pornographic'] },
    zhihu: { level: 'lenient', filters: ['political', 'pornographic'] },
    douyin: { level: 'strict', filters: ['violence', 'political', 'pornographic', 'discrimination'] },
  };

  getPlatformPresets(): Record<string, { level: string; filters: string[] }> {
    return { ...this.platformPresets };
  }

  /**
   * O7: 按平台预设检测文本
   */
  checkForPlatform(content: string, platform: string): {
    platform: string;
    level: string;
    filters: string[];
    matches: SensitiveWord[];
  } {
    const preset = this.platformPresets[platform];
    if (!preset) {
      throw new Error(`未知平台: "${platform}"，可用: ${Object.keys(this.platformPresets).join(', ')}`);
    }

    const matches = this.check(content, preset.level, preset.filters);
    return {
      platform,
      level: preset.level,
      filters: preset.filters,
      matches,
    };
  }

  // ──────────────────────────────────────────────
  // O6: 过审辅助工作流
  // ──────────────────────────────────────────────

  /**
   * O6: 过审辅助工作流 — 扫描 → 自动替换 → 重新扫描 → 生成报告
   */
  async auditWorkflow(content: string, platform?: string): Promise<{
    totalIssues: number;
    criticalCount: number;
    warningCount: number;
    autoFixed: number;
    remaining: SensitiveWord[];
    report: string;
  }> {
    // 第一步：检测
    const initialLevel = platform ? this.platformPresets[platform]?.level || 'strict' : 'strict';
    const initialFilters = platform ? this.platformPresets[platform]?.filters : undefined;
    const initialMatches = this.check(content, initialLevel, initialFilters);

    const criticalCount = initialMatches.filter((m) => m.severity === 'high').length;
    const warningCount = initialMatches.filter((m) => m.severity === 'medium' || m.severity === 'low').length;

    // 第二步：自动替换
    const { result, matches: replacedMatches } = this.processContent(content, 'replace');

    // 第三步：重新扫描替换后文本
    const remaining = this.check(result, initialLevel, initialFilters).filter(
      (m) => !replacedMatches.some((r) => r.word === m.word && r.position === m.position),
    );

    const autoFixed = replacedMatches.length;

    // 第四步：生成文本报告
    const dateStr = new Date().toLocaleString('zh-CN');
    const platformInfo = platform ? `平台: ${platform} (${this.platformPresets[platform]?.level || '未知'}级别)` : '通用审核';
    const report = [
      `═══════════════════════════════════════`,
      `          敏感词过审报告`,
      `═══════════════════════════════════════`,
      `生成时间: ${dateStr}`,
      `${platformInfo}`,
      ``,
      `─ 摘要 ─`,
      `总问题数: ${initialMatches.length}`,
      `  严重: ${criticalCount}`,
      `  警告: ${warningCount}`,
      `自动修复: ${autoFixed}`,
      `剩余问题: ${remaining.length}`,
      ``,
    ];

    if (replacedMatches.length > 0) {
      report.push(`─ 已自动修复 ─`);
      for (const m of replacedMatches) {
        report.push(`  · "${m.word}" → 已替换 (位置 ${m.position})`);
      }
      report.push('');
    }

    if (remaining.length > 0) {
      report.push(`─ 剩余待处理 ─`);
      for (const m of remaining) {
        report.push(`  · "${m.word}" [${m.category}] (${m.severity}) — ${m.suggestion}`);
      }
      report.push('');
    }

    if (initialMatches.length === 0) {
      report.push('✓ 文本未检测到敏感内容，无需处理。');
    } else if (remaining.length === 0) {
      report.push('✓ 所有敏感问题已自动修复。');
    } else {
      report.push('⚠ 部分问题已自动修复，剩余问题需人工审核。');
    }

    report.push(`───────────────────────────────────`);

    return {
      totalIssues: initialMatches.length,
      criticalCount,
      warningCount,
      autoFixed,
      remaining,
      report: report.join('\n'),
    };
  }

  private findMatches(
    content: string,
    target: string,
    entry: SensitiveEntry,
    results: SensitiveWord[],
    seen: Set<string>,
  ): void {
    const regex = new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const key = `${entry.word}-${match.index}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        word: match[0],
        category: entry.category,
        position: match.index,
        severity: entry.severity,
        suggestion: entry.replacement ? `建议替换为"${entry.replacement}"` : '建议修改该表达',
      });
    }
  }

  private findSimilarMatches(
    content: string,
    entry: SensitiveEntry,
    results: SensitiveWord[],
    seen: Set<string>,
  ): void {
    // 形近字匹配：检查词中每个字是否有形近字出现在内容中
    for (let i = 0; i < entry.word.length; i++) {
      const char = entry.word[i];
      const similars = this.similarChars[char];
      if (!similars) continue;

      for (const similar of similars) {
        const similarWord = entry.word.slice(0, i) + similar + entry.word.slice(i + 1);
        const regex = new RegExp(similarWord, 'g');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
          const key = `${entry.word}-similar-${match.index}`;
          if (seen.has(key)) continue;
          seen.add(key);

          results.push({
            word: match[0],
            category: entry.category,
            position: match.index,
            severity: entry.severity,
            suggestion: `可能为"${entry.word}"的形近字变体`,
          });
        }
      }
    }
  }

  private getSurroundingText(content: string, position: number): string {
    const start = Math.max(0, position - 20);
    const end = Math.min(content.length, position + 20);
    return content.slice(start, end);
  }
}
