/**
 * WorkflowGuardModule - 流程守卫模块
 *
 * 依赖:
 * - ProjectModule (提供 ProjectService, ProjectRepository)
 * - WorldSettingModule
 * - CharacterModule
 * - OutlineModule
 * - ChapterModule
 * - ForeshadowingModule
 */
import { Module } from '@nestjs/common';
import { WorkflowGuardController } from './workflow-guard.controller';
import { WorkflowGuardService } from './workflow-guard.service';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { ProjectModule } from '../project/project.module';
import { WorldSettingModule } from '../world-setting/world-setting.module';
import { CharacterModule } from '../character/character.module';
import { OutlineModule } from '../outline/outline.module';
import { ChapterModule } from '../chapter/chapter.module';
import { ForeshadowingModule } from '../foreshadowing/foreshadowing.module';

@Module({
  imports: [
    ProjectModule,
    WorldSettingModule,
    CharacterModule,
    OutlineModule,
    ChapterModule,
    ForeshadowingModule,
  ],
  controllers: [WorkflowGuardController],
  providers: [WorkflowGuardService, ProjectRepository],
  exports: [WorkflowGuardService],
})
export class WorkflowGuardModule {}
