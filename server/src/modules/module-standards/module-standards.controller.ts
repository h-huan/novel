/**
 * 模块执行规则只读视图。
 *
 * 规范只维护在仓库根 QUALITY_EXECUTION.md；这里展示代码侧可执行镜像。
 * 运行时不允许通过模型或接口改写 hard rules，避免不同机器因历史样本不同而执行不同标准。
 */
import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ModuleStandardsService } from './module-standards.service';

@ApiTags('module-standards')
@Controller('module-standards')
export class ModuleStandardsController {
  constructor(private readonly service: ModuleStandardsService) {}

  @Get()
  list() {
    return { standards: this.service.list() };
  }

  @Get('status')
  status() {
    return this.service.status();
  }

  @Get(':key')
  one(@Param('key') key: string) {
    const standard = this.service.get(key);
    return standard ? { standard } : { error: 'not found', standard: null };
  }
}
