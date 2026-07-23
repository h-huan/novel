/**
 * 伏笔 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ForeshadowingService } from './foreshadowing.service';
import { CreateForeshadowingDto, UpdateForeshadowingDto, RecoverForeshadowingDto } from './dto/foreshadowing.dto';
import { VectorIndexService } from '../../rag/vector-index.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { CanonicalSyncStateService } from '../../rag/canonical-sync-state.service';

@ApiTags('foreshadowing')
@Controller('projects/:projectId/foreshadowings')
export class ForeshadowingController {
  constructor(private readonly service: ForeshadowingService, private readonly vectorIndex: VectorIndexService, private readonly embedding: EmbeddingService, private readonly syncStates: CanonicalSyncStateService) {}

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateForeshadowingDto) {
    const result = this.service.create(projectId, dto); const sync = await this.index(projectId, result); return { ...result, sync };
  }

  @Get()
  findAll(@Param('projectId') projectId: string, @Query('status') status?: string) {
    return this.service.findByProjectId(projectId, status);
  }

  @Get('stats')
  getStats(@Param('projectId') projectId: string) {
    return this.service.getStats(projectId);
  }

  @Get('warnings')
  getOverdueWarnings(
    @Param('projectId') projectId: string,
    @Query('currentChapterIndex') currentChapterIndex: string,
  ) {
    return this.service.getOverdueWarnings(projectId, parseInt(currentChapterIndex, 10) || 1);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  async update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateForeshadowingDto) {
    const result = this.service.update(id, dto); const sync = await this.index(projectId, result); return { ...result, sync };
  }

  @Delete(':id')
  async remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    const result = this.service.remove(id);
    const sync = await this.syncStates.run(projectId, 'foreshadowing', id, () => this.vectorIndex.deleteChunksStrict(VectorIndexService.COLLECTIONS.FORESHADOWINGS, [`foreshadowing:${id}`]));
    return { ...result, sync };
  }

  @Post(':id/activate')
  async activate(@Param('projectId') projectId: string, @Param('id') id: string) {
    const result = this.service.activate(id); const sync = await this.index(projectId, result); return { ...result, sync };
  }

  @Post(':id/recover')
  async recover(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: RecoverForeshadowingDto) {
    const result = this.service.recover(id, dto); const sync = await this.index(projectId, result); return { ...result, sync };
  }

  @Post(':id/remind')
  async remind(@Param('projectId') projectId: string, @Param('id') id: string) {
    const result = this.service.remind(id); const sync = await this.index(projectId, result); return { ...result, sync };
  }

  @Post(':id/cancel')
  async cancel(@Param('projectId') projectId: string, @Param('id') id: string) {
    const result = this.service.cancel(id); const sync = await this.index(projectId, result); return { ...result, sync };
  }

  private async index(projectId: string, item: any) {
    return this.syncStates.run(projectId, 'foreshadowing', item.id, async () => {
      const text = `${item.content || ''}\nstatus:${item.status || ''}\nburied:${item.buriedChapterIndex || ''}\nrecovery-window:${item.recoveryWindowStart || item.plannedRecoveryChapterIndex || ''}-${item.recoveryWindowEnd || item.plannedRecoveryChapterIndex || ''}\nevidence:${item.evidenceText || ''}\nrisk:${item.riskLevel || ''}\ncondition:${item.recoveryCondition || ''}\npayoff:${item.payoffDescription || ''}`;
      const [vector] = await this.embedding.embed([text]);
      await this.vectorIndex.indexChunksStrict(VectorIndexService.COLLECTIONS.FORESHADOWINGS, [{ chunk: { id: `foreshadowing:${item.id}`, text, docType: 'foreshadowing', metadata: { chunkIndex: 0, parentDocId: item.id } }, vector }]);
    });
  }
}
