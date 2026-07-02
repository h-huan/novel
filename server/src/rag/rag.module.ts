/**
 * RAG 引擎模块
 *
 * 提供向量检索、混合搜索、智能分块、上下文构建能力
 * 与外部 ChromaDB 集成，连接失败时自动降级到内存存储
 */

import { Module } from '@nestjs/common';
import { ChunkerService } from './chunker.service';
import { VectorIndexService } from './vector-index.service';
import { HybridSearchService } from './hybrid-search.service';
import { ContextBuilderService } from './context-builder.service';

@Module({
  providers: [
    ChunkerService,
    VectorIndexService,
    HybridSearchService,
    ContextBuilderService,
  ],
  exports: [
    ChunkerService,
    VectorIndexService,
    HybridSearchService,
    ContextBuilderService,
  ],
})
export class RagModule {}
