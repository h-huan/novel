/**
 * 大纲 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OutlineService } from './outline.service';
import {
  ContinueOutlineDto,
  CreateOutlineDto,
  InsertOutlineDto,
  MergeOutlineDto,
  MoveOutlineDto,
  MoveOutlineOrderDto,
  RecommendOutlinePlanDto,
  ReorderChildrenDto,
  SplitOutlineDto,
  UpdateOutlineDto,
} from './dto/outline.dto';
import { VectorIndexService } from '../../rag/vector-index.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { CanonicalSyncStateService } from '../../rag/canonical-sync-state.service';

@ApiTags('outline')
@Controller('projects/:projectId/outlines')
export class OutlineController {
  constructor(
    private readonly service: OutlineService,
    private readonly vectorIndex: VectorIndexService,
    private readonly embedding: EmbeddingService,
    private readonly syncStates: CanonicalSyncStateService,
  ) {}

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateOutlineDto) {
    const result = this.service.create(projectId, dto);
    const sync = await this.indexOutline(projectId, result);
    return { ...result, sync };
  }

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.service.findByProjectId(projectId);
  }

  @Get('tree')
  getTree(@Param('projectId') projectId: string) {
    return this.service.getTree(projectId);
  }

  @Post('ensure-writable-chapters')
  ensureWritableChapters(@Param('projectId') projectId: string) {
    return this.service.ensureWritableChapters(projectId);
  }

  @Post('planning/recommend')
  recommendPlan(@Param('projectId') projectId: string, @Body() dto: RecommendOutlinePlanDto) {
    return this.service.recommendPlan(projectId, dto);
  }

  @Post('continue')
  continueCreate(@Param('projectId') projectId: string, @Body() dto: ContinueOutlineDto) {
    return this.service.continueCreate(projectId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/children')
  findChildren(@Param('id') id: string) {
    return this.service.findChildren(id);
  }

  @Put(':id')
  async update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateOutlineDto) {
    const result = this.service.update(id, dto);
    const sync = await this.indexOutline(projectId, result);
    return { ...result, sync };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Param('projectId') projectId: string) {
    // 检查章节是否锁定
    const existing = (this.service as any).repo?.findById(id);
    if (existing?.status === 'locked') {
      throw new BadRequestException('已锁定章节不可删除');
    }
    const result = this.service.remove(id);
    const sync = await this.syncStates.run(projectId, 'outline', id, () =>
      this.vectorIndex.deleteChunksStrict(VectorIndexService.COLLECTIONS.CHAPTERS_ROLLING, [id]));
    return { ...result, sync };
  }

  @Post(':id/split')
  split(@Param('id') id: string, @Body() dto: SplitOutlineDto) {
    return this.service.split(id, dto);
  }

  @Post(':id/insert')
  insertAdjacent(@Param('id') id: string, @Body() dto: InsertOutlineDto) {
    return this.service.insertAdjacent(id, dto);
  }

  @Post(':id/merge-next')
  mergeNext(@Param('id') id: string, @Body() dto: MergeOutlineDto) {
    return this.service.mergeNext(id, dto.targetWords);
  }

  @Post(':id/move-order')
  moveOrder(@Param('id') id: string, @Body() dto: MoveOutlineOrderDto) {
    return this.service.moveOrder(id, dto.direction);
  }

  @Post(':id/move-to-volume')
  moveToVolume(@Param('id') id: string, @Body() dto: { targetVolumeId: string }) {
    return this.service.moveToVolume(id, dto.targetVolumeId);
  }

  @Post(':id/move')
  move(@Param('id') id: string, @Body() dto: MoveOutlineDto) {
    return this.service.move(id, dto);
  }

  @Post(':id/reorder')
  reorderChildren(@Param('id') id: string, @Body() dto: ReorderChildrenDto) {
    return this.service.reorderChildren(id, dto);
  }

  private async indexOutline(projectId: string, outline: any) {
    return this.syncStates.run(projectId, 'outline', outline.id, async () => {
      const text = [outline.title, outline.content, JSON.stringify(outline.detail || {}), JSON.stringify(outline.attention || {}), JSON.stringify(outline.plan || {})]
        .filter(Boolean).join('\n');
      const [vector] = await this.embedding.embed([text]);
      await this.vectorIndex.indexChunksStrict(VectorIndexService.COLLECTIONS.CHAPTERS_ROLLING, [{
        chunk: { id: outline.id, text, docType: 'outline', metadata: { chunkIndex: 0, parentDocId: outline.parentId || undefined } },
        vector,
      }]);
    });
  }
}
