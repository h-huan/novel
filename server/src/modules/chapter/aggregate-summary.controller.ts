import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';

@Controller('projects/:projectId/aggregate-summaries')
export class AggregateSummaryController {
  constructor(private readonly derivedData: ChapterDerivedDataSyncService) {}

  @Get()
  list(@Param('projectId') projectId: string) { return this.derivedData.getAggregateSummaries(projectId); }

  @Post('rebuild')
  rebuild(@Param('projectId') projectId: string, @Body() body: { scope: 'volume' | 'novel' | 'stale'; volumeIndex?: number }) {
    if (!body || !['volume', 'novel', 'stale'].includes(body.scope)) throw new BadRequestException('scope must be volume, novel, or stale');
    if (body.scope === 'volume') {
      if (!Number.isInteger(body.volumeIndex)) throw new BadRequestException('volumeIndex must be an integer when scope is volume');
      return this.derivedData.rebuildVolumeSummary(projectId, body.volumeIndex!);
    }
    if (body.volumeIndex !== undefined && !Number.isInteger(body.volumeIndex)) throw new BadRequestException('volumeIndex must be an integer');
    if (body.scope === 'novel') return this.derivedData.rebuildNovelSummary(projectId);
    return body.volumeIndex === undefined
      ? this.derivedData.rebuildStaleAggregateSummaries(projectId)
      : this.derivedData.rebuildStaleAggregateSummaries(projectId, body.volumeIndex);
  }
}
