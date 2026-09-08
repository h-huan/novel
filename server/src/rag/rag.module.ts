/**
 * RAG 引擎模块
 *
 * 提供向量检索、智能分块与嵌入能力
 * 向量存储使用项目内 SQLite；本地嵌入模型缺失时跳过语义索引，不要求用户配置远程服务。
 */

import { Module } from '@nestjs/common';
import { ChunkerService } from './chunker.service';
import { VectorIndexService } from './vector-index.service';
import { EmbeddingService } from './embedding.service';
import { RoutingModule } from '../routing/routing.module';
import { CanonicalSyncStateService } from './canonical-sync-state.service';
import { CanonicalSyncStateController } from './canonical-sync-state.controller';
import { StateModule } from '../state/state.module';

@Module({
  imports: [RoutingModule, StateModule],
  controllers: [CanonicalSyncStateController],
  providers: [
    ChunkerService,
    VectorIndexService,
    EmbeddingService,
    CanonicalSyncStateService,
  ],
  exports: [
    ChunkerService,
    VectorIndexService,
    EmbeddingService,
    CanonicalSyncStateService,
  ],
})
export class RagModule {}
