/**
 * RAG 引擎内部类型定义
 */

/** 文档类型 */
export type DocType = 'chapter' | 'world_setting' | 'character_profile' | 'outline' | 'foreshadowing';

/** 检索场景 */
export type SearchScene = 'pre_writing' | 'mid_writing' | 'consistency_check' | 'character_query';

/** RTCO 优先级 */
export type RTCOTier = 'P0' | 'P1' | 'P2' | 'P3';

/** 向量存储中的文档分块 */
export interface DocumentChunk {
  id: string;
  docType: DocType;
  chapterId?: string;
  characterId?: string;
  text: string;
  priority: RTCOTier;
  characters: string[];
  version: number;
  locked: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
}

/** 检索结果 */
export interface RetrievalResult {
  chunkId: string;
  text: string;
  score: number;
  source: 'dense' | 'sparse' | 'keyword';
  priority: RTCOTier;
  docType: DocType;
  payload: Record<string, unknown>;
}

/** 混合检索查询参数 */
export interface SearchQuery {
  query: string;
  scene?: SearchScene;
  topK?: number;
  rerankTopN?: number;
  filters?: SearchFilters;
}

/** 检索过滤条件 */
export interface SearchFilters {
  docTypes?: DocType[];
  chapterId?: string;
  characterIds?: string[];
  priorities?: RTCOTier[];
  locked?: boolean;
  maxChapterIndex?: number;
}

/** 检索场景配置 */
export interface SceneConfig {
  collections: string[];
  topK: number;
  rerankTopN: number;
  fusion: 'writing_context' | 'character_check' | 'world_consistency' | 'foreshadow_match';
  filters: Record<string, unknown>;
}

/** RRF 融合权重 */
export interface FusionWeights {
  dense: number;
  sparse: number;
  keyword: number;
}

/** 分块策略配置 */
export interface ChunkStrategy {
  method: 'semantic' | 'hierarchical' | 'whole' | 'structural';
  chunkSize: number;
  overlap: number;
  separators: string[];
  minChunkSize: number;
  preserveHeaders?: boolean;
  maxSize?: number;
  nodeMarker?: string;
  includeChildrenSummary?: boolean;
}

/** 向量索引更新操作 */
export interface VectorUpsertPayload {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

/** 增量更新参数 */
export interface IncrementalUpdate {
  type: 'add' | 'update' | 'delete';
  chunkIds: string[];
  chapters?: string[];
  newText?: string;
  docType: DocType;
}

/** 上下文构建选项 */
export interface ContextBuildOptions {
  /** 目标写作阶段 */
  stage: 'outline' | 'drafting' | 'revision' | 'polish';
  /** 章节复杂度 (0-1) */
  chapterComplexity?: number;
  /** 活跃角色数 */
  activeCharacters?: number;
  /** 活跃伏笔数 */
  activeForeshadows?: number;
  /** Token 预算上限 */
  maxTokens?: number;
  /** 当前章节ID */
  chapterId?: string;
}

/** 上下文构建结果 */
export interface ContextResult {
  systemPrompt: string;
  context: string;
  p0Content: RetrievalResult[];
  p1Content: RetrievalResult[];
  p2Available: RetrievalResult[];
  tokenUsage: {
    p0: number;
    p1: number;
    total: number;
    budget: number;
  };
}
