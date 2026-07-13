import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';

@Controller('projects/:projectId/aggregate-summaries')
export class AggregateSummaryController {
  constructor(private readonly derivedData: ChapterDerivedDataSyncService) {}

  @Get()
  list(@Param('projectId') projectId: string) { return this.derivedData.getAggregateSummaries(projectId); }

  @Post('rebuild')
  rebuild(@Param('projectId') projectId: string, @Body() body: { scope: 'volume' | 'novel' | 'stale'; volumeIndex?: number }) {
    if (body.scope === 'volume') return this.derivedData.rebuildVolumeSummary(projectId, Number(body.volumeIndex));
    if (body.scope === 'novel') return this.derivedData.rebuildNovelSummary(projectId);
    return this.derivedData.rebuildStaleAggregateSummaries(projectId, body.volumeIndex);
  }
}
