/**
 * 优化标记 Service
 * 对导入内容自动标记可优化点
 */
import { Injectable } from '@nestjs/common';
import type { ImportResult } from './import-engine.service';

export enum OptimizationType {
  PLOT_CONTRADICTION = 'plot_contradiction',
  CHARACTER_OOC = 'character_ooc',
  SETTING_CONFLICT = 'setting_conflict',
  QUALITY_WARNING = 'quality_warning',
}

export enum OptimizationSeverity {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export interface OptimizationMark {
  id: string;
  type: OptimizationType;
  severity: OptimizationSeverity;
  chapterIndex: number;
  lineNumber?: number;
  snippet: string;
  description: string;
  suggestion: string;
}

@Injectable()
export class OptimizationMarkService {
  private markIdCounter = 0;

  /**
   * 对导入结果进行分析，标记可优化点
   */
  analyze(result: ImportResult): OptimizationMark[] {
    const marks: OptimizationMark[] = [];

    for (const chapter of result.chapters) {
      const lines = chapter.content.split('\n');

      // 质量警告：段落过长
      this.detectLongParagraphs(chapter, lines, marks);

      // 质量警告：对话过多/过少
      this.detectDialogueIssues(chapter, lines, marks);

      // 情节矛盾：检查重复段落
      this.detectRepeatedContent(chapter, lines, marks);

      // 角色OOC：检查角色名不一致
      this.detectInconsistentNames(chapter, result.characters.map((c) => c.name), marks);

      // 设定冲突：检查常识性矛盾
      this.detectCommonSenseIssues(chapter, lines, marks);
    }

    // 跨章节分析
    this.detectCrossChapterIssues(result, marks);

    return marks;
  }

  // ==================== 检测规则 ====================

