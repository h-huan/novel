/**
 * NestJS 根模块
 * 导入所有业务模块
 */

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CreationContextMiddleware } from './common/creation-context.middleware';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { DatabaseModule } from './database';
import { ProjectModule } from './modules/project/project.module';
import { WorldSettingModule } from './modules/world-setting/world-setting.module';
import { CharacterModule } from './modules/character/character.module';
import { OutlineModule } from './modules/outline/outline.module';
import { ChapterModule } from './modules/chapter/chapter.module';
import { ForeshadowingModule } from './modules/foreshadowing/foreshadowing.module';
import { FileStorageModule } from './modules/file-storage/file-storage.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { ChainModule } from './chain/chain.module';
import { RoutingModule } from './routing/routing.module';
import { RefinementModule } from './modules/refinement/refinement.module';
import { ImportExportModule } from './modules/import-export/import-export.module';
import { AuthorNoteModule } from './modules/author-note/author-note.module';
import { ConflictModule } from './modules/conflict-engine/conflict.module';
import { RagModule } from './rag/rag.module';
import { StateModule } from './state/state.module';
import { StateManagementModule } from './state/state-management.module';
import { MaterialModule } from './material/material.module';
import { StoryDictModule } from './modules/story-dict/story-dict.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { MapPointModule } from './modules/map-point/map-point.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { IdeaLabModule } from './modules/idea-lab/idea-lab.module';
import { WorkflowGuardModule } from './modules/workflow-guard/workflow-guard.module';
import { WritingQualityModule } from './modules/writing-quality/writing-quality.module';
import { ContinuityModule } from './modules/continuity/continuity.module';
import { GenerationLessonsModule } from './modules/generation-lessons/generation-lessons.module';
import { GenerationMetricsModule } from './modules/generation-metrics/generation-metrics.module';
import { ModuleStandardsModule } from './modules/module-standards/module-standards.module';
import { PlatformAnalyticsModule } from './modules/platform-analytics/platform-analytics.module';
import { OriginalityModule } from './modules/originality/originality.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    DatabaseModule,
    WebSocketModule,
    FileStorageModule,
    ProjectModule,
    WorldSettingModule,
    CharacterModule,
    OutlineModule,
    ChapterModule,
    ForeshadowingModule,
    ChainModule,
    RoutingModule,
    RefinementModule,
    ImportExportModule,
    AuthorNoteModule,
    ConflictModule,
    RagModule,
    StateModule,
    StateManagementModule,
    MaterialModule,
    StoryDictModule,
    OrganizationModule,
    MapPointModule,
    TimelineModule,
    IdeaLabModule,
    WorkflowGuardModule,
    WritingQualityModule,
    ContinuityModule,
    GenerationLessonsModule,
    GenerationMetricsModule,
    ModuleStandardsModule,
    PlatformAnalyticsModule,
    OriginalityModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 全局绑定“当前创作项目”上下文，供 LLM 埋点兜底归属（灵感发现等创建前请求自然为 null）
    consumer.apply(CreationContextMiddleware).forRoutes('*');
  }
}
