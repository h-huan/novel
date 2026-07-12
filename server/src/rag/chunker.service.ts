/**
 * 智能分块服务 (Smart Chunker)
 *
 * 实现设计文档 1.5 节的分块策略
 * - 章节：语义分块，500-1000 tokens
 * - 世界观：按标题层级分层分块
 * - 角色：整体索引（不分块）
 * - 大纲：按节点分块
 */

import { Injectable } from '@nestjs/common';
import type { DocType, ChunkStrategy } from './types';

export interface Chunk {
  id: string;
  text: string;
  docType: DocType;
  metadata: {
    chunkIndex: number;
    parentDocId?: string;
    headingPath?: string[];
    characters?: string[];
    priority?: string;
  };
}

@Injectable()
export class ChunkerService {
  /** 各文档类型的分块策略 */
  private readonly strategies: Record<DocType, ChunkStrategy> = {
    chapter: {
      method: 'semantic',
      chunkSize: 512,
      overlap: 64,
      separators: ['\n\n', '\n', '。', '！', '？'],
      minChunkSize: 128,
    },
    world_setting: {
      method: 'hierarchical',
      chunkSize: 1024,
      overlap: 128,
      separators: ['\n## ', '\n### ', '\n#### ', '\n\n'],
      minChunkSize: 64,
      preserveHeaders: true,
    },
    character_profile: {
      method: 'whole',
      chunkSize: 0,
      overlap: 0,
      separators: [],
      minChunkSize: 0,
      maxSize: 2048,
    },
    outline: {
      method: 'structural',
      chunkSize: 512,
      overlap: 0,
      separators: [],
      minChunkSize: 64,
      nodeMarker: '##',
      includeChildrenSummary: true,
    },
    foreshadowing: {
      method: 'whole',
      chunkSize: 0,
      overlap: 0,
      separators: [],
      minChunkSize: 0,
      maxSize: 1024,
    },
  };

  /**
   * 将文档内容拆分为多个分块
   */
  split(content: string, docType: DocType, parentId?: string): Chunk[] {
    const strategy = this.strategies[docType];

    switch (strategy.method) {
      case 'semantic':
        return this.semanticSplit(content, docType, strategy, parentId);
      case 'hierarchical':
        return this.hierarchicalSplit(content, docType, strategy, parentId);
      case 'whole':
        return this.wholeChunk(content, docType, strategy, parentId);
      case 'structural':
        return this.structuralSplit(content, docType, strategy, parentId);
      default:
        return [];
    }
  }

  /**
   * 语义分块：根据分隔符自然断开
   * 用于章节内容
   */
  private semanticSplit(
    content: string,
    docType: DocType,
    strategy: ChunkStrategy,
    parentId?: string,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const paragraphs = this.splitBySeparators(content, strategy.separators);

    let currentText = '';
    let currentTokens = 0;
    let chunkIndex = 0;

    for (const para of paragraphs) {
      const paraTokens = this.estimateTokens(para);

      if (currentTokens + paraTokens > strategy.chunkSize && currentTokens > strategy.minChunkSize) {
        chunks.push(this.createChunk(currentText, docType, chunkIndex++, parentId));
        currentText = para;
        currentTokens = paraTokens;
      } else {
        currentText += (currentText ? '\n' : '') + para;
        currentTokens += paraTokens;
      }
    }

    // 最后一块
    if (currentText && (currentTokens >= strategy.minChunkSize || chunks.length === 0)) {
      chunks.push(this.createChunk(currentText, docType, chunkIndex, parentId));
    }

    return chunks;
  }

