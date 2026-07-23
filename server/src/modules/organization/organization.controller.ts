/**
 * 组织/势力 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { VectorIndexService } from '../../rag/vector-index.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { CanonicalSyncStateService } from '../../rag/canonical-sync-state.service';

@ApiTags('organization')
@Controller('projects/:projectId/organizations')
export class OrganizationController {
  constructor(
    private readonly service: OrganizationService,
    private readonly vectorIndex: VectorIndexService,
    private readonly embedding: EmbeddingService,
    private readonly syncStates: CanonicalSyncStateService,
  ) {}

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateOrganizationDto) {
    const result = this.service.create(projectId, dto);
    const sync = await this.indexOrganization(projectId, result);
    return { ...result, sync };
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

  @Get('by-parent/:parentId')
  findByParentId(@Param('projectId') projectId: string, @Param('parentId') parentId: string) {
    return this.service.findByParentId(projectId, parentId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  async update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    const result = this.service.update(id, dto);
    const sync = await this.indexOrganization(projectId, result);
    return { ...result, sync };
  }

  @Delete(':id')
  async remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    const result = this.service.remove(id);
    const sync = await this.syncStates.run(projectId, 'organization', id, () =>
      this.vectorIndex.deleteChunksStrict(VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, [`organization:${id}`]));
    return { ...result, sync };
  }

  private indexOrganization(projectId: string, organization: any) {
    return this.syncStates.run(projectId, 'organization', organization.id, async () => {
      const text = [organization.name, organization.type, organization.level, organization.description]
        .filter(Boolean).join('\n');
      const [vector] = await this.embedding.embed([text]);
      await this.vectorIndex.indexChunksStrict(VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, [{
        chunk: {
          id: `organization:${organization.id}`,
          text,
          docType: 'world_setting',
          metadata: { chunkIndex: 0, parentDocId: organization.id },
        },
        vector,
      }]);
    });
  }
}
