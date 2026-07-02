/**
 * 导入导出 Module
 */
import { Module } from '@nestjs/common';
import { ImportExportController } from './import-export.controller';
import { ImportEngineService } from './import-engine.service';
import { ExportEngineService } from './export-engine.service';
import { OptimizationMarkService } from './optimization-mark.service';
import { DatabaseService } from '../../database/database.service';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { WorldSettingRepository } from '../../database/repositories/world-setting.repository';
import { OutlineRepository } from '../../database/repositories/outline.repository';
import { ForeshadowingRepository } from '../../database/repositories/foreshadowing.repository';

@Module({
  controllers: [ImportExportController],
  providers: [
    ImportEngineService,
    ExportEngineService,
    OptimizationMarkService,
    DatabaseService,
    ProjectRepository,
    ChapterRepository,
    CharacterRepository,
    WorldSettingRepository,
    OutlineRepository,
    ForeshadowingRepository,
  ],
  exports: [ImportEngineService, ExportEngineService, OptimizationMarkService],
})
export class ImportExportModule {}
