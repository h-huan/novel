/**
 * 功能模块标准库 Controller
 *   GET  /module-standards                     当前生效标准（最新标准页）
 *   GET  /module-standards/history             发展历程（历史版本，只读回顾）
 *   GET  /module-standards/status              归纳运行状态（首页"正在归纳"弹框）
 *   GET  /module-standards/:key                单个模块当前标准
 *   POST /module-standards/:key/summarize       手动触发某模块归纳
 */
import { Controller, Get, Post, Param, Query } from '@nestjs/common';
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

  @Get('history')
  history(@Query('moduleKey') moduleKey?: string) {
    return { versions: this.service.versions(moduleKey || undefined) };
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

  @Post(':key/summarize')
  async summarize(@Param('key') key: string, @Query('force') force?: string) {
    // 默认仅当该模块被检测到"有新变化(dirty)"时才允许归纳；force=true 用于强制重归纳
    const forceFlag = force === '1' || force === 'true';
    return this.service.summarizeModule(key, 'manual', forceFlag);
  }
}
