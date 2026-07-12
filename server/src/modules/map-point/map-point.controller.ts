/**
 * 地图地点 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MapPointService } from './map-point.service';
import { CreateMapPointDto, UpdateMapPointDto } from './dto/map-point.dto';
import { VectorIndexService } from '../../rag/vector-index.service';

@ApiTags('map-point')
@Controller('projects/:projectId/map-points')
export class MapPointController {
  constructor(private readonly service: MapPointService, private readonly vectorIndex: VectorIndexService) {}

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateMapPointDto) {
    const result = this.service.create(projectId, dto); await this.indexLocation(projectId, result.id); return result;
  }

  @Get()
  findAll(@Param('projectId') projectId: string, @Query('search') search?: string) {
    if (search) return this.service.search(projectId, search);
    return this.service.findByProjectId(projectId);
  }

  @Get('tree')
  getTree(@Param('projectId') projectId: string) {
    return this.service.getTree(projectId);
  }

  @Get('by-level/:level')
  findByLevel(@Param('projectId') projectId: string, @Param('level') level: string) {
    return this.service.findByLevel(projectId, level);
  }

  @Get('by-parent/:parentId')
  findByParentId(@Param('projectId') projectId: string, @Param('parentId') parentId: string) {
    return this.service.findByParentId(projectId, parentId);
  }

  @Get('by-character/:characterId')
  findByCharacter(@Param('projectId') projectId: string, @Param('characterId') characterId: string) {
    return this.service.findByCharacter(projectId, characterId);
  }

  @Get('by-chapter/:chapterId')
  findByChapter(@Param('projectId') projectId: string, @Param('chapterId') chapterId: string) {
    return this.service.findByChapter(projectId, chapterId);
  }

  @Get(':id/profile') getProfile(@Param('projectId') projectId: string, @Param('id') id: string) { return this.service.getProfile(projectId, id); }
  @Put(':id/profile') async updateProfile(@Param('projectId') projectId: string, @Param('id') id: string, @Body() body: Record<string, unknown>) { const result = this.service.updateProfile(projectId, id, body); await this.indexLocation(projectId, id); return result; }
  @Get(':id/writing-summary') getWritingSummary(@Param('projectId') projectId: string, @Param('id') id: string) { return this.service.getWritingSummary(projectId, id); }
  @Post('consistency-check') checkConsistency(@Param('projectId') projectId: string, @Body() body: { content?: string }) { return { locationConsistency: this.service.checkConsistency(projectId, body.content || '') }; }
  @Get(':id/relations') getRelations(@Param('projectId') projectId: string, @Param('id') id: string) { return this.service.getRelations(projectId, id); }
  @Put(':id/relations') async updateRelations(@Param('projectId') projectId: string, @Param('id') id: string, @Body() body: { relations?: any[] }) { const relations = this.service.updateRelations(projectId, id, body.relations || []); await this.indexLocation(projectId, id); return { relations }; }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMapPointDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  private async indexLocation(projectId: string, id: string) { try { const summary = this.service.getWritingSummary(projectId, id).summary; await this.vectorIndex.indexChunks(VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, [{ chunk: { id: `map-point:${id}`, text: summary, docType: 'location_profile' as any, metadata: { chunkIndex: 0 } }, vector: [0] }]); } catch {} }
}