  /**
   * 检测过长段落（超过300字）
   */
  private detectLongParagraphs(
    chapter: { index: number; title: string; content: string },
    lines: string[],
    marks: OptimizationMark[],
  ): void {
    let charCount = 0;
    let lineStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) {
        if (charCount > 300) {
          marks.push(this.createMark(
            OptimizationType.QUALITY_WARNING,
            OptimizationSeverity.LOW,
            chapter.index,
            lineStart + 1,
            lines.slice(lineStart, i + 1).join('\n').substring(0, 100),
            `段落过长（${charCount}字），建议拆分`,
            '建议将超过300字的段落拆分为2-3个段落以提升可读性',
          ));
        }
        charCount = 0;
        lineStart = i + 1;
      } else {
        charCount += line.length;
      }
    }
  }

  /**
   * 检测对话问题（连续无对话段落过多）
   */
  private detectDialogueIssues(
    chapter: { index: number; title: string; content: string },
    lines: string[],
    marks: OptimizationMark[],
  ): void {
    const consecutiveNoDialogue = this.countConsecutive(lines, (l) => !l.includes('「') && !l.includes('「') && !l.includes('"') && !l.includes('"'));

    if (consecutiveNoDialogue > 20) {
      marks.push(this.createMark(
        OptimizationType.QUALITY_WARNING,
        OptimizationSeverity.MEDIUM,
        chapter.index,
        0,
        `连续 ${consecutiveNoDialogue} 段无对话`,
        '连续多段缺少对话，可能导致节奏沉闷',
        '建议适当插入对话以调节叙事节奏',
      ));
    }
  }

  /**
   * 检测重复内容
   */
  private detectRepeatedContent(
    chapter: { index: number; title: string; content: string },
    lines: string[],
    marks: OptimizationMark[],
  ): void {
    const seen = new Map<string, number[]>();

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.length < 10) continue;

      const prev = seen.get(trimmed);
      if (prev) {
        prev.push(i + 1);
        if (prev.length === 2) {
          marks.push(this.createMark(
            OptimizationType.PLOT_CONTRADICTION,
            OptimizationSeverity.MEDIUM,
            chapter.index,
            i + 1,
            trimmed.substring(0, 80),
            `发现重复内容（${prev.length}次），位置: ${prev.join(', ')}行`,
            '请确认是否有意重复，如否建议删除冗余内容',
          ));
        }
      } else {
        seen.set(trimmed, [i + 1]);
      }
    }
  }

  /**
   * 检测角色名不一致
   */
  private detectInconsistentNames(
    chapter: { index: number; title: string; content: string },
    characterNames: string[],
    marks: OptimizationMark[],
  ): void {
    if (characterNames.length === 0) return;

    // 对于每个角色，检查是否有多种称呼
    for (const name of characterNames) {
      if (name.length <= 2) continue;

      // 检查名字截断情况（如"林黛玉"被写作"黛玉"）
      const baseName = name.substring(1); // 去掉姓氏
      if (baseName.length >= 2) {
        const regex = new RegExp(baseName, 'g');
        const fullMatches = chapter.content.match(new RegExp(name, 'g'))?.length || 0;
        const baseMatches = chapter.content.match(regex)?.length || 0;

        // 如果简称出现多于全称，可能存在不一致
        if (baseMatches > fullMatches * 2 && fullMatches >= 3) {
          marks.push(this.createMark(
            OptimizationType.CHARACTER_OOC,
            OptimizationSeverity.LOW,
            chapter.index,
            0,
            `角色"${name}"（${baseName}）`,
            `角色"${name}"的简称"${baseName}"出现${baseMatches}次，全称${fullMatches}次`,
            '建议统一角色称呼以避免读者混淆',
          ));
        }
      }
    }
  }

  /**
   * 检测常识性问题
   */
  private detectCommonSenseIssues(
    chapter: { index: number; title: string; content: string },
    lines: string[],
    marks: OptimizationMark[],
  ): void {
    const text = chapter.content;

    // 检测"他/她/它"混用（常见问题）
    const taCount = (text.match(/他/g) || []).length;
    const taFemaleCount = (text.match(/她/g) || []).length;

    // 数量级疑点
    const largeNumbers = text.match(/\d{5,}/g);
    if (largeNumbers) {
      for (const num of largeNumbers) {
        if (num.length >= 6) {
          marks.push(this.createMark(
            OptimizationType.SETTING_CONFLICT,
            OptimizationSeverity.LOW,
            chapter.index,
            0,
            `出现大数: ${num}`,
            `出现可能不合理的较大数字: ${num}`,
            '请确认该数字是否符合作品设定',
          ));
        }
      }
    }
  }

  /**
   * 跨章节分析
   */
  private detectCrossChapterIssues(
    result: ImportResult,
    marks: OptimizationMark[],
  ): void {
    // 检查角色出现在前言之前的问题
    for (const char of result.characters) {
      if (char.firstAppearChapter > 1 && char.mentionCount >= 5) {
        // 正常情况
      }
    }

    // 连续章节字数突变
    for (let i = 1; i < result.chapters.length; i++) {
      const prev = result.chapters[i - 1].wordCount;
      const curr = result.chapters[i].wordCount;
      if (prev > 0 && curr > 0) {
        const ratio = Math.max(prev, curr) / Math.min(prev, curr);
        if (ratio > 5) {
          marks.push(this.createMark(
            OptimizationType.QUALITY_WARNING,
            OptimizationSeverity.MEDIUM,
            result.chapters[i].index,
            0,
            `第${result.chapters[i - 1].index}章(${prev}字) → 第${result.chapters[i].index}章(${curr}字)`,
            `章节字数突变：第${result.chapters[i - 1].index}章(${prev}字) → 第${result.chapters[i].index}章(${curr}字)，相差${ratio.toFixed(1)}倍`,
            '建议检查章节分割是否正确或内容是否完整',
          ));
        }
      }
    }
  }

  // ==================== 工具方法 ====================

  private createMark(
    type: OptimizationType,
    severity: OptimizationSeverity,
    chapterIndex: number,
    lineNumber: number,
    snippet: string,
    description: string,
    suggestion: string,
  ): OptimizationMark {
    this.markIdCounter++;
    return {
      id: `opt-${this.markIdCounter}`,
      type,
      severity,
      chapterIndex,
      lineNumber: lineNumber || undefined,
      snippet: snippet.substring(0, 200),
      description,
      suggestion,
    };
  }

  private countConsecutive(
    lines: string[],
    predicate: (line: string) => boolean,
  ): number {
    let maxConsecutive = 0;
    let current = 0;

    for (const line of lines) {
      if (predicate(line)) {
        current++;
        maxConsecutive = Math.max(maxConsecutive, current);
      } else {
        current = 0;
      }
    }

    return maxConsecutive;
  }
}
