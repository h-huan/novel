/**
 * 功能模块执行标准只读视图。
 * 唯一规范文档位于仓库根 QUALITY_EXECUTION.md；本模块不依赖 LLM、指标或数据库标准表。
 */
import { Module } from '@nestjs/common';
import { ModuleStandardsService } from './module-standards.service';
import { ModuleStandardsController } from './module-standards.controller';

@Module({
  controllers: [ModuleStandardsController],
  providers: [ModuleStandardsService],
  exports: [ModuleStandardsService],
})
export class ModuleStandardsModule {}