  /**
   * 层级分块：按标题层级切分
   * 用于世界观文档
   */
  private hierarchicalSplit(
    content: string,
    docType: DocType,
    strategy: ChunkStrategy,
    parentId?: string,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const headingPath: string[] = [];
    let chunkIndex = 0;

    // 按标题分割（##、###、####）
    const sections = content.split(/(?=\n#{2,4}\s)/);

    for (const section of sections) {
      const headingMatch = section.match(/^(#{2,4})\s+(.+)/m);
      const headingLevel = headingMatch ? headingMatch[1].length : 0;
      const headingText = headingMatch ? headingMatch[2].trim() : '';

      if (headingMatch) {
        // 调整 heading path
        headingPath.length = headingLevel - 2;
        headingPath.push(headingText);
      }

      const cleanText = section.replace(/^#{2,4}\s+.+\n?/m, '').trim();
      if (!cleanText) continue;

      const sectionTokens = this.estimateTokens(cleanText);

      if (sectionTokens <= strategy.chunkSize) {
        chunks.push({
          id: `${parentId || 'doc'}:${chunkIndex}`,
          text: strategy.preserveHeaders && headingPath.length > 0
            ? `## ${headingPath.join(' > ')}\n\n${cleanText}`
            : cleanText,
          docType,
          metadata: {
            chunkIndex: chunkIndex++,
            parentDocId: parentId,
            headingPath: [...headingPath],
          },
        });
      } else {
        // 子分块
        const subChunks = this.semanticSplit(cleanText, docType, {
          ...strategy,
          method: 'semantic',
          chunkSize: strategy.chunkSize,
        }, parentId);

        for (const sub of subChunks) {
          if (strategy.preserveHeaders && headingPath.length > 0) {
            sub.text = `## ${headingPath.join(' > ')}\n\n${sub.text}`;
          }
          sub.metadata.chunkIndex = chunkIndex++;
          sub.metadata.headingPath = [...headingPath];
          chunks.push(sub);
        }
      }
    }

    return chunks;
  }

  /**
   * 整体分块：不拆分，完整索引
   * 用于角色档案和伏笔
   */
  private wholeChunk(
    content: string,
    docType: DocType,
    strategy: ChunkStrategy,
    parentId?: string,
  ): Chunk[] {
    const maxSize = strategy.maxSize || 2048;
    const truncated = content.length > maxSize * 2
      ? content.slice(0, maxSize * 2)  // 中文字符 ≈ tokens，留余量
      : content;

    return [{
      id: `${parentId || 'doc'}:0`,
      text: truncated,
      docType,
      metadata: {
        chunkIndex: 0,
        parentDocId: parentId,
      },
    }];
  }

  /**
   * 结构分块：按大纲节点切分
   * 用于大纲
   */
  private structuralSplit(
    content: string,
    docType: DocType,
    strategy: ChunkStrategy,
    parentId?: string,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const marker = strategy.nodeMarker || '##';

    const nodes = content.split(new RegExp(`(?=${marker}\\s)`));
    let chunkIndex = 0;

    for (const node of nodes) {
      const cleanText = node.trim();
      if (!cleanText) continue;

      const nodeTokens = this.estimateTokens(cleanText);

      if (nodeTokens <= strategy.chunkSize) {
        chunks.push({
          id: `${parentId || 'doc'}:${chunkIndex}`,
          text: cleanText,
          docType,
          metadata: {
            chunkIndex: chunkIndex++,
            parentDocId: parentId,
          },
        });
      } else {
        // 节点太长，在句号处断开
        const subChunks = this.semanticSplit(cleanText, docType, {
          ...strategy,
          method: 'semantic',
          chunkSize: strategy.chunkSize,
          separators: ['。', '！', '？', '\n\n'],
        }, parentId);

        for (const sub of subChunks) {
          sub.metadata.chunkIndex = chunkIndex++;
          chunks.push(sub);
        }
      }
    }

    return chunks;
  }

  /**
   * 提取文本中出现的角色名
   */
  extractCharacters(text: string, knownCharacters: string[]): string[] {
    if (!knownCharacters || knownCharacters.length === 0) return [];
    return knownCharacters.filter(name => text.includes(name));
  }

  /**
   * 估算文本的 token 数 (粗略估计: 中文字符=2 tokens, 英文单词=1.3 tokens)
   */
  estimateTokens(text: string): number {
    let tokens = 0;
    for (const char of text) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
        tokens += 2;
      } else if (/\s/.test(char)) {
        tokens += 0;
      } else {
        tokens += 1;
      }
    }
    return Math.ceil(tokens * 0.7); // 中文 token 修正系数
  }

  /**
   * 按分隔符序列分割文本
   */
  private splitBySeparators(text: string, separators: string[]): string[] {
    let result = [text];
    for (const sep of separators) {
      const newResult: string[] = [];
      for (const part of result) {
        const split = part.split(sep);
        for (let i = 0; i < split.length; i++) {
          if (split[i]) newResult.push(split[i]);
          if (i < split.length - 1) {
            // 将分隔符追加到前一段
            newResult[newResult.length - 1] += sep;
          }
        }
      }
      result = newResult;
    }
    return result;
  }

  /**
   * 创建分块对象
   */
  private createChunk(text: string, docType: DocType, index: number, parentId?: string): Chunk {
    return {
      id: `${parentId || 'doc'}:${index}`,
      text: text.trim(),
      docType,
      metadata: {
        chunkIndex: index,
        parentDocId: parentId,
      },
    };
  }
}
