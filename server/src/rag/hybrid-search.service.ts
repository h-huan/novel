/**
 * 混合检索引擎 (Hybrid Search Service)
 *
 * 三路检索 + RRF融合算法
 * - Dense检索: 语义向量相似度
 * - Sparse检索: 关键词BM25（flexsearch/minisearch）
 * - Keyword检索: 精确字段匹配
 *
 * 4种场景路由:
 * - pre_writing: 动笔前广泛检索
 * - mid_writing: 写作中精准检索
 * - consistency_check: 一致性全库校验
 * - character_query: 角色精确查询
 */

import { Injectable, Logger } from '@nestjs/common';
import { VectorIndexService } from './vector-index.service';
import type {
  DocType,
  RTCOTier,
  RetrievalResult,
  SearchQuery,
  SearchFilters,
  SceneConfig,
  FusionWeights,
} from './types';

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  /** RRF平滑参数 */
  private readonly RRF_K = 60;

  /** 场景路由配置 */
  private readonly sceneConfig: Record<string, SceneConfig> = {
    pre_writing: {
      collections: ['global_knowledge', 'characters', 'foreshadowings'],
      topK: 20,
      rerankTopN: 30,
      fusion: 'writing_context',
      filters: { docType: ['world_setting', 'character_profile', 'outline'] },
    },
    mid_writing: {
      collections: ['chapters_rolling', 'characters'],
      topK: 8,
      rerankTopN: 15,
      fusion: 'character_check',
      filters: {
        priorities: ['P0', 'P1'],
      },
    },
    consistency_check: {
      collections: ['global_knowledge', 'chapters_rolling', 'characters', 'foreshadowings'],
      topK: 15,
      rerankTopN: 25,
      fusion: 'world_consistency',
      filters: {},
    },
    character_query: {
      collections: ['characters', 'chapters_rolling'],
      topK: 10,
      rerankTopN: 15,
      fusion: 'character_check',
      filters: {},
    },
  };

  /** 融合权重配置 */
  private readonly fusionWeights: Record<string, FusionWeights> = {
    writing_context: { dense: 0.5, sparse: 0.3, keyword: 0.2 },
    character_check: { dense: 0.3, sparse: 0.2, keyword: 0.5 },
    world_consistency: { dense: 0.2, sparse: 0.2, keyword: 0.6 },
    foreshadow_match: { dense: 0.4, sparse: 0.4, keyword: 0.2 },
  };

  /** BM25 索引（内存实现） */
  private bm25Index = new Map<string, BM25DocumentIndex>();

  constructor(private readonly vectorIndex: VectorIndexService) {}

  /**
   * 混合检索入口
   */
  async search(params: SearchQuery): Promise<RetrievalResult[]> {
    const scene = params.scene || 'mid_writing';
    const config = this.sceneConfig[scene];
    const topK = params.topK || config.topK;
    const rerankTopN = params.rerankTopN || config.rerankTopN;

    const mergedFilters = { ...config.filters, ...params.filters };
    const store = this.vectorIndex.getStore();

    // ═══ 1. Dense检索 (语义向量) ═══
    const queryVector = this.generateQueryVector(params.query);
    const denseResults: Array<RetrievalResult> = [];

    for (const collection of config.collections) {
      const results = await store.query(collection, queryVector, topK * 3, mergedFilters);
      for (const r of results) {
        denseResults.push({
          chunkId: r.id,
          text: (r.metadata['text'] as string) || '',
          score: r.score,
          source: 'dense',
          priority: (r.metadata['priority'] as RetrievalResult['priority']) || 'P2',
          docType: (r.metadata['docType'] as RetrievalResult['docType']) || 'chapter',
          payload: r.metadata,
        });
      }
    }

    // ═══ 2. Sparse检索 (BM25关键词) ═══
    const sparseResults = this.bm25Search(params.query, config.collections, topK * 3, mergedFilters);

    // ═══ 3. Keyword检索 (精确字段匹配) ═══
    const keywordResults = this.keywordSearch(params.query, config.collections, topK * 2, mergedFilters);

    // ═══ 4. RRF融合 ═══
    const weights = this.fusionWeights[config.fusion] || this.fusionWeights['writing_context'];
    const fused = this.rrfFusion(denseResults, sparseResults, keywordResults, weights);

    // ═══ 5. 简单Rerank (按分数重排取top-K) ═══
    return fused
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(rerankTopN, fused.length))
      .slice(0, topK);
  }

  /**
   * BM25 关键词检索
   */
  private bm25Search(
    query: string,
    collections: string[],
    limit: number,
    filters?: SearchFilters,
  ): RetrievalResult[] {
    const results: RetrievalResult[] = [];
    const queryTokens = this.tokenize(query);

    for (const collection of collections) {
      const index = this.bm25Index.get(collection);
      if (!index) continue;

      const scored = index.search(queryTokens);
      for (const [docId, score] of scored) {
        const doc = index.getDocument(docId);
        if (!doc) continue;

        // 应用过滤
        if (filters?.docTypes && !filters.docTypes.includes(doc.docType)) continue;
        if (filters?.priorities && !filters.priorities.includes(doc.priority)) continue;

        results.push({
          chunkId: docId,
          text: doc.text,
          score: score / 10, // 归一化到 0-1
          source: 'sparse',
          priority: doc.priority,
          docType: doc.docType,
          payload: {},
        });
      }
    }

    return results.slice(0, limit);
  }

  /**
   * 精确关键词匹配检索
   */
  private keywordSearch(
    query: string,
    collections: string[],
    limit: number,
    filters?: SearchFilters,
  ): RetrievalResult[] {
    const results: RetrievalResult[] = [];
    const keywords = this.extractKeywords(query);
    const store = this.vectorIndex.getStore();

    // 在已索引的文档中查找关键词精确匹配
    for (const keyword of keywords) {
      for (const collection of collections) {
        const index = this.bm25Index.get(collection);
        if (!index) continue;

        for (const [docId, doc] of index.getAllDocuments()) {
          if (doc.text.includes(keyword)) {
            results.push({
              chunkId: docId,
              text: doc.text,
              score: 0.8, // 精确匹配得分
              source: 'keyword',
              priority: doc.priority,
              docType: doc.docType,
              payload: {},
            });
          }
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * RRF (Reciprocal Rank Fusion) 融合算法
   * score(d) = Σ w_i / (k + rank_i(d))
   */
  private rrfFusion(
    denseResults: RetrievalResult[],
    sparseResults: RetrievalResult[],
    keywordResults: RetrievalResult[],
    weights: FusionWeights,
  ): RetrievalResult[] {
    const scores = new Map<string, { result: RetrievalResult; score: number }>();

    const addScores = (results: RetrievalResult[], weight: number): void => {
      for (let rank = 0; rank < results.length; rank++) {
        const r = results[rank];
        const bonus = weight * (1.0 / (this.RRF_K + rank + 1));
        const existing = scores.get(r.chunkId);

        if (existing) {
          existing.score += bonus;
          // 保留最高分的 result
          if (r.score > existing.result.score) {
            existing.result = r;
          }
        } else {
          scores.set(r.chunkId, { result: r, score: bonus });
        }
      }
    };

    addScores(denseResults, weights.dense);
    addScores(sparseResults, weights.sparse);
    addScores(keywordResults, weights.keyword);

    // 按 RRF 分数排序
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .map(([, v]) => ({
        ...v.result,
        score: v.score,
      }));

    return sorted;
  }

  /**
   * 向 BM25 索引添加文档
   */
  indexDocument(collection: string, docId: string, text: string, docType: string, priority: string): void {
    if (!this.bm25Index.has(collection)) {
      this.bm25Index.set(collection, new BM25DocumentIndex());
    }
    this.bm25Index.get(collection)!.addDocument(docId, text, docType, priority);
  }

  /**
   * 从 BM25 索引删除文档
   */
  removeDocument(collection: string, docId: string): void {
    this.bm25Index.get(collection)?.removeDocument(docId);
  }

  /**
   * 生成查询向量（简化版：散列编码）
   * 实际生产应使用 Embedding API
   */
  private generateQueryVector(query: string): number[] {
    // 简单的散列编码 - 实际应使用 bge-large-zh-v1.5 等嵌入模型
    const dim = 128;
    const vector = new Array<number>(dim).fill(0);
    const tokens = this.tokenize(query);

    for (let i = 0; i < tokens.length; i++) {
      let hash = 0;
      for (let j = 0; j < tokens[i].length; j++) {
        hash = ((hash << 5) - hash) + tokens[i].charCodeAt(j);
        hash |= 0;
      }
      vector[Math.abs(hash) % dim] += 1;
    }

    // L2归一化
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    // 简单的中文分词：按标点和空格分
    return text
      .split(/[\s，。！？；：""''（）、,.!?;:()\s]+/)
      .filter(t => t.length > 0);
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    const tokens = this.tokenize(text);
    // 过滤短词和停用词
    return tokens.filter(t => t.length >= 2
      && !['的是', '一个', '这个', '那个', '我们', '他们', '可以', '没有'].includes(t),
    );
  }
}

/**
 * BM25 文档索引（内存实现）
 */
class BM25DocumentIndex {
  private readonly documents = new Map<string, {
    text: string;
    docType: string;
    priority: string;
    tokens: string[];
  }>();

  private readonly invertedIndex = new Map<string, Map<string, number>>(); // token -> docID -> tf
  private readonly docLengths = new Map<string, number>();

  private readonly k1 = 1.5;
  private readonly b = 0.75;
  private avgDocLength = 0;

  addDocument(docId: string, text: string, docType: string, priority: string): void {
    const tokens = this.tokenize(text);
    this.documents.set(docId, { text, docType, priority, tokens });
    this.docLengths.set(docId, tokens.length);

    for (const token of tokens) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Map());
      }
      const docFreq = this.invertedIndex.get(token)!;
      docFreq.set(docId, (docFreq.get(docId) || 0) + 1);
    }

    this.updateAvgDocLength();
  }

  removeDocument(docId: string): void {
    const doc = this.documents.get(docId);
    if (!doc) return;

    for (const token of doc.tokens) {
      const docFreq = this.invertedIndex.get(token);
      if (docFreq) {
        docFreq.delete(docId);
        if (docFreq.size === 0) {
          this.invertedIndex.delete(token);
        }
      }
    }

    this.documents.delete(docId);
    this.docLengths.delete(docId);
    this.updateAvgDocLength();
  }

  search(queryTokens: string[]): Map<string, number> {
    const scores = new Map<string, number>();
    const N = this.documents.size;

    if (N === 0) return scores;

    for (const token of queryTokens) {
      const docFreq = this.invertedIndex.get(token);
      if (!docFreq) continue;

      const df = docFreq.size;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

      for (const [docId, tf] of docFreq) {
        const docLen = this.docLengths.get(docId) || 1;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * docLen / this.avgDocLength);
        const score = idf * numerator / denominator;

        scores.set(docId, (scores.get(docId) || 0) + score);
      }
    }

    return scores;
  }

  getDocument(docId: string): { text: string; docType: DocType; priority: RTCOTier } | undefined {
    const doc = this.documents.get(docId);
    if (!doc) return undefined;
    return { text: doc.text, docType: doc.docType as DocType, priority: doc.priority as RTCOTier };
  }

  getAllDocuments(): Map<string, { text: string; docType: DocType; priority: RTCOTier }> {
    const result = new Map<string, { text: string; docType: DocType; priority: RTCOTier }>();
    for (const [id, doc] of this.documents) {
      result.set(id, { text: doc.text, docType: doc.docType as DocType, priority: doc.priority as RTCOTier });
    }
    return result;
  }

  private tokenize(text: string): string[] {
    return text
      .split(/[\s，。！？；：""''（）、,.!?;:()\s]+/)
      .filter(t => t.length > 0);
  }

  private updateAvgDocLength(): void {
    if (this.documents.size === 0) {
      this.avgDocLength = 1;
      return;
    }
    let total = 0;
    for (const len of this.docLengths.values()) {
      total += len;
    }
    this.avgDocLength = total / this.documents.size;
  }
}
