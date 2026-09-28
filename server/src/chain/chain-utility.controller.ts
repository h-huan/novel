import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChainController } from './chain.controller';

/** Focused HTTP adapter for import/export, diagnostics, analysis and supporting utilities. */
@ApiTags('chain')
@Controller('chain')
export class ChainUtilityController {
  constructor(private readonly chain: ChainController) {}

  @Post('export-novel')
  exportNovel(@Body() dto: Parameters<ChainController['exportNovel']>[0]) {
    return this.chain.exportNovel(dto);
  }

  @Post('import-novel')
  importNovel(@Body() dto: Parameters<ChainController['importNovel']>[0]) {
    return this.chain.importNovel(dto);
  }

  @Post('export-incremental')
  exportIncremental(@Body() dto: Parameters<ChainController['exportIncremental']>[0]) {
    return this.chain.exportIncremental(dto);
  }

  @Post('sensitive/ai-context-detect')
  aiContextDetect(@Body() dto: Parameters<ChainController['aiContextDetect']>[0]) {
    return this.chain.aiContextDetect(dto);
  }

  @Get('sensitive/platforms')
  getPlatformConfigs() {
    return this.chain.getPlatformConfigs();
  }

  @Post('news-rss')
  fetchNewsRss(@Body() dto: Parameters<ChainController['fetchNewsRss']>[0]) {
    return this.chain.fetchNewsRss(dto);
  }

  @Post('era-check')
  eraCheck(@Body() dto: Parameters<ChainController['eraCheck']>[0]) {
    return this.chain.eraCheck(dto);
  }

  @Post('ai-deconstruct')
  aiDeconstruct(@Body() dto: Parameters<ChainController['aiDeconstruct']>[0]) {
    return this.chain.aiDeconstruct(dto);
  }

  @Post('schedule-check')
  scheduleCheck(@Body() dto: Parameters<ChainController['scheduleCheck']>[0]) {
    return this.chain.scheduleCheck(dto);
  }

  @Post('import-doc')
  importDoc(@Body() dto: Parameters<ChainController['importDoc']>[0]) {
    return this.chain.importDoc(dto);
  }

  @Post('dashboard-stats')
  dashboardStats(@Body() dto: Parameters<ChainController['dashboardStats']>[0]) {
    return this.chain.dashboardStats(dto);
  }

  @Get('memory-health')
  memoryHealth() {
    return this.chain.memoryHealth();
  }
}
