/**
 * NestJS 根模块
 * 导入所有业务模块
 */

import { Module } from '@nestjs/common';
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
import { ConflictEngineModule } from './modules/conflict-engine/conflict.module';
import { RagModule } from './rag/rag.module';
import { StateModule } from './state/state.module';
import { StateManagementModule } from './state/state-management.module';
import { RTCOServiceModule } from './rtco/rtco.module';
import { MaterialModule } from './material/material.module';
import { InspirationModule } from './modules/inspiration/inspiration.module';
import { StoryDictModule } from './modules/story-dict/story-dict.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { MapPointModule } from './modules/map-point/map-point.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { IdeaLabModule } from './modules/idea-lab/idea-lab.module';
import { WorkflowGuardModule } from './modules/workflow-guard/workflow-guard.module';
import { WritingQualityModule } from './modules/writing-quality/writing-quality.module';
import { ContinuityModule } from './modules/continuity/continuity.module';

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
    ConflictEngineModule,
    RagModule,
    StateModule,
    StateManagementModule,
    RTCOServiceModule,
    MaterialModule,
    InspirationModule,
    StoryDictModule,
    OrganizationModule,
    MapPointModule,
    TimelineModule,
    IdeaLabModule,
    WorkflowGuardModule,
    WritingQualityModule,
    ContinuityModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
